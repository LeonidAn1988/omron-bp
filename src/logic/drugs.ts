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
  /**
   * Варианты выпуска: `[номер формы в словаре, дозировки]`.
   *
   * Один препарат выпускают в нескольких формах, и дозировки у них разные:
   * у геля «5 %», у капсул «200 мг». Общий список дозировок был бы смесью,
   * из которой человек выбрал бы несуществующую пару.
   */
  v?: [number, string[]][]
}

/** Форма выпуска с её дозировками — то же, что вариант, но уже с названием. */
export interface DrugVariant {
  form: string
  doses: string[]
}

export interface DrugBook {
  /** Дата выгрузки реестра. Справочник устаревает, и это видно в интерфейсе. */
  date: string
  /** Словарь форм. Названия повторяются тысячами раз, поэтому вынесены отдельно. */
  forms: string[]
  items: Drug[]
}

/** Разворачивает варианты препарата в названия форм. */
export function variantsOf(drug: Drug, forms: string[]): DrugVariant[] {
  return (drug.v ?? []).map(([index, doses]) => ({ form: forms[index] ?? '', doses })).filter((v) => v.form !== '')
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

/**
 * Подпись под названием в подсказке: чем этот препарат является.
 *
 * Форм бывает несколько, но в подсказке нужна одна — она даёт понять, о каком
 * препарате речь. Остальные человек увидит, когда выберет.
 */
export function describeDrug(drug: Drug, forms: string[] = []): string {
  const first = drug.v?.[0] !== undefined ? forms[drug.v[0][0]] : undefined
  return [drug.i, first?.toLowerCase()].filter(Boolean).join(' · ')
}
