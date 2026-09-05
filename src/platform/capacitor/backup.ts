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
import type { BackupPort, BackupSource, BackupWriteResult } from '../ports'

interface BackupFilePlugin {
  choose(options: { suggestedName: string }): Promise<{ cancelled: boolean; uri?: string; name?: string }>
  openSource(): Promise<{ cancelled: boolean; uri?: string; name?: string }>
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

/**
 * Чужие копии — телефоны остальных членов семьи.
 *
 * Здесь же, в localStorage, и по той же причине: это связь с системой, а не
 * данные дневника. В резервную копию список попасть не должен — на другом
 * телефоне эти адреса недействительны, и подтянуть их туда значит показать
 * человеку список файлов, которых у него нет.
 */
const SOURCES_KEY = 'omron.backup-sources'

function сохранённыеИсточники(): { uri: string; name: string }[] {
  try {
    const raw = localStorage.getItem(SOURCES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is { uri: string; name: string } =>
        typeof item === 'object' && item !== null && typeof (item as { uri?: unknown }).uri === 'string',
    )
  } catch {
    return []
  }
}

function записатьИсточники(items: { uri: string; name: string }[]) {
  try {
    localStorage.setItem(SOURCES_KEY, JSON.stringify(items))
  } catch {
    // Приватный режим: список проживёт эту сессию.
  }
}

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
    let result: { cancelled: boolean; uri?: string; name?: string }
    try {
      result = await BackupFile.choose({ suggestedName })
    } catch {
      return null
    }
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

  canReadSources() {
    return true
  },

  async addSource(): Promise<BackupSource | null> {
    let result: { cancelled: boolean; uri?: string; name?: string }
    try {
      result = await BackupFile.openSource()
    } catch {
      // Система не выдала долгоживущий доступ — снаружи это тот же отказ, что
      // и закрытое окно. Веб-версия ведёт себя так же; падать на кнопке нельзя.
      return null
    }
    if (result.cancelled || !result.uri) return null
    // Свой файл копий — не «телефон семьи». Иначе его отключение отозвало бы
    // и право записи, и автокопии молча остановились бы.
    if (result.uri === stored().uri) throw new Error('Это ваш собственный файл копий — его добавлять не нужно.')
    const было = сохранённыеИсточники().filter((item) => item.uri !== result.uri)
    const item = { uri: result.uri, name: result.name ?? 'копия' }
    записатьИсточники([...было, item])
    return { id: item.uri, name: item.name }
  },

  async sources(): Promise<BackupSource[]> {
    return сохранённыеИсточники().map((item) => ({ id: item.uri, name: item.name }))
  },

  async readSource(id) {
    try {
      const { content } = await BackupFile.read({ uri: id })
      return content
    } catch {
      // Файл удалили, переименовали или отозвали доступ. Это не ошибка
      // приложения, и падать на ней нельзя: остальные источники читаются.
      return null
    }
  },

  async removeSource(id) {
    записатьИсточники(сохранённыеИсточники().filter((item) => item.uri !== id))
    await BackupFile.forget({ uri: id }).catch(() => undefined)
  },

  async forget() {
    const { uri } = stored()
    drop()
    if (uri) await BackupFile.forget({ uri }).catch(() => undefined)
  },
}
