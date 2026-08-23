/**
 * Сценарии работы с тонометром: выбор устройства, сопряжение, выгрузка истории.
 *
 * Про конкретную платформу здесь не знают — всё идёт через BluetoothPort,
 * поэтому файл переезжает на Android, iOS и десктоп без правок.
 */

import {
  DEFAULT_PAIRING_KEY,
  OmronProtocolError,
  OmronTransport,
  OMRON_ADVERTISED_SERVICES,
  OMRON_SERVICE,
  PairingRequiredError,
  RX_CHANNELS,
  TX_CHANNELS,
  UNLOCK_CHAR,
  parseHexKey,
  type Logger,
} from './protocol'
import { readAllRecords, type DeviceRecord, type ReadProgress } from './hem6232t'
import {
  GLUCOSE_NAME_PREFIXES,
  GLUCOSE_SERVICE,
  readAllGlucoseRecords,
  type GlucoseRecord,
} from './glucose'
import { platform, type GattDevice } from '../platform/ports'

export type { DeviceRecord, ReadProgress, GattDevice, GlucoseRecord }
export { DEFAULT_PAIRING_KEY, OmronProtocolError, PairingRequiredError }

/** Приборы Omron рекламируются под такими именами. */
const NAME_PREFIXES = ['BLESmart_', 'BLEsmart_', 'OMRON', 'Omron', 'omron']

export function isBluetoothSupported(): boolean {
  return platform().bluetooth.isSupported()
}

export function isBluetoothEnabled(): Promise<boolean | null> {
  return platform().bluetooth.isEnabled()
}

export function isCancellation(error: unknown): boolean {
  return platform().bluetooth.isCancellation(error)
}

/** Открывает системный выбор устройства. Обязан вызываться из обработчика жеста. */
export function pickDevice(showAll = false): Promise<GattDevice> {
  return platform().bluetooth.pickDevice({
    serviceUuid: OMRON_SERVICE,
    advertisedServices: OMRON_ADVERTISED_SERVICES,
    namePrefixes: NAME_PREFIXES,
    showAll,
  })
}

/** Ранее разрешённые устройства — позволяет переподключаться без диалога выбора. */
export function getKnownDevices(): Promise<GattDevice[]> {
  return platform().bluetooth.knownDevices(OMRON_SERVICE)
}

async function connect(device: GattDevice, log: Logger): Promise<OmronTransport> {
  log('info', `подключение к «${device.name ?? 'без имени'}»`)
  const service = await device.connect(OMRON_SERVICE)
  return OmronTransport.create(service, log)
}

const ROLE_BY_UUID: Record<string, string> = {
  ...Object.fromEntries(RX_CHANNELS.map((uuid, i) => [uuid, `rx ${i}`])),
  ...Object.fromEntries(TX_CHANNELS.map((uuid, i) => [uuid, `tx ${i}`])),
  [UNLOCK_CHAR]: 'разблокировка',
}

/**
 * Диагностика: перечисляет характеристики проприетарного сервиса и их свойства.
 * Нужна, если протокол на конкретном экземпляре разойдётся с ожидаемым.
 */
export async function inspectDevice(device: GattDevice, log: Logger): Promise<void> {
  log('info', `устройство: ${device.name ?? 'без имени'} (id ${device.id})`)
  const service = await device.connect(OMRON_SERVICE)
  try {
    log('info', `сервис ${OMRON_SERVICE}`)
    for (const { characteristic, properties } of await service.listCharacteristics()) {
      const flags = Object.entries(properties)
        .filter(([, on]) => on)
        .map(([name]) => name)
        .join(',')
      log('info', `  ${characteristic.uuid}  [${flags}]  ${ROLE_BY_UUID[characteristic.uuid] ?? '—'}`)
    }
  } finally {
    device.disconnect()
  }
}

export interface SyncResult {
  records: DeviceRecord[]
  deviceName: string
}

/**
 * Разовое сопряжение: пишет ключ в прибор.
 * Прибор должен быть в режиме сопряжения — на экране мигает «P».
 */
export async function pairDevice(device: GattDevice, keyHex: string, log: Logger): Promise<void> {
  const key = parseHexKey(keyHex)
  const transport = await connect(device, log)
  try {
    await transport.writePairingKey(key)
    // Пустой сеанс сразу после записи ключа — прибор ожидает его при первом сопряжении.
    await transport.startSession()
    await transport.endSession()
  } finally {
    await transport.dispose()
    device.disconnect()
  }
}

/** Выгружает всю историю измерений. Ничего не пишет в прибор. */
export async function downloadRecords(
  device: GattDevice,
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
    device.disconnect()
  }
}

// ── глюкометр по стандартному профилю ──────────────────────────────────────

/**
 * Выбор и выгрузка глюкометра. Отдельный сценарий, а не ветка внутри выгрузки
 * тонометра: там проприетарный протокол Omron, здесь открытый профиль
 * Bluetooth SIG, и общего между ними только слово «Bluetooth».
 */
export function pickGlucoseMeter(showAll = false): Promise<GattDevice> {
  return platform().bluetooth.pickDevice({
    serviceUuid: GLUCOSE_SERVICE,
    namePrefixes: GLUCOSE_NAME_PREFIXES,
    showAll,
  })
}

export interface GlucoseSyncResult {
  records: GlucoseRecord[]
  deviceName: string
}

export async function downloadGlucoseRecords(
  device: GattDevice,
  log: Logger,
  onProgress?: (count: number) => void,
): Promise<GlucoseSyncResult> {
  log('info', `подключение к глюкометру «${device.name ?? 'без имени'}»`)
  const service = await device.connect(GLUCOSE_SERVICE)
  try {
    const records = await readAllGlucoseRecords(service, log, onProgress)
    return { records, deviceName: device.name ?? 'Глюкометр' }
  } finally {
    device.disconnect()
  }
}
