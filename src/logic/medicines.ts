import type { Medicine } from '../types'

/**
 * Правила аптечки: когда препарат кончается и когда истекает срок.
 *
 * Приложение считает упаковки и даты — и только. Оно не советует, что принимать,
 * не меняет дозировки и не толкует назначения врача; формулировки предупреждений
 * поэтому описательные («срок истёк 12 мая»), а не побудительные.
 *
 * Без DOM и без React: файл переезжает на нативные платформы как есть.
 */

const DAY = 24 * 60 * 60 * 1000

/** За сколько дней до конца срока годности пора покупать замену. */
export const EXPIRY_SOON_DAYS = 30

/** На сколько дней запаса предупреждаем. Неделя — чтобы успеть дойти до аптеки. */
export const SUPPLY_SOON_DAYS = 7

export type MedicineAlertKind =
  /** Срок годности истёк. */
  | 'expired'
  /** Кончился: остаток ноль. */
  | 'out'
  /** Запаса меньше недели. */
  | 'low'
  /** Срок годности истекает в ближайший месяц. */
  | 'expiring'

export interface MedicineAlert {
  kind: MedicineAlertKind
  /** Дни до события: до конца срока или до конца запаса. Отрицательные — уже позади. */
  days: number
}

/** Начало сегодняшнего дня по местному времени: сроки годности — про дни, не про часы. */
export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Срок годности вводится месяцем, а не датой: на упаковке печатают «05/2027»,
 * и препарат годен весь этот месяц. Хранится последний годный день — иначе
 * предупреждение приходило бы на месяц раньше, чем нужно.
 */
export function monthToExpiry(value: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  // Нулевой день следующего месяца — последний день текущего.
  return new Date(year, month, 0).getTime()
}

/** Обратно в значение для поля ввода: «2027-05». */
export function expiryToMonth(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Сколько дней хранить отметки о приёме. История за годы не нужна, а копию раздувает. */
export const KEEP_INTAKES_DAYS = 60

/** Штук за один приём. По умолчанию одна — так на упаковке и в назначении чаще всего. */
export const perTimeOf = (medicine: Medicine): number => medicine.perTime ?? 1

/**
 * Сколько уходит в сутки.
 *
 * Если задано расписание, суточный расход считается по нему: держать отдельно
 * список времён и число «в день» значит рано или поздно их разойтись.
 */
export function perDayOf(medicine: Medicine): number | null {
  const times = medicine.times ?? []
  if (times.length > 0) return times.length * perTimeOf(medicine)
  return medicine.perDay
}

/**
 * Остаток с поправкой на прошедшие дни.
 *
 * Подтверждённый остаток — это снимок на дату `leftAt`. Человек не правит его
 * каждый день, поэтому по нему одному предупреждение «пора заказывать» не
 * срабатывало никогда. Здесь считается ожидаемый остаток; он именно ожидаемый,
 * и в интерфейсе подписан как расчётный, а не как факт.
 */
export function projectedLeft(medicine: Medicine, now: number): number | null {
  const { left } = medicine
  const perDay = perDayOf(medicine)
  if (left === null) return null
  if (!medicine.leftAt || perDay === null || perDay <= 0) return left
  const days = Math.floor((startOfDay(now) - startOfDay(medicine.leftAt)) / DAY)
  if (days <= 0) return left
  return Math.max(0, left - days * perDay)
}

/**
 * Остаток, который показываем человеку.
 *
 * При автосписании расчётный остаток и есть ответ: человек согласился, что
 * назначенное принимается, и оговорка «по расчёту» ему только мешает. Без
 * автосписания правдой остаётся подтверждённое число, а расчёт идёт рядом
 * пометкой.
 */
export function effectiveLeft(medicine: Medicine, now: number): number | null {
  return medicine.autoDeduct ? projectedLeft(medicine, now) : medicine.left
}

/** Показанное число — оценка, а не подтверждённый факт. */
export function isEstimated(medicine: Medicine, now: number): boolean {
  const shown = effectiveLeft(medicine, now)
  return shown !== null && medicine.left !== null && shown !== medicine.left
}

/** Когда запас кончится. `null` — считать не из чего. */
export function runsOutAt(medicine: Medicine, now: number): number | null {
  const days = supplyDays(medicine, now)
  return days === null ? null : startOfDay(now) + days * DAY
}

/** На сколько дней хватит остатка. `null` — нечего или не из чего считать. */
export function supplyDays(medicine: Medicine, now?: number): number | null {
  const perDay = perDayOf(medicine)
  const left = now === undefined ? medicine.left : projectedLeft(medicine, now)
  if (left === null || perDay === null || perDay <= 0) return null
  return Math.floor(left / perDay)
}

/** Сколько дней до конца срока годности. Отрицательное — срок истёк. */
export function daysToExpiry(medicine: Medicine, now: number): number | null {
  if (medicine.expires === null) return null
  return Math.round((startOfDay(medicine.expires) - startOfDay(now)) / DAY)
}

/**
 * Единственное предупреждение по препарату — самое существенное.
 *
 * Показывать сразу два («истёк срок» и «кончается») незачем: список превращается
 * в частокол пометок, и человек перестаёт их читать. Порядок строгий: истёкший
 * срок важнее пустой упаковки, потому что просроченное ещё и лежит в аптечке.
 */
export function medicineAlert(medicine: Medicine, now: number): MedicineAlert | null {
  const expiry = daysToExpiry(medicine, now)
  if (expiry !== null && expiry < 0) return { kind: 'expired', days: expiry }

  // «Закончился» — только по подтверждённому остатку. Расчётный для этого не
  // годится: сказать «кончился», когда пачка лежит в тумбочке, значит соврать.
  if (medicine.left !== null && medicine.left <= 0) return { kind: 'out', days: 0 }

  const supply = supplyDays(medicine, now)
  if (supply !== null && supply <= SUPPLY_SOON_DAYS) return { kind: 'low', days: supply }

  if (expiry !== null && expiry <= EXPIRY_SOON_DAYS) return { kind: 'expiring', days: expiry }

  return null
}

/** Насколько срочно. Больше — важнее; для сортировки списка и выбора главного предупреждения. */
export function alertWeight(alert: MedicineAlert | null): number {
  if (!alert) return 0
  return { expired: 4, out: 3, low: 2, expiring: 1 }[alert.kind]
}

/**
 * Порядок в списке: сначала требующее внимания, потом по алфавиту.
 *
 * Алфавит вторым ключом, а не дата добавления: в аптечке из полутора десятков
 * коробок ищут глазами по названию.
 */
export function sortMedicines(items: Medicine[], now: number): Medicine[] {
  return [...items].sort((a, b) => {
    const diff = alertWeight(medicineAlert(b, now)) - alertWeight(medicineAlert(a, now))
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name, 'ru')
  })
}

