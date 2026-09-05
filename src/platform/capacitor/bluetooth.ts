/**
 * Реализация BluetoothPort поверх нативного BLE на Android.
 *
 * Web Bluetooth внутри WebView не существует — ни в Capacitor, ни в Cordova, ни
 * в любой другой обёртке: у WebView нет ни диалога выбора устройства, ни
 * владельца разрешения. Поэтому здесь нативный плагин, а ядро и протокол
 * остаются прежними.
 *
 * Главная забота этого файла — **строгая последовательность операций**. У
 * плагина известны гонки при параллельных вызовах: колбэк снимается позже, чем
 * стартует следующая команда, и операция зависает навсегда (issues #64, #419).
 * Протокол Omron и так синхронный, но полагаться на это как на случайность
 * нельзя, поэтому все обращения к плагину проходят через общую очередь.
 */

import { BleClient, type BleService } from '@capacitor-community/bluetooth-le'
import type {
  BluetoothPort,
  DevicePickerOptions,
  GattCharacteristic,
  GattCharacteristicProperties,
  GattDevice,
  GattService,
} from '../ports'

/**
 * Общая очередь на все обращения к плагину.
 *
 * Не мьютекс с захватом и освобождением, а цепочка обещаний: каждая следующая
 * операция пристраивается в хвост предыдущей. Ошибка одной не рвёт цепочку —
 * иначе одна неудачная запись заблокировала бы всё дальнейшее общение с
 * прибором до перезапуска приложения.
 */
let queue: Promise<unknown> = Promise.resolve()

function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work)
  queue = result.catch(() => undefined)
  return result
}

/** Плагин требует инициализации до первого обращения; делаем это один раз. */
let ready: Promise<void> | null = null

function initialize(): Promise<void> {
  if (!ready) {
    ready = BleClient.initialize({
      // Мы не выводим местоположение из результатов сканирования, и говорим об
      // этом системе прямо. Иначе на Android 12+ у приложения-дневника
      // запрашивалось бы разрешение на геолокацию — это пугает и вызывает отказ.
      androidNeverForLocation: true,
    }).catch((error) => {
      // Инициализация могла не пройти из-за отказа в разрешении. Сбрасываем,
      // чтобы следующая попытка спросила заново, а не считала себя готовой.
      ready = null
      throw error
    })
  }
  return ready
}

/**
 * Устройства, которые человек уже выбирал.
 *
 * В вебе браузер помнил выданные разрешения сам, и `getDevices()` возвращал их
 * без нашего участия. Плагин так не умеет: `getDevices(ids)` принимает список
 * идентификаторов, который обязаны хранить мы. На Android идентификатор — это
 * MAC-адрес прибора.
 *
 * Хранится в localStorage, а не в основном хранилище: это не данные дневника, а
 * настройка соединения, и терять её не жалко — в худшем случае человек выберет
 * прибор из списка заново.
 */
const KNOWN_KEY = 'omron.known-devices'

function loadKnown(): { id: string; name: string | null }[] {
  try {
    const raw = localStorage.getItem(KNOWN_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is { id: string; name: string | null } =>
        !!item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string',
    )
  } catch {
    return []
  }
}

function remember(id: string, name: string | null) {
  const known = loadKnown().filter((item) => item.id !== id)
  known.unshift({ id, name })
  try {
    localStorage.setItem(KNOWN_KEY, JSON.stringify(known.slice(0, 5)))
  } catch {
    // Память браузера могла кончиться. Забыть устройство не смертельно.
  }
}

/** DataView поверх собственного буфера: окно в чужой буфер отдавать в GATT нельзя. */
function toView(bytes: Uint8Array): DataView {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new DataView(buffer)
}

const fromView = (view: DataView): Uint8Array =>
  new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))

class CapCharacteristic implements GattCharacteristic {
  constructor(
    private readonly deviceId: string,
    private readonly service: string,
    readonly uuid: string,
  ) {}

  writeValue(data: Uint8Array): Promise<void> {
    // Именно `write`, а не `writeWithoutResponse`: протокол Omron ждёт
    // подтверждения каждого куска перед отправкой следующего.
    return serial(() => BleClient.write(this.deviceId, this.service, this.uuid, toView(data)))
  }

  startNotifications(onValue: (data: Uint8Array) => void): Promise<void> {
    return serial(() =>
      BleClient.startNotifications(this.deviceId, this.service, this.uuid, (value) => onValue(fromView(value))),
    )
  }

