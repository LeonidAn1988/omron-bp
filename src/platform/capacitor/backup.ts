/**
 * Копия дневника в файл, который выбрал человек.
 *
 * Прежняя версия писала в каталог приложения на общей памяти и честно
 * признавалась, что это тупик: `Android/data` с одиннадцатой версии закрыт и
 * для файловых менеджеров, и для системного выбора файла, через который в
 * приложении устроено восстановление. Копия, которую невозможно вернуть, гасила
 * предупреждение «копии нет» и создавала ложное спокойствие ровно там, где
 * приложение обещает обратное. Поэтому автокопии на Android были выключены.
 *
 * Теперь работает Storage Access Framework: человек один раз указывает файл,
 * система выдаёт долгоживущее разрешение, и дальше приложение пишет туда само.
 *
 * **Облако не обязательно.** Системное окно одинаково предлагает и облачные
 * папки — Яндекс.Диск, Google Drive, — и память самого телефона: «Загрузки»,
 * «Документы», карту памяти. Кому облако не нужно, тот кладёт файл рядом с
 * остальными своими и переносит как захочет. Разницы для приложения нет.
 *
 * Что это меняет по существу: файл наконец покидает приложение. Он переживает
 * его удаление, а положенный в облако — и потерю телефона. При этом храним его
 * не мы: облако принадлежит человеку, и оператором персональных данных мы не
 * становимся.
 */

import { registerPlugin } from '@capacitor/core'
import type { BackupPort, BackupWriteResult } from '../ports'

interface BackupFilePlugin {
  choose(options: { suggestedName: string }): Promise<{ cancelled: boolean; uri?: string; name?: string }>
  write(options: { uri: string; content: string }): Promise<{ ok: boolean }>
  read(options: { uri: string }): Promise<{ content: string }>
  check(options: { uri: string }): Promise<{ ok: boolean; name: string | null }>
  forget(options: { uri: string }): Promise<void>
}

const BackupFile = registerPlugin<BackupFilePlugin>('BackupFile')

/**
 * Адрес выбранного файла. В localStorage, а не в дневнике: это настройка связи
 * с системой, и терять её не жалко — в худшем случае человек выберет файл
 * заново. Хранить её в резервной копии тем более незачем: на другом устройстве
 * этот адрес всё равно недействителен.
 */
const URI_KEY = 'omron.backup-uri'
const NAME_KEY = 'omron.backup-name'

function remember(uri: string, name: string) {
  try {
    localStorage.setItem(URI_KEY, uri)
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // Приватный режим может запретить хранилище: копия в этой сессии
    // запишется, следующий запуск попросит выбрать файл заново.
  }
}

function stored(): { uri: string | null; name: string } {
  try {
    return { uri: localStorage.getItem(URI_KEY), name: localStorage.getItem(NAME_KEY) ?? 'копия дневника' }
  } catch {
    return { uri: null, name: 'копия дневника' }
  }
}

function drop() {
  try {
    localStorage.removeItem(URI_KEY)
    localStorage.removeItem(NAME_KEY)
  } catch {
    // Забыть не удалось — цель всё равно недоступна, запись вернёт false.
  }
}

export const capacitorBackup: BackupPort = {
  isSupported() {
    return true
  },

  async choose(suggestedName) {
    const result = await BackupFile.choose({ suggestedName })
    // Закрытое окно — это отказ, а не ошибка: интерфейс на нём молчит.
    if (result.cancelled || !result.uri) return null
    const name = result.name ?? suggestedName
    remember(result.uri, name)
    return name
  },

  /**
   * Цела ли цель.
   *
   * Спрашиваем систему, а не свою память: разрешение снимает переустановка
   * приложения, очистка его данных и удаление самого файла. Без этой проверки
   * приложение уверяло бы, что копии идут, когда цели давно нет, — то самое
   * ложное спокойствие, ради которого автокопии и были выключены.
   */
  async target() {
    const { uri } = stored()
    if (!uri) return null
    try {
      const { ok, name } = await BackupFile.check({ uri })
      if (!ok) {
        drop()
        return null
      }
      if (name) remember(uri, name)
      return name ?? stored().name
    } catch {
      return null
    }
  },

  async write(content): Promise<BackupWriteResult> {
    const { uri } = stored()
    if (!uri) return 'lost'
    try {
      const { ok } = await BackupFile.write({ uri, content })
      return ok ? 'ok' : 'retry'
    } catch {
      // Неудача сама по себе ничего не говорит: облачная папка недоступна без
      // сети ровно так же, как удалённый файл. Спрашиваем систему, цело ли
      // разрешение, — отвязывать файл из-за выключенного Wi-Fi нельзя.
      try {
        const { ok } = await BackupFile.check({ uri })
        return ok ? 'retry' : 'lost'
      } catch {
        return 'retry'
      }
    }
  },

  async read() {
    const { uri } = stored()
    if (!uri) return null
    try {
      const { content } = await BackupFile.read({ uri })
      return content
    } catch {
      return null
    }
  },

  async forget() {
    const { uri } = stored()
    drop()
    if (uri) await BackupFile.forget({ uri }).catch(() => undefined)
  },
}