/** Сколько препаратов требуют внимания — для пометки на вкладке и плашки на обзоре. */
export function countAlerts(items: Medicine[], now: number): number {
  return items.filter((m) => medicineAlert(m, now) !== null).length
}

// ── расписание и приём ─────────────────────────────────────────────────────

/** Разбирает «08:30» в минуты от полуночи. `null` — не время. */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/** Обратно: 510 → «08:30». Двузначные часы — чтобы строки сортировались как время. */
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Расписание по возрастанию времени, без повторов и без мусора. */
export function normalizeTimes(times: string[]): string[] {
  const minutes = times
    .map(parseTime)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b)
  return [...new Set(minutes)].map(formatTime)
}

/** Момент приёма сегодня: время плюс сегодняшняя дата. */
export function doseAt(time: string, now: number): number | null {
  const minutes = parseTime(time)
  if (minutes === null) return null
  return startOfDay(now) + minutes * 60_000
}

export interface DoseSlot {
  time: string
  /** Отметка о приёме, если он уже сделан сегодня. */
  takenAt: number | null
  /** Время приёма уже прошло, а отметки нет. */
  overdue: boolean
}

/**
 * Что сегодня по расписанию.
 *
 * Отметка привязывается к ближайшему приёму, а не к точному времени: человек
 * принимает таблетку в 8:10 или в 7:40, и требовать попадания в минуту нельзя.
 */
export function dosesToday(medicine: Medicine, now: number): DoseSlot[] {
  const times = normalizeTimes(medicine.times ?? [])
  if (times.length === 0) return []

  const dayStart = startOfDay(now)
  const marks = (medicine.taken ?? []).filter((t) => t >= dayStart && t < dayStart + DAY).sort((a, b) => a - b)
  const used = new Set<number>()

  return times.map((time) => {
    const planned = doseAt(time, now)!
    let best: number | null = null
    let bestGap = Infinity
    for (const mark of marks) {
      if (used.has(mark)) continue
      const gap = Math.abs(mark - planned)
      if (gap < bestGap) {
        bestGap = gap
        best = mark
      }
    }
    if (best !== null) used.add(best)
    return { time, takenAt: best, overdue: best === null && now > planned }
  })
}

/** Сколько доз сегодня ещё не отмечено. Для пометки на переключателе. */
export function pendingToday(items: Medicine[], now: number): number {
  return items.reduce((sum, m) => sum + dosesToday(m, now).filter((d) => d.takenAt === null).length, 0)
}

/**
 * Отметить приём: списать штуки с остатка и запомнить время.
 *
 * Возвращает новый препарат — исходный не меняется, чтобы React увидел
 * изменение, а вызывающий код сам решил, сохранять его или нет.
 */
