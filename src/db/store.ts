import type { BpReading, GlucoseReading, Measurement, Settings } from '../types'
import { DEFAULT_PAIRING_KEY } from '../ble/session'

const DB_NAME = 'omron-bp'
/**
 * 1 → 2: появился сахар. Все существующие записи получают `kind: 'bp'`, добавляется
 * индекс по виду измерения. Потеря данных при обновлении — самая частая жалоба на
 * приложения этого класса, поэтому миграция покрыта отдельным тестом.
 */
const DB_VERSION = 2
const MEASUREMENTS = 'readings'
const META = 'meta'

export const DEFAULT_SETTINGS: Settings = {
  pairingKey: DEFAULT_PAIRING_KEY,
  userNames: { 1: 'Пользователь 1', 2: 'Пользователь 2' },
  activeUser: 1,
  targetSys: 135,
  targetDia: 85,
  glucoseFastingMax: 7.0,
  glucosePostMealMax: 10.0,
  glucoseLow: 3.9,
  trackGlucose: false,
}

let dbPromise: Promise<IDBDatabase> | null = null

/** Точка подмены для тестов: в Node глобального indexedDB нет. */
let factory: IDBFactory | null = null
export function useIndexedDbFactory(next: IDBFactory) {
  factory = next
  dbPromise = null
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = (factory ?? indexedDB).open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = request.result
      const store = db.objectStoreNames.contains(MEASUREMENTS)
        ? request.transaction!.objectStore(MEASUREMENTS)
        : db.createObjectStore(MEASUREMENTS, { keyPath: 'id' })

      if (!store.indexNames.contains('ts')) store.createIndex('ts', 'ts')
      if (!store.indexNames.contains('user')) store.createIndex('user', 'user')
      if (!store.indexNames.contains('kind')) store.createIndex('kind', 'kind')
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)

      // До версии 2 вид измерения не хранился — все записи были про давление.
      if (event.oldVersion > 0 && event.oldVersion < 2) {
        store.openCursor().onsuccess = (cursorEvent) => {
          const cursor = (cursorEvent.target as IDBRequest<IDBCursorWithValue>).result
          if (!cursor) return
          const value = cursor.value as Partial<Measurement>
          if (!value.kind) cursor.update({ ...value, kind: 'bp' })
          cursor.continue()
        }
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode)
        const request = run(transaction.objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

/**
 * Идентификатор записи, снятой с прибора. Детерминированный — повторная выгрузка
 * не плодит дубли.
 *
 * Префикс зависит от вида измерения: давление и сахар, снятые в одну и ту же секунду,
 * иначе затёрли бы друг друга.
 */
export function deviceMeasurementId(kind: Measurement['kind'], user: number, ts: number): string {
  return `${kind === 'bp' ? 'd' : 'g'}${user}-${Math.floor(ts / 1000)}`
}

/** Совместимость: идентификаторы давления, выданные до появления сахара, выглядели так же. */
export const readingId = (user: number, ts: number) => deviceMeasurementId('bp', user, ts)

export async function getAllMeasurements(): Promise<Measurement[]> {
  const rows = await tx<Measurement[]>(MEASUREMENTS, 'readonly', (s) => s.getAll())
  return rows.sort((a, b) => a.ts - b.ts)
}

export const isBpReading = (m: Measurement): m is BpReading => m.kind === 'bp'
export const isGlucoseReading = (m: Measurement): m is GlucoseReading => m.kind === 'glucose'

export async function putMeasurements(items: Measurement[]): Promise<void> {
  if (items.length === 0) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(MEASUREMENTS, 'readwrite')
    const store = transaction.objectStore(MEASUREMENTS)
    for (const item of items) store.put(item)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/**
 * Добавляет только то, чего ещё нет. Дубли режутся по id, поэтому повторная
 * выгрузка с прибора безопасна.
 */
export async function addNewMeasurements(items: Measurement[]): Promise<Measurement[]> {
  const existing = new Set((await getAllMeasurements()).map((m) => m.id))
  const fresh = items.filter((m) => !existing.has(m.id))
  await putMeasurements(fresh)
  return fresh
}

export async function deleteMeasurement(id: string): Promise<void> {
  await tx(MEASUREMENTS, 'readwrite', (s) => s.delete(id))
}

export async function clearMeasurements(): Promise<void> {
  await tx(MEASUREMENTS, 'readwrite', (s) => s.clear())
}

export async function loadSettings(): Promise<Settings> {
  const stored = await tx<Partial<Settings> | undefined>(META, 'readonly', (s) => s.get('settings'))
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    userNames: { ...DEFAULT_SETTINGS.userNames, ...(stored?.userNames ?? {}) },
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await tx(META, 'readwrite', (s) => s.put(settings, 'settings'))
}
