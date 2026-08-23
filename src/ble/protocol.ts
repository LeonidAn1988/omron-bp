/**
 * Проприетарный BLE-протокол Omron ("legacy" транспорт с 4 каналами).
 *
 * Порт логики из omblepy (https://github.com/userx14/omblepy, MIT) на Web Bluetooth.
 * Проверено по драйверу deviceSpecific/hem-6232t.py — это и есть RS7 Intelli IT.
 *
 * Схема обмена:
 *   host -> device   команда режется на куски по 16 байт, кусок i пишется в TX_CHANNELS[i]
 *   device -> host   ответ приходит notify'ями на RX_CHANNELS[i], собирается обратно
 *
 * Формат пакета (в обе стороны):
 *   [0]      полная длина пакета в байтах
 *   [1..2]   тип пакета
 *   [3..4]   адрес в EEPROM (big-endian)
 *   [5]      количество байт данных
 *   [6..n]   данные
 *   [n..]    хвост, подобранный так, что XOR всех байт пакета == 0
 */

import type { GattCharacteristic, GattService } from '../platform/ports'

export const OMRON_SERVICE = 'ecbe3980-c9a2-11e1-b1bd-0002a5d5c51b'

/**
 * Сервис, который прибор объявляет в эфире, — стандартный «Blood Pressure».
 *
 * С рабочим `OMRON_SERVICE` он не совпадает, и это не мелочь, а ловушка: по
 * фирменному сервису идёт выгрузка памяти, но в рекламный пакет он не попадает,
 * поэтому искать прибор по нему нельзя — не найдётся ничего.
 *
 * Измерено на RS7 Intelli IT 23 августа 2026: в эфире `BLESmart_0000024400…`,
 * uuids ровно `[00001810-…]`, производитель 526 (Omron Healthcare).
 */
export const OMRON_ADVERTISED_SERVICES = ['00001810-0000-1000-8000-00805f9b34fb']

/** Каналы notify: прибор -> мы */
export const RX_CHANNELS = [
  '49123040-aee8-11e1-a74d-0002a5d5c51b',
  '4d0bf320-aee8-11e1-a0d9-0002a5d5c51b',
  '5128ce60-aee8-11e1-b84b-0002a5d5c51b',
  '560f1420-aee8-11e1-8184-0002a5d5c51b',
] as const

/** Каналы записи: мы -> прибор */
export const TX_CHANNELS = [
  'db5b55e0-aee7-11e1-965e-0002a5d5c51b',
  'e0b8a060-aee7-11e1-92f4-0002a5d5c51b',
  '0ae12b00-aee8-11e1-a192-0002a5d5c51b',
  '10e1ba60-aee8-11e1-89e5-0002a5d5c51b',
] as const

/** Характеристика разблокировки / записи ключа сопряжения */
export const UNLOCK_CHAR = 'b305b680-aee7-11e1-a730-0002a5d5c51b'

/** Ключ по умолчанию — тот же, что в omblepy, чтобы данные читались и оттуда тоже. */
export const DEFAULT_PAIRING_KEY = 'deadbeaf12341234deadbeaf12341234'

const CHANNEL_WIDTH = 16

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type Logger = (level: LogLevel, message: string) => void

export class OmronProtocolError extends Error {}

/**
 * Прибор отказался открывать память: записанный в нём ключ не совпадает с нашим.
 * Отдельный класс нужен интерфейсу — на эту ошибку он предлагает сопряжение
 * прямо в сообщении, а не оставляет пользователя искать нужную кнопку.
 *
 * Наблюдался на живом приборе: ответ `81 04` при первом подключении к RS7,
 * в котором ещё лежал ключ от Omron Connect.
 */
export class PairingRequiredError extends OmronProtocolError {
  readonly statusCode: number
  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'PairingRequiredError'
    this.statusCode = statusCode
  }
}

