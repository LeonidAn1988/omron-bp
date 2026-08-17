/**
 * Границы между переносимым ядром и платформой.
 *
 * Всё, что ядро умеет само — разбор пакетов прибора, классификация, статистика,
 * экспорт — не знает ни про браузер, ни про React. Платформа даёт ровно четыре
 * вещи, описанные ниже, и при переезде на Android, iOS, macOS и Windows меняются
 * только их реализации.
 *
 * Интерфейсы намеренно узкие: это ровно то, чем пользуется приложение, а не
 * пересказ Web Bluetooth или IndexedDB. Иначе порт перестаёт быть портом.
 */

import type { Measurement, Medicine, Settings } from '../types'

// ── Bluetooth ──────────────────────────────────────────────────────────────

/** Характеристика GATT в объёме, который нужен протоколу Omron. */
export interface GattCharacteristic {
  readonly uuid: string
  /**
   * Запись с подтверждением. Протокол Omron синхронный: следующий кусок пакета
   * отправляется только после подтверждения предыдущего, поэтому запись без
   * подтверждения здесь не нужна и намеренно не предусмотрена.
   */
  writeValue(data: Uint8Array): Promise<void>
  startNotifications(onValue: (data: Uint8Array) => void): Promise<void>
  stopNotifications(): Promise<void>
}

export interface GattCharacteristicProperties {
  read: boolean
  write: boolean
  writeWithoutResponse: boolean
  notify: boolean
  indicate: boolean
}

export interface GattService {
  getCharacteristic(uuid: string): Promise<GattCharacteristic>
  /** Для диагностики: перечислить, что прибор на самом деле предоставляет. */
  listCharacteristics(): Promise<{ characteristic: GattCharacteristic; properties: GattCharacteristicProperties }[]>
}

export interface GattDevice {
  readonly id: string
  readonly name: string | null
  /** Подключается и отдаёт нужный сервис. Сервисы резолвятся не мгновенно — ждать внутри. */
  connect(serviceUuid: string): Promise<GattService>
  disconnect(): void
}

export interface DevicePickerOptions {
  serviceUuid: string
  /** Имена, под которыми прибор рекламируется в эфире. */
  namePrefixes: string[]
  /** Показать все устройства, а не только подходящие под фильтры. */
  showAll: boolean
}

export interface BluetoothPort {
  /** Есть ли вообще такая возможность на этой платформе. */
  isSupported(): boolean
  /** Включён ли радиомодуль. null — платформа не отвечает на этот вопрос. */
  isEnabled(): Promise<boolean | null>
  /**
   * Открывает выбор устройства. Обязан вызываться из обработчика жеста.
   *
   * Окно рисует платформа, и системным оно не является нигде: в браузере его
   * показывает сам браузер, на Android — плагин. Проверено на устройстве,
   * поэтому в текстах интерфейса «системное окно» заменено на «список».
   */
  pickDevice(options: DevicePickerOptions): Promise<GattDevice>
  /** Ранее разрешённые устройства — чтобы не спрашивать выбор каждый раз. */
  knownDevices(serviceUuid: string): Promise<GattDevice[]>
  /** Отличить отказ пользователя от настоящей ошибки. */
  isCancellation(error: unknown): boolean
}

// ── хранилище ──────────────────────────────────────────────────────────────

export interface StoragePort {
  allMeasurements(): Promise<Measurement[]>
  putMeasurements(items: Measurement[]): Promise<void>
  deleteMeasurement(id: string): Promise<void>
  clearMeasurements(): Promise<void>
  loadSettings(): Promise<Partial<Settings> | undefined>
  saveSettings(settings: Settings): Promise<void>

  allMedicines(): Promise<Medicine[]>
  putMedicine(item: Medicine): Promise<void>
  deleteMedicine(id: string): Promise<void>

  /**
   * Попросить платформу не вытеснять наши данные.
   *
   * Браузер вправе очистить хранилище сайта, когда на устройстве кончается
   * место, а Safari стирает его сам после недели без заходов. Для дневника
   * измерений это тихая потеря, поэтому разрешение спрашивается сразу.
   *
   * Возвращает, действует ли защита. `null` — платформа такого не умеет и
   * вопрос к ней неприменим (на нативной, например, данные и так не вытесняются).
   */
  requestDurability(): Promise<boolean | null>
}

// ── файлы ──────────────────────────────────────────────────────────────────

export interface FilePort {
  /**
   * Отдать пользователю файл: скачиванием, диалогом сохранения или «поделиться».
   *
   * `false` — файл до человека не дошёл: он закрыл окно, отменил сохранение.
   * Возврат обязателен именно потому, что на телефоне «сохранить» проходит
   * через системное окно, от которого можно отказаться. Считать такую попытку
   * успешной — значит записать в дневник, что копия сделана, когда её нет.
   */
  save(filename: string, content: string, mime: string): Promise<boolean>

  /**
   * Можно ли передать файл в другое приложение — в облако, мессенджер, почту.
   *
   * На телефоне это единственный способ вынести копию за пределы устройства:
   * скачанный файл остаётся в той же памяти, что и сам дневник, и пропадает
   * вместе с телефоном.
   */
  canShare(): boolean
  /** Системное «поделиться». `false` — пользователь закрыл окно. */
  share(filename: string, content: string, mime: string): Promise<boolean>
}

/**
 * Автоматические резервные копии в один и тот же файл.
 *
 * Отдельный порт, а не метод у FilePort: «отдать файл» это разовое действие по
 * нажатию, а здесь долгоживущая цель, в которую приложение пишет само и без
 * спроса. Не всякая платформа так умеет — в вебе это есть в Chrome на
 * компьютере, но не в Safari и не в мобильном Chrome, поэтому `isSupported`.
 */
export interface BackupPort {
  isSupported(): boolean
  /** Спросить у пользователя файл для копий. Обязан вызываться из обработчика жеста. */
  choose(suggestedName: string): Promise<string | null>
  /** Имя ранее выбранного файла, если он выбран и доступ к нему цел. */
  target(): Promise<string | null>
  /** Записать копию. `false` — цель пропала или доступ отозван. */
  write(content: string): Promise<boolean>
  /** Забыть цель — копии перестают делаться сами. */
  forget(): Promise<void>
}

// ── реестр ─────────────────────────────────────────────────────────────────

export interface Platform {
  /**
   * Где приложение выполняется — сайтом в браузере или приложением на телефоне.
   *
   * Нужно интерфейсу и только ему, для формулировок. «Записи есть только в этом
   * браузере», «добавьте на домашний экран», «очистка истории браузера их
   * удалит» — в установленном приложении всё это неправда и сбивает с толку, а
   * правда там другая: данные исчезают при «Очистить данные» и при удалении
   * приложения.
   *
   * Ядру это поле не нужно и не должно понадобиться: любое поведение,
   * зависящее от платформы, обязано жить за портами, а не за проверкой вида.
   */
  kind: 'web' | 'native'

  bluetooth: BluetoothPort
  storage: StoragePort
  files: FilePort
  backup: BackupPort
}

let current: Platform | null = null

export function installPlatform(platform: Platform) {
  current = platform
}

export function platform(): Platform {
  if (!current) {
    throw new Error('Платформа не установлена: вызовите installPlatform() до обращения к портам')
  }
  return current
}