  stopNotifications(): Promise<void> {
    return serial(async () => {
      try {
        await BleClient.stopNotifications(this.deviceId, this.service, this.uuid)
      } catch {
        // Прибор мог отключиться сам — это не повод ронять выгрузку.
      }
    })
  }
}

class CapService implements GattService {
  private readonly cache = new Map<string, CapCharacteristic>()

  constructor(
    private readonly deviceId: string,
    private readonly service: BleService,
  ) {}

  /**
   * Поиск в уже полученном описании сервиса — **не обращение к прибору**.
   *
   * Протокол запрашивает девять характеристик подряд через `Promise.all`, и в
   * вебе каждый такой вызов шёл в GATT. Здесь всё описание получено одним
   * `getServices()` при подключении, поэтому параллельные запросы безопасны:
   * они не доходят до радиомодуля.
   */
  async getCharacteristic(uuid: string): Promise<GattCharacteristic> {
    const key = uuid.toLowerCase()
    const cached = this.cache.get(key)
    if (cached) return cached

    const found = this.service.characteristics.find((item) => item.uuid.toLowerCase() === key)
    if (!found) throw new Error(`Прибор не отдаёт характеристику ${uuid}`)

    const wrapped = new CapCharacteristic(this.deviceId, this.service.uuid, found.uuid)
    this.cache.set(key, wrapped)
    return wrapped
  }

  async listCharacteristics(): Promise<
    { characteristic: GattCharacteristic; properties: GattCharacteristicProperties }[]
  > {
    return this.service.characteristics.map((item) => ({
      characteristic: new CapCharacteristic(this.deviceId, this.service.uuid, item.uuid),
      properties: {
        read: item.properties.read,
        write: item.properties.write,
        writeWithoutResponse: item.properties.writeWithoutResponse,
        notify: item.properties.notify,
        indicate: item.properties.indicate,
      },
    }))
  }
}

class CapDevice implements GattDevice {
  constructor(
    readonly id: string,
    readonly name: string | null,
  ) {}

  /**
   * Подключение в два шага: соединиться, затем прочитать описание сервисов.
   *
   * В Web Bluetooth это был один вызов `getPrimaryService`. У плагина
   * `connect()` не принимает сервис вовсе, а описание отдаёт отдельный
   * `getServices()`.
   */
  async connect(serviceUuid: string): Promise<GattService> {
    await initialize()
    const wanted = serviceUuid.toLowerCase()

    return serial(async () => {
      await BleClient.connect(this.id)
      remember(this.id, this.name)

      // Сервисы после соединения появляются не мгновенно — тот же запас на
      // повтор, что был в веб-реализации.
      let services: BleService[] = []
      for (let attempt = 0; attempt < 10; attempt++) {
        services = await BleClient.getServices(this.id)
        const found = services.find((item) => item.uuid.toLowerCase() === wanted)
        if (found) return new CapService(this.id, found)
        await new Promise((resolve) => setTimeout(resolve, 250))
      }

      const seen = services.map((item) => item.uuid).join(', ') || 'ни одного'
      throw new Error(`У устройства нет сервиса ${serviceUuid}. Найдены: ${seen}`)
    })
  }

  disconnect() {
    // Порт объявляет разрыв синхронным, у плагина он асинхронный. Ставим в ту же
    // очередь и не ждём: разрывать соединение в обход очереди опасно — можно
    // оборвать незавершённую запись.
    void serial(() => BleClient.disconnect(this.id)).catch(() => undefined)
  }
}

