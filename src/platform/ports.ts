/**
 * Границы между переносимым ядром и платформой.
 *
 * Всё, что ядро умеет само — разбор пакетов прибора, классификация, статистика,
 * экспорт — не знает ни про браузер, ни про React. Платформа даёт ровно три вещи,
 * описанные ниже, и при переезде на Android, iOS, macOS и Windows меняются только
 * их реализации.
 *
 * Интерфейсы намеренно узкие: это ровно то, чем пользуется приложение, а не
 * пересказ Web Bluetooth или IndexedDB. Иначе порт перестаёт быть портом.
 */

import type { Measurement, Settings } from '../types'

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
  /** Открывает системный выбор устройства. Обязан вызываться из обработчика жеста. */
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
}

// ── файлы ──────────────────────────────────────────────────────────────────

export interface FilePort {
  /** Отдать пользователю файл: скачиванием, диалогом сохранения или «поделиться». */
  save(filename: string, content: string, mime: string): Promise<void>
}

// ── реестр ─────────────────────────────────────────────────────────────────

export interface Platform {
  bluetooth: BluetoothPort
  storage: StoragePort
  files: FilePort
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
