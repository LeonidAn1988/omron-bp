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

/** На сколько дней хватит остатка. `null` — нечего или не из чего считать. */
export function supplyDays(medicine: Medicine): number | null {
  if (medicine.left === null || medicine.perDay === null || medicine.perDay <= 0) return null
  return Math.floor(medicine.left / medicine.perDay)
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

  if (medicine.left !== null && medicine.left <= 0) return { kind: 'out', days: 0 }

  const supply = supplyDays(medicine)
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
