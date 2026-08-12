/**
 * Сохранность дневника: когда делать резервную копию и когда предупреждать.
 *
 * Данные лежат в браузерном хранилище одного устройства, и это единственный
 * экземпляр. Потерять его можно четырьмя разными способами, и защищают от них
 * разные вещи:
 *
 * | Что случилось                              | Что спасает                       |
 * |--------------------------------------------|-----------------------------------|
 * | Браузер вытеснил хранилище сам             | постоянное хранилище (persist)    |
 * | Человек очистил данные сайта               | копия вне браузера                |
 * | Телефон потерян, сломан, сброшен           | копия вне устройства              |
 * | Ошибка в приложении                        | копия плюс отсутствие тихих удалений |
 *
 * Здесь только решения «пора или не пора» — без файлов, без DOM и без браузера,
 * чтобы на нативных платформах этот файл переехал как есть.
 */

/** Что мы знаем о последней копии. Хранится в настройках. */
export interface BackupState {
  /** Когда копия сделана. `null` — не делалась ни разу. */
  lastAt: number | null
  /** Сколько записей было в копии. По нему видно, разошлась ли она с дневником. */
  lastCount: number
}

export const NO_BACKUP: BackupState = { lastAt: null, lastCount: 0 }

const DAY = 24 * 60 * 60 * 1000

/** После скольких дней без копии считаем положение опасным. */
export const STALE_DAYS = 7

/**
 * Нужна ли автоматическая копия прямо сейчас.
 *
 * Условие простое — дневник разошёлся с копией. Копия весит десятки килобайт
 * даже на годы измерений, поэтому экономить на записи незачем: любое отличие
 * это потенциальная потеря.
 */
export function shouldAutoBackup(state: BackupState, count: number): boolean {
  return count > 0 && (state.lastAt === null || state.lastCount !== count)
}

export type BackupWarning =
  /** Копий нет вовсе, а данные уже есть. */
  | 'never'
  /** Копия есть, но устарела: с тех пор прошло много дней и записи изменились. */
  | 'stale'
  | null

export function backupWarning(state: BackupState, count: number, now: number): BackupWarning {
  if (count === 0) return null
  if (state.lastAt === null) return 'never'
  // Устаревшей считаем только разошедшуюся копию: если новых записей не было,
  // старая копия полна, и дёргать человека не за что.
  if (state.lastCount === count) return null
  return now - state.lastAt >= STALE_DAYS * DAY ? 'stale' : null
}

/** «3 дня назад» — для подписи под кнопкой. Без библиотек: случаев всего несколько. */
export function describeBackupAge(lastAt: number | null, now: number): string {
  if (lastAt === null) return 'копий ещё не было'
  const days = Math.floor((now - lastAt) / DAY)
  if (days === 0) return 'сегодня'
  if (days === 1) return 'вчера'
  if (days < 5) return `${days} дня назад`
  if (days < 30) return `${days} дней назад`
  const months = Math.floor(days / 30)
  return months === 1 ? 'месяц назад' : `${months} мес. назад`
}

/** Имя файла копии. Дата в начале, чтобы копии сортировались по порядку. */
export function backupFilename(now: number): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `дневник-здоровья-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}