export const capacitorBluetooth: BluetoothPort = {
  isSupported() {
    return true
  },

  /**
   * Включён ли радиомодуль.
   *
   * Тонкое место: `initialize()` на Android заодно **спрашивает разрешение** на
   * устройства поблизости, а вызывается этот метод при открытии экрана
   * «Прибор» — то есть системное окно всплывает само, без нажатия, ещё до того
   * как человек собрался что-то подключать.
   *
   * Терпимо и даже удобно: разрешение всё равно понадобится через секунду, а
   * спросить заранее лучше, чем прервать выбор устройства. Но отказ нельзя
   * путать с «плагин не ответил»: у Android на приложение всего два показа
   * этого окна, после второго отказа система закрепляет запрет насовсем, и
   * человеку остаётся только идти в настройки. Поэтому отказ различается и
   * отдаётся наружу как `false` — радиомодуль в этом состоянии для нас
   * действительно недоступен, и экран покажет предупреждение вместо тишины.
   */
  async isEnabled() {
    try {
      await initialize()
      return await BleClient.isEnabled()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/permission denied/i.test(message)) return false
      // Всё прочее — плагин не поднялся. Честнее сказать «не знаю», чем «выключен».
      return null
    }
  },

  /**
   * Выбор устройства.
   *
   * Два отличия от веба, оба видны человеку:
   *
   * 1. Диалог рисует сам плагин, а не система. Системного выбора BLE в Android
   *    не существует вовсе — Chrome тоже рисует свой.
   * 2. Фильтровать можно **либо** по сервису, **либо** по одному префиксу
   *    имени: плагин принимает `namePrefix` строкой, а не списком. Веб-версия
   *    фильтровала по нескольким именам сразу. Поэтому здесь фильтр по сервису,
   *    а перечень имён остаётся запасным путём: если прибор не объявляет свой
   *    сервис в эфире, он не найдётся, и человеку нужно нажать «показать все».
   */
  /**
   * Искать прибор по тому, что он объявляет в эфире, а не по рабочему сервису.
   *
   * Прежняя версия фильтровала по `serviceUuid` — фирменному сервису Omron, — и
   * не находила ровно ничего: тонометр его в рекламном пакете не объявляет.
   * Человек видел пустой список, нажимал «показать все» и получал восемь
   * десятков безымянных MAC-адресов. Проверено на живом RS7 23 августа 2026.
   *
   * Веб-версия этим не страдала: там фильтры складываются по «или», и совпадение
   * по имени срабатывало вместо сервиса. У плагина фильтры складываются по «и»,
   * поэтому имя сюда не добавляем — иначе сузим до пустоты во второй раз.
   */
  async pickDevice({ serviceUuid, advertisedServices, namePrefixes, showAll }: DevicePickerOptions) {
    await initialize()
    const searchBy = advertisedServices?.length ? advertisedServices : [serviceUuid]
    // Рабочий сервис обязателен в необязательных: без него подключение к нему
    // после выбора запрещено.
    const optionalServices = [...new Set([serviceUuid, ...searchBy])]
    const device = await serial(() =>
      BleClient.requestDevice(
        showAll
          ? { optionalServices }
          : {
              services: searchBy,
              optionalServices,
              // Имя дополняет фильтр, только когда искать больше не по чему:
              // прибор без объявленных сервисов иначе не отличить от прочих.
              ...(searchBy.length === 1 && namePrefixes.length === 1 && !advertisedServices?.length
                ? { namePrefix: namePrefixes[0] }
                : {}),
            },
      ),
    )
    return new CapDevice(device.deviceId, device.name ?? null)
  },

  async knownDevices() {
    const known = loadKnown()
    if (known.length === 0) return []
    try {
      await initialize()
      const devices = await serial(() => BleClient.getDevices(known.map((item) => item.id)))
      return devices.map((device) => new CapDevice(device.deviceId, device.name ?? null))
    } catch {
      return []
    }
  },

  /**
   * Проверено на живом приборе 17 августа 2026: при выключенной службе
   * местоположения поиск возвращает пустоту, хотя радиомодуль включён,
   * разрешения выданы, а тонометр вещает в эфир и виден веб-версии.
   */
  async isLocationBlockingScan() {
    try {
      await initialize()
      if (!(await BleClient.isEnabled())) return false
      return !(await BleClient.isLocationEnabled())
    } catch {
      return null
    }
  },

  async openLocationSettings() {
    await BleClient.openLocationSettings()
  },

  /**
   * Отличить отказ человека от настоящей ошибки.
   *
   * Отдельного типа ошибки у плагина нет, только текст. Строка взята из его
   * исходников (`DeviceScanner.kt`): и кнопка «Отмена», и закрытие диалога
   * жестом дают одно и то же сообщение.
   *
   * Проверка нарочно узкая. Широкая ловила вторую строку плагина —
   * «Pairing request was cancelled by the user» из `Device.kt`, которой
   * отклоняется подписка при отказе от системного окна сопряжения. А это уже не
   * «человек передумал выбирать прибор», а сорвавшееся сопряжение: выгрузка
   * умирала молча, без строки в журнале и без объяснения на экране. Отказ от
   * сопряжения обязан выглядеть ошибкой, потому что дальше ничего не заработает.
   */
  isCancellation(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return /requestDevice cancelled/i.test(message)
  },
}
