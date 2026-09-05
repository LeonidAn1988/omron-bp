/**
 * Обмен через Яндекс.Диск: адреса, ключ и имена файлов.
 *
 * Здесь нет сети — только то, что можно проверить обычными тестами. Сами
 * запросы делает платформа: на телефоне мимо браузерных правил, в браузере
 * обычным `fetch`.
 *
 * **Почему Диск, а не WebDAV.** WebDAV из браузера закрыт наглухо — сервер не
 * отдаёт заголовков, без которых чужому сайту нельзя прочитать ответ, — а у
 * Яндекса он вдобавок работает только по платной подписке 360. Обычный
 * интерфейс Диска браузер пускает: проверено запросами 2 и 5 сентября 2026.
 *
 * **Что браузер умеет, а что нет.** Проверено с настоящим ключом 5 сентября:
 * список папки и загрузка файла работают (загрузка вернула 201), а скачивание
 * блокируется — тело файла отдаёт отдельный хост `downloader.disk.yandex.ru`,
 * и он не разрешает чужому сайту прочитать ответ. Поэтому браузер отдаёт свой
 * дневник, но чужие читает только на телефоне или через папку клиента Диска.
 *
 * **Права.** Приложение просит единственное — доступ к своей папке
 * (`cloud_api:disk.app_folder`). Остального Диска оно не видит, и это лучше
 * полного доступа, который просят программы вроде Safe in Cloud.
 */

/** Идентификатор приложения в Яндексе. Публичный по устройству OAuth. */
export const YANDEX_CLIENT_ID = 'e11e6f93b04e4b23b6532e3189ff2839'

/** Папка приложения на Диске. Всё остальное приложению недоступно. */
export const DISK_FOLDER = 'app:/'

const API = 'https://cloud-api.yandex.net/v1/disk'

/**
 * Страница входа.
 *
 * Ключ обмена приложение получить не может: секрета у него нет и быть не
 * должно — он лежал бы прямо в установленном приложении. Поэтому Яндекс
 * показывает ключ человеку, тот его копирует и вставляет в приложение. Один
 * раз примерно на год.
 */
export function authUrl(): string {
  const p = new URLSearchParams({ response_type: 'token', client_id: YANDEX_CLIENT_ID })
  return `https://oauth.yandex.ru/authorize?${p}`
}

/**
 * Вытащить ключ из того, что человек вставил.
 *
 * Вставляют по-разному: сам ключ, всю строку адреса с ним, строку с подписью
 * «access_token=». Разбираем всё это молча — переспрашивать человека, который
 * уже сделал что просили, невежливо.
 */
export function parseToken(pasted: string): string | null {
  const текст = pasted.trim()
  if (!текст) return null
  const изАдреса = текст.match(/access_token=([\w.-]+)/)
  if (изАдреса) return изАдреса[1]
  // Голый ключ: буквы, цифры, подчёркивания. Пробелов и кавычек в нём не бывает.
  const голый = текст.match(/^[\w.-]{20,}$/)
  return голый ? голый[0] : null
}

/** Заголовок с ключом — один на все запросы. */
export function authHeader(token: string): Record<string, string> {
  return { Authorization: `OAuth ${token}` }
}

export const listUrl = (limit = 100): string =>
  `${API}/resources?${new URLSearchParams({ path: DISK_FOLDER, limit: String(limit) })}`

export const uploadUrl = (name: string): string =>
  `${API}/resources/upload?${new URLSearchParams({ path: DISK_FOLDER + name, overwrite: 'true' })}`

export const downloadUrl = (name: string): string =>
  `${API}/resources/download?${new URLSearchParams({ path: DISK_FOLDER + name })}`

/**
 * Имя файла этого телефона.
 *
 * Имя человека в названии обязательно: в общей папке лежит несколько дневников,
 * и «дневник.json» у всех одинаковый — не разобрать, чей. Файл один на
 * установку и переписывается целиком; истории версий здесь не ведём — её ведёт
 * сам Диск.
 */
export function diskFileName(personName: string | undefined | null): string {
  const чей = (personName ?? '').trim().replace(/[\\/:*?"<>|]/g, '')
  return чей && чей !== 'Я' ? `дневник-${чей}.json` : 'дневник.json'
}

/** Файл в папке приложения, как его описывает Диск. */
export interface DiskFile {
  name: string
  /** Когда изменён, миллисекунды. `null` — Диск не сказал. */
  modified: number | null
  size: number | null
}

/**
 * Разобрать ответ со списком папки.
 *
 * Берём только `.json` и молча пропускаем всё остальное: человек мог положить
 * в папку что угодно, и падать из-за этого нельзя.
 */
export function parseListing(raw: unknown): DiskFile[] {
  const items = (raw as { _embedded?: { items?: unknown[] } })?._embedded?.items
  if (!Array.isArray(items)) return []
  return items
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .filter((x) => x.type === 'file' && typeof x.name === 'string' && (x.name as string).toLowerCase().endsWith('.json'))
    .map((x) => ({
      name: x.name as string,
      modified: typeof x.modified === 'string' ? (Date.parse(x.modified) || null) : null,
      size: typeof x.size === 'number' ? x.size : null,
    }))
}

/** Ссылка на загрузку или скачивание из ответа Диска. */
export function parseHref(raw: unknown): string | null {
  const href = (raw as { href?: unknown })?.href
  return typeof href === 'string' && href.startsWith('https://') ? href : null
}
