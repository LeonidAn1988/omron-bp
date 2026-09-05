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
  /** Сколько записей было в копии. По нему считается, на сколько она отстала. */
  lastCount: number
  /**
   * Слепок содержимого на момент копии. По нему решается, писать ли: он ловит
   * и правку внутри записи, а не только появление новой.
   */
  lastSignature?: string
}

export const NO_BACKUP: BackupState = { lastAt: null, lastCount: 0 }

const DAY = 24 * 60 * 60 * 1000

/** После скольких дней без копии считаем положение опасным. */
export const STALE_DAYS = 7

/**
 * Сколько записей вне копии терпим молча.
 *
 * Ждать неделю нельзя: одна выгрузка с прибора приносит десятки измерений
 * разом, и семь дней тишины после неё — это семь дней, когда потерять можно
 * уже много. Порог маленький: два-три измерения человек внесёт заново по
 * памяти, а сорок — нет.
 */
export const BEHIND_COUNT = 5

/**
 * Нужна ли автоматическая копия прямо сейчас.
 *
 * Условие простое — дневник разошёлся с копией. Копия весит десятки килобайт
 * даже на годы измерений, поэтому экономить на записи незачем: любое отличие
 * это потенциальная потеря.
 */
export function shouldAutoBackup(state: BackupState, count: number, signature?: string): boolean {
  if (count === 0) return false
  if (state.lastAt === null) return true
  // Слепок точнее счётчика и отвечает на тот же вопрос: разошёлся ли дневник с
  // файлом. Пока его нет (копия сделана прежней версией) — считаем по записям.
  if (signature !== undefined && state.lastSignature !== undefined) return state.lastSignature !== signature
  return state.lastCount !== count
}

/**
 * Пора ли переписать файл копии.
 *
 * Одних счётчиков записей мало. Файл стареет ещё двумя способами, и оба
 * успели проявиться дефектами:
 *
 * - **сменился замок.** Человек включил шифрование или поменял пароль. Число
 *   записей при этом не изменилось, `shouldAutoBackup` промолчал бы — и экран
 *   говорил бы «сохраняется, закрытый паролем», пока в файле лежит открытый
 *   дневник;
 * - **файл только что выбран** (`force`). Он пуст, а счётчики могут сойтись —
 *   тогда человек остался бы с пустым файлом под надписью «сохраняется само».
 *
 * `written: null` — про содержимое файла мы ещё ничего не знаем: это первый
 * заход после запуска. Считаем, что в нём лежит то, чем его закрывали в
 * прошлый раз, иначе каждый старт приложения означал бы лишнюю запись в облако.
 */
export function shouldWriteBackup(
  state: BackupState,
  count: number,
  lock: { written: string | null; current: string },
  force: boolean,
  signature?: string,
): boolean {
  // Пустой дневник не пишем ни при каких условиях: записать поверх копии
  // пустоту — это потерять её. Ни смена пароля, ни свежий файл того не стоят.
  if (count === 0) return false
  if (force) return true
  if (lock.written !== null && lock.written !== lock.current) return true
  return shouldAutoBackup(state, count, signature)
}

export type BackupWarning =
  /** Копий нет вовсе, а данные уже есть. */
  | 'never'
  /** Вне копии накопилось заметное число записей — обычно после выгрузки с прибора. */
  | 'behind'
  /** Копия есть, но устарела: с тех пор прошло много дней и записи изменились. */
  | 'stale'
  | null

export function backupWarning(state: BackupState, count: number, now: number): BackupWarning {
  if (count === 0) return null
  if (state.lastAt === null) return 'never'
  // Полная копия — молчим, сколько бы времени ни прошло: терять нечего.
  if (state.lastCount === count) return null
  if (count - state.lastCount >= BEHIND_COUNT) return 'behind'
  return now - state.lastAt >= STALE_DAYS * DAY ? 'stale' : null
}

/** Сколько записей ещё не попало в копию. Отрицательным не бывает: удаления не потеря. */
export function recordsBehind(state: BackupState, count: number): number {
  return Math.max(0, count - state.lastCount)
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
export function backupFilename(now: number, personName?: string): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  // Имя человека в названии: в общей папке семьи лежит несколько копий, и
  // «дневник-здоровья-2026-09-05.json» у всех одинаковый — не разобрать, чей.
  const чей = (personName ?? '').trim().replace(/[\\/:*?"<>|]/g, '')
  const кто = чей && чей !== 'Я' ? `-${чей}` : ''
  return `дневник${кто}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}