export function markTaken(medicine: Medicine, now: number): Medicine {
  const horizon = now - KEEP_INTAKES_DAYS * DAY
  const taken = [...(medicine.taken ?? []).filter((t) => t >= horizon), now].sort((a, b) => a - b)
  // При автосписании расписание уже списало эту дозу: отметка её только
  // фиксирует, иначе одна таблетка ушла бы из остатка дважды.
  if (medicine.autoDeduct) return { ...medicine, taken }
  const left = medicine.left === null ? null : Math.max(0, medicine.left - perTimeOf(medicine))
  // Остаток пересчитан только что — расчётной поправке не с чего начинать заново.
  return { ...medicine, taken, left, leftAt: now }
}

/** Снять ошибочную отметку и вернуть штуки в остаток. */
export function undoTaken(medicine: Medicine, at: number): Medicine {
  const taken = (medicine.taken ?? []).filter((t) => t !== at)
  if (medicine.autoDeduct) return { ...medicine, taken }
  const left = medicine.left === null ? null : medicine.left + perTimeOf(medicine)
  return { ...medicine, taken, left, leftAt: Date.now() }
}

/**
 * Правка остатка руками: пересчитали упаковку — говорим приложению точное
 * число. Это же снимает накопленную расчётную поправку: отсчёт начинается
 * заново от сегодняшнего дня.
 */
export function setLeft(medicine: Medicine, value: number | null, now: number): Medicine {
  return { ...medicine, left: value === null ? null : Math.max(0, Math.round(value)), leftAt: now }
}

/**
 * Форма коротко — для списка аптечки.
 *
 * Реестр пишет «Таблетки покрытые пленочной оболочкой», и в ежедневном списке
 * это две строки мелкого текста, из которых человеку нужно одно слово: таблетки
 * это, капли или гель. Полное название остаётся там, где важна точность, — в
 * отчёте для врача и в форме правки.
 */
export function shortForm(form: string | undefined): string {
  if (!form) return ''
  return form.trim().split(/[\s,]+/)[0].toLowerCase()
}

// ── список для заказа ──────────────────────────────────────────────────────

/** На сколько дней вперёд закупаемся. Месяц — обычный горизонт рецепта. */
export const RESTOCK_DAYS = 30

export interface RestockItem {
  medicine: Medicine
  /** Почему попал в список. */
  reason: 'out' | 'low' | 'expired' | 'expiring'
  /** Сколько штук докупить до месячного запаса. `null` — расход неизвестен. */
  need: number | null
}

const REASON_WEIGHT: Record<RestockItem['reason'], number> = { out: 4, expired: 3, low: 2, expiring: 1 }

/**
 * Что пора купить.
 *
 * Список строится из тех же правил, что и предупреждения в аптечке, — иначе
 * человек видел бы тревогу на карточке и пустой список покупок рядом. Просроченное
 * входит наравне с кончающимся: пачка есть, но принимать её нельзя, значит
 * купить всё равно нужно.
 */
export function restockList(items: Medicine[], now: number): RestockItem[] {
  const list: RestockItem[] = []

  for (const medicine of items) {
    const alert = medicineAlert(medicine, now)
    if (!alert) continue

    const perDay = perDayOf(medicine)
    const left = alert.kind === 'expired' ? 0 : Math.max(0, projectedLeft(medicine, now) ?? 0)
    // Докупаем до месячного запаса. Просроченное считаем за ноль: старую пачку
    // в расчёт брать нельзя.
    const need = perDay !== null && perDay > 0 ? Math.max(0, Math.ceil(RESTOCK_DAYS * perDay - left)) : null

    list.push({ medicine, reason: alert.kind, need: need === 0 ? null : need })
  }

  return list.sort((a, b) => {
    const weight = REASON_WEIGHT[b.reason] - REASON_WEIGHT[a.reason]
    return weight !== 0 ? weight : a.medicine.name.localeCompare(b.medicine.name, 'ru')
  })
}

/**
 * Список одной строкой на препарат — чтобы отправить себе или показать в аптеке.
 *
 * Простой текст, а не файл: его вставляют в мессенджер, диктуют по телефону и
 * читают с экрана у прилавка. Действующее вещество идёт следом за названием:
 * в аптеке предложат аналог, и по веществу его сверяют.
 */
export function restockText(list: RestockItem[]): string {
  return list
    .map(({ medicine, need }) => {
      const parts = [medicine.name, medicine.dose, shortForm(medicine.form)].filter(Boolean)
      const inn = medicine.inn && medicine.inn !== medicine.name ? ` (${medicine.inn})` : ''
      const count = need !== null ? ` — ${need} шт.` : ''
      return `${parts.join(', ')}${inn}${count}`
    })
    .join('\n')
}
