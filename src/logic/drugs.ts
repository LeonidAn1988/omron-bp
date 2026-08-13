/**
 * Справочник лекарств: поиск по названию.
 *
 * Данные собираются из Государственного реестра лекарственных средств
 * генератором `tools/build_drugs.py` и лежат файлом рядом со сборкой. По сети
 * реестр из браузера не забрать — у выгрузки нет заголовков CORS, а ставить
 * своё зеркало значит пропускать через чужой сервер перечень лекарств
 * конкретного человека. Файл в бандле честнее.
 *
 * Здесь только поиск, без DOM и без React: на нативных платформах файл переедет
 * как есть.
 */

export interface Drug {
  /** Торговое наименование, как в реестре. */
  n: string
  /** Международное непатентованное наименование. Врач называет препарат им. */
  i?: string
  /** Форма выпуска: таблетки, капсулы, раствор. */
  f?: string
  /** Дозировки, которые у этого препарата бывают. */
  d?: string[]
}

export interface DrugBook {
  /** Дата выгрузки реестра. Справочник устаревает, и это видно в интерфейсе. */
  date: string
  items: Drug[]
}

/**
 * Приводим к сравнимому виду: реестр пишет «Аспирин® Кардио», человек набирает
 * «аспирин кардио». Без этого половина знакомых названий не находится.
 */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[®™©]/g, '')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .trim()
}

/** Сколько подсказок показываем. Больше — список не помещается и его перестают читать. */
export const SUGGEST_LIMIT = 8

/**
 * Поиск препарата.
 *
 * Совпадение с начала названия важнее совпадения в середине: набрав «кард»,
 * человек ищет «Кардиомагнил», а не «Аспирин® Кардио». Внутри одной группы —
 * по алфавиту, потому что реестр отсортирован и порядок предсказуем.
 */
export function searchDrugs(items: Drug[], query: string, limit = SUGGEST_LIMIT): Drug[] {
  const needle = normalize(query)
  if (needle.length < 2) return []

  const starts: Drug[] = []
  const inside: Drug[] = []

  for (const item of items) {
    const name = normalize(item.n)
    if (name.startsWith(needle)) {
      starts.push(item)
      if (starts.length >= limit) break
    } else if (inside.length < limit && name.includes(needle)) {
      inside.push(item)
    }
  }

  return [...starts, ...inside].slice(0, limit)
}

/** Подпись под названием в подсказке: чем этот препарат является. */
export function describeDrug(drug: Drug): string {
  return [drug.i, drug.f].filter(Boolean).join(' · ')
}
