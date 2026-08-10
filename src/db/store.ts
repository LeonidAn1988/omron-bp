import type { Reading, Settings } from '../types'
import { DEFAULT_PAIRING_KEY } from '../ble/session'

const DB_NAME = 'omron-bp'
const DB_VERSION = 1
const READINGS = 'readings'
const META = 'meta'

export const DEFAULT_SETTINGS: Settings = {
  pairingKey: DEFAULT_PAIRING_KEY,
  userNames: { 1: 'Пользователь 1', 2: 'Пользователь 2' },
  activeUser: 1,
  targetSys: 135,
  targetDia: 85,
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(READINGS)) {
        const store = db.createObjectStore(READINGS, { keyPath: 'id' })
        store.createIndex('ts', 'ts')
        store.createIndex('user', 'user')
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
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

export function readingId(user: number, ts: number): string {
  return `d${user}-${Math.floor(ts / 1000)}`
}

export async function getAllReadings(): Promise<Reading[]> {
  const rows = await tx<Reading[]>(READINGS, 'readonly', (s) => s.getAll())
  return rows.sort((a, b) => a.ts - b.ts)
}

export async function putReadings(readings: Reading[]): Promise<void> {
  if (readings.length === 0) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(READINGS, 'readwrite')
    const store = transaction.objectStore(READINGS)
    for (const reading of readings) store.put(reading)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

/**
 * Добавляет только те записи, которых ещё нет.
 * Дубли режутся по id, поэтому повторная выгрузка с прибора безопасна.
 */
export async function addNewReadings(readings: Reading[]): Promise<Reading[]> {
  const existing = new Set((await getAllReadings()).map((r) => r.id))
  const fresh = readings.filter((r) => !existing.has(r.id))
  await putReadings(fresh)
  return fresh
}

export async function deleteReading(id: string): Promise<void> {
  await tx(READINGS, 'readwrite', (s) => s.delete(id))
}

export async function clearReadings(): Promise<void> {
  await tx(READINGS, 'readwrite', (s) => s.clear())
}

export async function loadSettings(): Promise<Settings> {
  const stored = await tx<Partial<Settings> | undefined>(META, 'readonly', (s) => s.get('settings'))
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}), userNames: { ...DEFAULT_SETTINGS.userNames, ...(stored?.userNames ?? {}) } }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await tx(META, 'readwrite', (s) => s.put(settings, 'settings'))
}
