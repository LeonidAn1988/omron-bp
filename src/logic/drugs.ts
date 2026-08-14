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
   * Варианты выпуска: `[номер формы в словаре, дозировки, размеры упаковки]`.
   *
   * Один препарат выпускают в нескольких формах, и дозировки у них разные:
   * у геля «5 %», у капсул «200 мг». Общий список дозировок был бы смесью,
   * из которой человек выбрал бы несуществующую пару.
   */
  v?: [number, string[], number[]?][]
  /** Производители — номера в словаре. Держим до трёх: нужно узнать свою пачку. */
  m?: number[]
}

/** Форма выпуска с её дозировками и размерами упаковки. */
export interface DrugVariant {
  form: string
  doses: string[]
  packs: number[]
}

export interface DrugBook {
  /** Дата выгрузки реестра. Справочник устаревает, и это видно в интерфейсе. */
  date: string
  /** Словарь форм. Названия повторяются тысячами раз, поэтому вынесены отдельно. */
  forms: string[]
  /** Словарь производителей — по той же причине. */
  makers: string[]
  items: Drug[]
}

/** Разворачивает варианты препарата в названия форм. */
export function variantsOf(drug: Drug, forms: string[]): DrugVariant[] {
  return (drug.v ?? [])
    .map(([index, doses, packs]) => ({ form: forms[index] ?? '', doses, packs: packs ?? [] }))
    .filter((v) => v.form !== '')
}

/** Производители препарата словами. */
export function makersOf(drug: Drug, makers: string[]): string[] {
  return (drug.m ?? []).map((index) => makers[index] ?? '').filter(Boolean)
}

/**
 * Крупные группы форм для первого шага поиска.
 *
 * В реестре 2289 разных написаний формы — списком их не покажешь. Человек же
 * держит в руках коробку и знает одно: таблетки это или мазь. Группа сужает
 * поиск, а точное написание подставится потом из самого препарата.
 */
export const FORM_GROUPS: { key: string; title: string; match: string[] }[] = [
  { key: 'tab', title: 'Таблетки', match: ['таблетк', 'драже', 'пастилк'] },
  { key: 'cap', title: 'Капсулы', match: ['капсул'] },
  { key: 'drops', title: 'Капли', match: ['капли'] },
  { key: 'syrup', title: 'Сироп, суспензия', match: ['сироп', 'суспензи', 'эмульси'] },
  { key: 'inj', title: 'Ампулы, раствор', match: ['раствор', 'лиофилизат', 'концентрат', 'порошок для'] },
  { key: 'ointment', title: 'Мазь, крем, гель', match: ['мазь', 'крем', 'гель', 'линимент'] },
  { key: 'spray', title: 'Спрей, аэрозоль', match: ['спрей', 'аэрозоль'] },
  { key: 'other', title: 'Другое', match: [] },
]

/** К какой группе относится форма. Неопознанное попадает в «Другое». */
export function formGroup(form: string): string {
  const text = form.toLowerCase()
  for (const group of FORM_GROUPS) {
    if (group.match.some((needle) => text.includes(needle))) return group.key
  }
  return 'other'
}

/** Оставляет препараты, у которых есть форма из выбранной группы. */
export function filterByForm(items: Drug[], forms: string[], group: string): Drug[] {
  if (!group) return items
  return items.filter((drug) => (drug.v ?? []).some(([index]) => formGroup(forms[index] ?? '') === group))
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

/** По какому полю нашёлся препарат — подсказка показывает это словами. */
export type MatchField = 'name' | 'inn' | 'maker'

export interface DrugHit {
  drug: Drug
  field: MatchField
}

/**
 * Поиск препарата по названию, действующему веществу и производителю.
 *
 * Порядок важности жёсткий: начало названия, затем название целиком, затем
 * вещество, затем производитель. Набрав «кард», человек ищет «Кардиомагнил», а
 * не всё, что выпускает «Кардиоцентр». Поиск по веществу нужен, когда врач
 * назвал препарат одним словом, а на упаковке другое; по производителю — когда
 * в руках коробка и знакомо только название завода.
 */
export function searchHits(
  items: Drug[],
  query: string,
  makers: string[] = [],
  limit = SUGGEST_LIMIT,
): DrugHit[] {
  const needle = normalize(query)
  if (needle.length < 2) return []

  const buckets: DrugHit[][] = [[], [], [], []]

  for (const item of items) {
    const name = normalize(item.n)
    if (name.startsWith(needle)) buckets[0].push({ drug: item, field: 'name' })
    else if (name.includes(needle)) buckets[1].push({ drug: item, field: 'name' })
    else if (item.i && normalize(item.i).includes(needle)) buckets[2].push({ drug: item, field: 'inn' })
    else if ((item.m ?? []).some((index) => normalize(makers[index] ?? '').includes(needle)))
      buckets[3].push({ drug: item, field: 'maker' })

    // Раньше выхода нет: точные совпадения могут встретиться в конце реестра,
    // а он отсортирован по алфавиту, а не по важности.
    if (buckets[0].length >= limit) break
  }

  return buckets.flat().slice(0, limit)
}

/** Совместимость: части кода нужен только список препаратов, без поля совпадения. */
export function searchDrugs(items: Drug[], query: string, limit = SUGGEST_LIMIT): Drug[] {
  return searchHits(items, query, [], limit).map((hit) => hit.drug)
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

/**
 * Адрес официальной инструкции.
 *
 * Прямой ссылки на инструкцию у реестра нет: страница ГРЛС — форма с постбэком,
 * по адресу с параметрами она не открывается (проверено). Поэтому открываем
 * поиск по названию и дозировке. Наружу уходит только название препарата — оно
 * и так публично, ничего о человеке в запросе нет.
 */
export function instructionUrl(name: string, dose?: string): string {
  const query = [name, dose, 'инструкция по применению'].filter(Boolean).join(' ')
  return `https://yandex.ru/search/?text=${encodeURIComponent(query)}`
}
