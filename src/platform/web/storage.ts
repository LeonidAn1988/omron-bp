/**
 * Реализация StoragePort поверх IndexedDB.
 *
 * Здесь же живёт миграция схемы: версия 1 знала только давление и не хранила вид
 * измерения, версия 2 добавила сахар. Потеря данных при обновлении — одна из самых
 * частых жалоб на приложения этого класса, поэтому миграция покрыта отдельным тестом
 * (tests/migration.test.mjs).
 */

import type { Measurement, Settings } from '../../types'
import type { StoragePort } from '../ports'

const DB_NAME = 'omron-bp'
const DB_VERSION = 2
const MEASUREMENTS = 'readings'
const META = 'meta'

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

export const webStorage: StoragePort = {
  async allMeasurements() {
    const rows = await tx<Measurement[]>(MEASUREMENTS, 'readonly', (s) => s.getAll())
    return rows.sort((a, b) => a.ts - b.ts)
  },

  async putMeasurements(items) {
    if (items.length === 0) return
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(MEASUREMENTS, 'readwrite')
      const store = transaction.objectStore(MEASUREMENTS)
      for (const item of items) store.put(item)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  },

  async deleteMeasurement(id) {
    await tx(MEASUREMENTS, 'readwrite', (s) => s.delete(id))
  },

  async clearMeasurements() {
    await tx(MEASUREMENTS, 'readwrite', (s) => s.clear())
  },

  async loadSettings() {
    return tx<Partial<Settings> | undefined>(META, 'readonly', (s) => s.get('settings'))
  },

  async saveSettings(settings) {
    await tx(META, 'readwrite', (s) => s.put(settings, 'settings'))
  },
}
