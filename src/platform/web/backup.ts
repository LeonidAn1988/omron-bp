/**
 * Автоматические копии в файл, выбранный пользователем один раз.
 *
 * Опирается на File System Access API: пользователь указывает файл, браузер
 * отдаёт долгоживущий описатель, и дальше приложение пишет в него само. Описатель
 * переживает перезагрузку, если положить его в IndexedDB — обычным JSON он не
 * сериализуется, но структурным клонированием сохраняется.
 *
 * Есть это не везде. Проверено на реальных устройствах 13 августа 2026: Chrome
 * на Android — да, включая Android 9 (отказ без жеста приходит штатным
 * SecurityError, то есть API настоящий, а не заглушка); Samsung Internet — да;
 * Safari на iOS и macOS — нет. Там `isSupported()` вернёт false, и приложение
 * предложит сохранять копию вручную.
 */

import type { BackupPort } from '../ports'

/** Описатель файла лежит в своей базе: он существует только в вебе, дневнику о нём знать незачем. */
const DB_NAME = 'omron-backup'
const STORE = 'handles'
const KEY = 'target'

/**
 * Части File System Access API, которыми мы пользуемся. Объявлены здесь, а не
 * взяты из lib.dom: в целевой версии TypeScript их ещё нет, а тянуть ради трёх
 * методов отдельный пакет типов не стоит.
 */
interface FileHandle {
  name: string
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>
}

type SaveFilePicker = (options: {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}) => Promise<FileHandle>

function picker(): SaveFilePicker | null {
  const fn = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker
  return typeof fn === 'function' ? fn : null
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readHandle(): Promise<FileHandle | null> {
  const db = await openDb()
  try {
    return await new Promise<FileHandle | null>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      request.onsuccess = () => resolve((request.result as FileHandle | undefined) ?? null)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

async function writeHandle(handle: FileHandle | null): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
      const request = handle ? store.put(handle, KEY) : store.delete(KEY)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export const webBackup: BackupPort = {
  isSupported() {
    return picker() !== null
  },

  async choose(suggestedName) {
    const show = picker()
    if (!show) return null
    try {
      const handle = await show({
        suggestedName,
        types: [{ description: 'Резервная копия дневника', accept: { 'application/json': ['.json'] } }],
      })
      await writeHandle(handle)
      return handle.name
    } catch {
      // Отказ от диалога, запрет политикой, отсутствие поддержки в конкретной
      // сборке — снаружи всё это одно и то же: цель не выбрана. Пробрасывать
      // исключение нельзя: наличие функции ещё не значит, что она отработает,
      // а падать на кнопке про сохранность данных — худшее, что можно сделать.
      return null
    }
  },

  async target() {
    const handle = await readHandle()
    if (!handle) return null
    // Разрешение спрашиваем без запроса: запрашивать его можно только по жесту,
    // а этот вызов идёт при запуске. Здесь нужно лишь понять, цело ли оно.
    const state = await handle.queryPermission({ mode: 'readwrite' })
    return state === 'granted' ? handle.name : null
  },

  async write(content) {
    const handle = await readHandle()
    if (!handle) return false
    if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') return false
    try {
      const stream = await handle.createWritable()
      await stream.write(content)
      await stream.close()
      return true
    } catch {
      // Файл могли удалить или переместить. Молча теряться нельзя — приложение
      // по false покажет предупреждение и предложит выбрать файл заново.
      return false
    }
  },

  async forget() {
    await writeHandle(null)
  },
}
