/**
 * Высокоуровневый сценарий работы с тонометром: выбор устройства, подключение,
 * сопряжение и выгрузка истории.
 */

import {
  DEFAULT_PAIRING_KEY,
  OmronProtocolError,
  OmronTransport,
  OMRON_SERVICE,
  RX_CHANNELS,
  TX_CHANNELS,
  UNLOCK_CHAR,
  parseHexKey,
  type Logger,
} from './protocol'
import { readAllRecords, type DeviceRecord, type ReadProgress } from './hem6232t'

export type { DeviceRecord, ReadProgress }
export { DEFAULT_PAIRING_KEY, OmronProtocolError }

/** Приборы Omron рекламируются под такими именами. */
const NAME_PREFIXES = ['BLESmart_', 'BLEsmart_', 'OMRON', 'Omron', 'omron']

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

export async function isBluetoothEnabled(): Promise<boolean | null> {
  if (!isWebBluetoothAvailable()) return null
  try {
    return await navigator.bluetooth.getAvailability()
  } catch {
    return null
  }
}

/** Открывает системный выбор устройства. Обязан вызываться из обработчика клика. */
export async function pickDevice(showAll = false): Promise<BluetoothDevice> {
  const options: RequestDeviceOptions = showAll
    ? { acceptAllDevices: true, optionalServices: [OMRON_SERVICE] }
    : {
        filters: [...NAME_PREFIXES.map((namePrefix) => ({ namePrefix })), { services: [OMRON_SERVICE] }],
        optionalServices: [OMRON_SERVICE],
      }
  return navigator.bluetooth.requestDevice(options)
}

/** Ранее разрешённые устройства — позволяет переподключаться без диалога выбора. */
export async function getKnownDevices(): Promise<BluetoothDevice[]> {
  if (!isWebBluetoothAvailable()) return []
  const bluetooth = navigator.bluetooth as Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> }
  if (typeof bluetooth.getDevices !== 'function') return []
  try {
    return await bluetooth.getDevices()
  } catch {
    return []
  }
}

async function connect(device: BluetoothDevice, log: Logger): Promise<OmronTransport> {
  if (!device.gatt) throw new OmronProtocolError('У выбранного устройства нет GATT — это не тонометр Omron')
  log('info', `подключение к «${device.name ?? 'без имени'}»`)
  const server = await device.gatt.connect()
  // На части платформ сервисы резолвятся с задержкой сразу после connect().
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await OmronTransport.create(server, log)
    } catch (error) {
      if (attempt === 9) throw error
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  throw new OmronProtocolError('Не удалось получить сервисы устройства')
}

export interface SyncResult {
  records: DeviceRecord[]
  deviceName: string
}

/**
 * Разовое сопряжение: пишет ключ в прибор.
 * Прибор должен быть в режиме сопряжения — на экране мигает «P».
 */
export async function pairDevice(device: BluetoothDevice, keyHex: string, log: Logger): Promise<void> {
  const key = parseHexKey(keyHex)
  const transport = await connect(device, log)
  try {
    await transport.writePairingKey(key)
    // Пустой сеанс сразу после записи ключа — прибор ожидает его при первом сопряжении.
    await transport.startSession()
    await transport.endSession()
  } finally {
    await transport.dispose()
    device.gatt?.disconnect()
  }
}

/**
 * Диагностика: перечисляет характеристики проприетарного сервиса и их свойства.
 * Нужна, если протокол на конкретном экземпляре разойдётся с ожидаемым.
 *
 * Полный дамп всех сервисов Web Bluetooth не отдаёт — видно только то, что
 * заявлено в filters/optionalServices, поэтому смотрим свой сервис.
 */
export async function inspectDevice(device: BluetoothDevice, log: Logger): Promise<void> {
  if (!device.gatt) throw new OmronProtocolError('У устройства нет GATT')
  const server = await device.gatt.connect()
  try {
    log('info', `устройство: ${device.name ?? 'без имени'} (id ${device.id})`)
    const service = await server.getPrimaryService(OMRON_SERVICE)
    log('info', `сервис ${service.uuid}`)
    for (const characteristic of await service.getCharacteristics()) {
      const props = Object.entries({
        read: characteristic.properties.read,
        write: characteristic.properties.write,
        writeNR: characteristic.properties.writeWithoutResponse,
        notify: characteristic.properties.notify,
        indicate: characteristic.properties.indicate,
      })
        .filter(([, on]) => on)
        .map(([name]) => name)
        .join(',')
      const role = ROLE_BY_UUID[characteristic.uuid] ?? '—'
      log('info', `  ${characteristic.uuid}  [${props}]  ${role}`)
    }
  } finally {
    device.gatt.disconnect()
  }
}

const ROLE_BY_UUID: Record<string, string> = {
  ...Object.fromEntries(RX_CHANNELS.map((uuid, i) => [uuid, `rx ${i}`])),
  ...Object.fromEntries(TX_CHANNELS.map((uuid, i) => [uuid, `tx ${i}`])),
  [UNLOCK_CHAR]: 'разблокировка',
}

/** Выгружает всю историю измерений. Ничего не пишет в прибор. */
export async function downloadRecords(
  device: BluetoothDevice,
  keyHex: string,
  log: Logger,
  onProgress?: (p: ReadProgress) => void,
): Promise<SyncResult> {
  const key = parseHexKey(keyHex)
  const transport = await connect(device, log)
  try {
    await transport.unlock(key)
    await transport.startSession()
    const records = await readAllRecords(transport, onProgress)
    await transport.endSession()
    log('info', `прочитано измерений: ${records.length}`)
    return { records, deviceName: device.name ?? 'Omron' }
  } finally {
    await transport.dispose()
    device.gatt?.disconnect()
  }
}
