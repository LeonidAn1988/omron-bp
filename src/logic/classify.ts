/**
 * Классификация уровня артериального давления.
 *
 * Шкала категорий — офисная (ESC/ESH, те же градации в российских клинических
 * рекомендациях по артериальной гипертензии). Для домашних измерений порог
 * гипертензии ниже — 135/85, поэтому «норма дома» считается отдельно.
 *
 * Это справочная разметка, а не диагноз.
 */

export type Level = 'low' | 'optimal' | 'normal' | 'high-normal' | 'ht1' | 'ht2' | 'ht3'

export interface Category {
  level: Level
  label: string
  /** Ключ CSS-переменной с цветом категории. */
  color: string
}

const CATEGORIES: Record<Level, Category> = {
  low: { level: 'low', label: 'Пониженное', color: 'var(--c-low)' },
  optimal: { level: 'optimal', label: 'Оптимальное', color: 'var(--c-optimal)' },
  normal: { level: 'normal', label: 'Нормальное', color: 'var(--c-normal)' },
  'high-normal': { level: 'high-normal', label: 'Высокое нормальное', color: 'var(--c-high-normal)' },
  ht1: { level: 'ht1', label: 'АГ 1 степени', color: 'var(--c-ht1)' },
  ht2: { level: 'ht2', label: 'АГ 2 степени', color: 'var(--c-ht2)' },
  ht3: { level: 'ht3', label: 'АГ 3 степени', color: 'var(--c-ht3)' },
}

export const ALL_CATEGORIES: Category[] = [
  CATEGORIES.low,
  CATEGORIES.optimal,
  CATEGORIES.normal,
  CATEGORIES['high-normal'],
  CATEGORIES.ht1,
  CATEGORIES.ht2,
  CATEGORIES.ht3,
]

/** Категория определяется по тому показателю, который попал в более высокую группу. */
export function classify(sys: number, dia: number): Category {
  if (sys < 90 || dia < 60) return CATEGORIES.low
  if (sys >= 180 || dia >= 110) return CATEGORIES.ht3
  if (sys >= 160 || dia >= 100) return CATEGORIES.ht2
  if (sys >= 140 || dia >= 90) return CATEGORIES.ht1
  if (sys >= 130 || dia >= 85) return CATEGORIES['high-normal']
  if (sys >= 120 || dia >= 80) return CATEGORIES.normal
  return CATEGORIES.optimal
}

/** Домашний порог гипертензии — 135/85 (или индивидуальная цель врача). */
export function isWithinTarget(sys: number, dia: number, targetSys = 135, targetDia = 85): boolean {
  return sys < targetSys && dia < targetDia
}

export type AlertKind = 'crisis' | 'severe' | 'hypotension'

export interface Alert {
  kind: AlertKind
  text: string
}

/** Значения, при которых стоит не откладывать обращение к врачу. */
export function alertFor(sys: number, dia: number): Alert | null {
  if (sys >= 180 || dia >= 120) {
    return { kind: 'crisis', text: 'Очень высокое давление. При плохом самочувствии вызывайте скорую помощь.' }
  }
  if (sys >= 160 || dia >= 100) {
    return { kind: 'severe', text: 'Выраженно повышенное давление — обсудите с врачом.' }
  }
  if (sys < 90 || dia < 60) {
    return { kind: 'hypotension', text: 'Пониженное давление. При слабости и головокружении обратитесь к врачу.' }
  }
  return null
}

/** Часть суток — для разбора утренних и вечерних средних. */
export type DayPart = 'night' | 'morning' | 'day' | 'evening'

export const DAY_PART_LABELS: Record<DayPart, string> = {
  night: 'Ночь (00–04)',
  morning: 'Утро (04–12)',
  day: 'День (12–18)',
  evening: 'Вечер (18–24)',
}

export function dayPart(date: Date): DayPart {
  const hour = date.getHours()
  if (hour < 4) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'day'
  return 'evening'
}