export function hex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function parseHexKey(input: string): Uint8Array {
  const clean = input.trim().replace(/[\s:-]/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(clean)) {
    throw new OmronProtocolError('Ключ сопряжения должен быть 32 hex-символа (16 байт)')
  }
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function xor(bytes: ArrayLike<number>): number {
  let acc = 0
  for (let i = 0; i < bytes.length; i++) acc ^= bytes[i]
  return acc
}

/** Дописывает к телу команды два хвостовых байта так, чтобы XOR всего пакета стал нулём. */
function withChecksum(body: number[]): Uint8Array {
  return Uint8Array.from([...body, 0x00, xor(body)])
}

interface RxPacket {
  type: number
  address: number
  data: Uint8Array
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Транспорт поверх подключённого GATT-сервера.
 * Один экземпляр живёт ровно столько, сколько длится одно подключение.
 */
export class OmronTransport {
  private rxChars: GattCharacteristic[] = []
  private txChars: GattCharacteristic[] = []
  private unlockChar!: GattCharacteristic

  private rxBuffers: (Uint8Array | null)[] = [null, null, null, null]
  private pendingPacket: RxPacket | null = null
  private notifyActive = false

  private unlockResponse: Uint8Array | null = null
  private unlockNotifyActive = false

  private readonly onUnlockRx = (bytes: Uint8Array) => {
    this.unlockResponse = bytes
    this.log('debug', `unlock < ${hex(bytes)}`)
  }

  constructor(
    private readonly service: GattService,
    private readonly log: Logger = () => {},
  ) {}

  static async create(service: GattService, log: Logger = () => {}) {
    const transport = new OmronTransport(service, log)
    await transport.resolveCharacteristics()
    return transport
  }

  private async resolveCharacteristics() {
    this.rxChars = await Promise.all(RX_CHANNELS.map((u) => this.service.getCharacteristic(u)))
    this.txChars = await Promise.all(TX_CHANNELS.map((u) => this.service.getCharacteristic(u)))
    this.unlockChar = await this.service.getCharacteristic(UNLOCK_CHAR)
  }

  // ── приём ────────────────────────────────────────────────────────────────

  private handleRx(index: number, bytes: Uint8Array) {
    this.rxBuffers[index] = bytes
    this.log('debug', `rx ch${index} < ${hex(bytes)}`)

    // Пакет всегда начинается с нулевого канала — без него собирать нечего.
    const head = this.rxBuffers[0]
    if (!head) return

    const packetSize = head[0]
    const channelCount = Math.ceil(packetSize / CHANNEL_WIDTH)
    for (let i = 0; i < channelCount; i++) {
      if (!this.rxBuffers[i]) return // ждём оставшиеся куски
    }

    const combined = new Uint8Array(channelCount * CHANNEL_WIDTH)
    for (let i = 0; i < channelCount; i++) combined.set(this.rxBuffers[i]!, i * CHANNEL_WIDTH)
    const packet = combined.subarray(0, packetSize)
    this.rxBuffers = [null, null, null, null]

    if (xor(packet) !== 0) {
      this.log('warn', `битая контрольная сумма в ответе: ${hex(packet)}`)
      return // не роняем сессию — вызывающий код повторит команду по таймауту
    }

    const type = (packet[1] << 8) | packet[2]
    const address = (packet[3] << 8) | packet[4]
    const declaredLength = packet[5]

    let data: Uint8Array
    if (declaredLength > packet.length - 8) {
      // Прибор сообщил больше данных, чем прислал: соответствующая область памяти пуста.
      data = new Uint8Array(declaredLength).fill(0xff)
    } else if (type === 0x8f00) {
      data = packet.subarray(6, 7) // код завершения сеанса
    } else {
      data = packet.subarray(6, 6 + declaredLength)
    }

    this.pendingPacket = { type, address, data: new Uint8Array(data) }
  }

  private async enableNotifications() {
    if (this.notifyActive) return
    for (const [index, char] of this.rxChars.entries()) {
      await char.startNotifications((bytes) => this.handleRx(index, bytes))
    }
    this.notifyActive = true
  }

  private async disableNotifications() {
    if (!this.notifyActive) return
    for (const char of this.rxChars) await char.stopNotifications()
    this.notifyActive = false
  }

  // ── передача ─────────────────────────────────────────────────────────────

  private async transceive(command: Uint8Array, timeoutMs = 1500, maxRetries = 5): Promise<RxPacket> {
    for (let attempt = 1; ; attempt++) {
      this.pendingPacket = null
      this.rxBuffers = [null, null, null, null]

      for (let i = 0; i * CHANNEL_WIDTH < command.length; i++) {
        const chunk = command.subarray(i * CHANNEL_WIDTH, (i + 1) * CHANNEL_WIDTH)
        this.log('debug', `tx ch${i} > ${hex(chunk)}`)
        await this.txChars[i].writeValue(chunk)
      }

      const deadline = Date.now() + timeoutMs
      while (!this.pendingPacket && Date.now() < deadline) await sleep(20)
      if (this.pendingPacket) return this.pendingPacket

      if (attempt >= maxRetries) {
        throw new OmronProtocolError(
          `Прибор не ответил на команду ${hex(command)} за ${maxRetries} попыток. ` +
            'Проверьте, что Bluetooth на тонометре ещё активен (он выключается сам примерно через минуту).',
        )
      }
      this.log('warn', `нет ответа, повтор ${attempt}/${maxRetries}`)
    }
  }

  // ── разблокировка и сопряжение ───────────────────────────────────────────

  private async unlockTransceive(payload: Uint8Array, timeoutMs = 3000): Promise<Uint8Array> {
    this.unlockResponse = null
    await this.unlockChar.writeValue(payload)
    const deadline = Date.now() + timeoutMs
    while (!this.unlockResponse && Date.now() < deadline) await sleep(20)
    if (!this.unlockResponse) throw new OmronProtocolError('Прибор не ответил на канале разблокировки')
    return this.unlockResponse
  }

  private async startUnlockNotifications() {
    if (this.unlockNotifyActive) return
    await this.unlockChar.startNotifications(this.onUnlockRx)
    this.unlockNotifyActive = true
  }

  private async stopUnlockNotifications() {
    if (!this.unlockNotifyActive) return
    await this.unlockChar.stopNotifications()
    this.unlockNotifyActive = false
  }

  /** Обычное подключение: предъявляем прибору ранее записанный ключ. */
  async unlock(key: Uint8Array) {
    await this.startUnlockNotifications()
    const response = await this.unlockTransceive(Uint8Array.from([0x01, ...key]))

    // Ответ на команду 0x01 приходит как 0x81, второй байт — статус: 0 значит «открыто».
    if (response[0] === 0x81 && response[1] !== 0x00) {
      throw new PairingRequiredError(
        response[1],
        'Тонометр не принял ключ — значит, он ещё не сопряжён с этим приложением ' +
          '(либо в нём остался ключ от Omron Connect).',
      )
    }
    if (response[0] !== 0x81) {
      throw new OmronProtocolError(
        `Неожиданный ответ прибора на разблокировку: ${hex(response.subarray(0, 2))}. ` +
          'Попробуйте переподключиться, включив Bluetooth на приборе заново.',
      )
    }

    await this.stopUnlockNotifications()
    this.log('info', 'ключ принят, доступ к памяти открыт')
  }

  /**
   * Сопряжение: записывает новый ключ в прибор. Делается один раз.
   * Требует, чтобы прибор был в режиме сопряжения (на экране мигает «P»).
   */
  async writePairingKey(key: Uint8Array) {
    // Подписка на нулевой RX-канал заставляет прибор инициировать BLE-сопряжение
    // на уровне ОС — без этого запись ключа не проходит.
    await this.rxChars[0].startNotifications(() => {})

    await this.startUnlockNotifications()

    let entered = false
    for (let attempt = 1; attempt <= 10; attempt++) {
      const response = await this.unlockTransceive(Uint8Array.from([0x02, ...new Uint8Array(16)]))
      if (response[0] === 0x82 && response[1] === 0x00) {
        entered = true
        this.log('info', `режим программирования ключа открыт (попытка ${attempt})`)
        break
      }
      this.log('debug', `попытка ${attempt}/10: ответ ${hex(response.subarray(0, 2))}`)
      await sleep(1000)
    }
    if (!entered) {
      throw new OmronProtocolError(
        'Не удалось войти в режим программирования ключа. Убедитесь, что на экране тонометра мигает «P» ' +
          '(удерживайте кнопку Bluetooth ~2 секунды), и повторите.',
      )
    }

    const response = await this.unlockTransceive(Uint8Array.from([0x00, ...key]))
    if (response[0] !== 0x80 || response[1] !== 0x00) {
      // Отказ на запись — ещё не беда: прибор так отвечает и когда наш ключ в
      // нём уже лежит. Проверено на RS7 23 августа 2026: повторное сопряжение
      // даёт `80 01`, при том что `01 + ключ` прибор принимает и память
      // открывает. Спрашиваем прибор напрямую, вместо того чтобы пугать
      // человека словом «не получилось» там, где всё в порядке.
      this.log('debug', `запись ключа отклонена (${hex(response.subarray(0, 2))}) — проверяем, не записан ли он уже`)
      const check = await this.unlockTransceive(Uint8Array.from([0x01, ...key]))
      if (check[0] === 0x81 && check[1] === 0x00) {
        await this.stopUnlockNotifications()
        await this.rxChars[0].stopNotifications()
        this.log('info', 'прибор уже сопряжён с этим приложением — ключ переписывать не нужно')
        return
      }
      throw new OmronProtocolError(`Прибор отклонил запись ключа (ответ ${hex(response.subarray(0, 2))})`)
    }

    await this.stopUnlockNotifications()
    await this.rxChars[0].stopNotifications()
    this.log('info', 'ключ сопряжения записан в прибор')
  }

  // ── сеанс чтения памяти ──────────────────────────────────────────────────

  async startSession() {
    await this.enableNotifications()
    const packet = await this.transceive(Uint8Array.from([0x08, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x18]))
    if (packet.type !== 0x8000) {
      throw new OmronProtocolError(`Неожиданный ответ на начало сеанса: 0x${packet.type.toString(16)}`)
    }
  }

  async endSession() {
    const packet = await this.transceive(Uint8Array.from([0x08, 0x0f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07]))
    if (packet.type !== 0x8f00) {
      throw new OmronProtocolError(`Неожиданный ответ на конец сеанса: 0x${packet.type.toString(16)}`)
    }
    if (packet.data[0] !== 0) {
      throw new OmronProtocolError(`Прибор вернул код ошибки ${packet.data[0]} при завершении сеанса`)
    }
    await this.disableNotifications()
  }

  private async readBlock(address: number, size: number): Promise<Uint8Array> {
    const command = withChecksum([0x08, 0x01, 0x00, (address >> 8) & 0xff, address & 0xff, size])
    const packet = await this.transceive(command)
    if (packet.address !== address) {
      throw new OmronProtocolError(
        `Прибор ответил про адрес 0x${packet.address.toString(16)}, а запрашивали 0x${address.toString(16)}`,
      )
    }
    if (packet.type !== 0x8100) {
      throw new OmronProtocolError(`Неожиданный тип пакета при чтении: 0x${packet.type.toString(16)}`)
    }
    return packet.data
  }

  /** Читает непрерывный участок памяти, разбивая на блоки допустимого размера. */
  async readMemory(
    startAddress: number,
    length: number,
    blockSize: number,
    onProgress?: (done: number, total: number) => void,
  ): Promise<Uint8Array> {
    const out = new Uint8Array(length)
    let offset = 0
    while (offset < length) {
      const chunk = Math.min(length - offset, blockSize)
      const data = await this.readBlock(startAddress + offset, chunk)
      out.set(data.subarray(0, chunk), offset)
      offset += chunk
      onProgress?.(offset, length)
    }
    return out
  }

  async dispose() {
    await this.disableNotifications()
    await this.stopUnlockNotifications()
  }
}
