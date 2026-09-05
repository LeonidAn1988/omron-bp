/**
 * Аптеки, в которых можно посмотреть лекарство.
 *
 * Ссылка на поиск, и только она. Наличие и цену приложение не спрашивает: у
 * аптечных сетей нет открытых интерфейсов, а разбор их страниц — это чужие
 * правила использования, защита от роботов и вёрстка, ломающаяся без
 * предупреждения. Обещать «есть в трёх аптеках», не имея на то данных, хуже,
 * чем честно открыть поиск.
 *
 * Наружу при этом не уходит ничего от нас: переход делает сам человек со
 * своего телефона, и уносит он одно название препарата — без имени, без
 * диагноза и без остального списка.
 *
 * Адреса поиска проверены вручную 2 сентября 2026: у каждой сети открыт запрос
 * «периндоприл» и получен список товаров с ценами. Здравсити в список не попал
 * — его поиск по адресу не открывается, любой вариант уводит на главную.
 */

import type { Medicine } from '../types'

export interface Pharmacy {
  id: string
  name: string
  /** Шаблон: `{q}` заменяется запросом, уже закодированным для адреса. */
  search: string
}

export const PHARMACIES: Pharmacy[] = [
  { id: 'apteka-ru', name: 'Аптека.ру', search: 'https://apteka.ru/search/?q={q}' },
  { id: 'eapteka', name: 'ЕАптека', search: 'https://www.eapteka.ru/search/?q={q}' },
  { id: 'megapteka', name: 'Мегаптека', search: 'https://megapteka.ru/search?q={q}' },
]

/** Слова формы выпуска, которые попадают в название из реестра и мешают поиску. */
// Не `\b`: в JavaScript граница слова видит только латиницу, и «таблетки»
// после кириллического имени границей не считается. Поэтому — пробел или край.
// Только полные слова: «КАПС» бывает частью торгового имени («СЛАБИДОЛ КАПС»).
const ХВОСТЫ_ФОРМЫ =
  /(^|\s)(таблетки|капсулы|раствор|р-р|сироп|суспензия|мазь|крем|гель|капли|спрей|аэрозоль|порошок|драже|пластырь|свечи|суппозитории|пакетики?|саше)(?=\s|$).*$/iu

/**
 * Торговое имя, каким его знает поиск аптеки.
 *
 * Из реестра имя приходит со знаком ® («Конкор® Кор»), иногда с формой и
 * скобками. Внутри приложения `normalize` в drugs.ts это чистит, а наружу
 * имя уходило как есть — и аптека честно не находила «Конкор®». Знак меняется
 * на пробел, а не на пустоту: «СЛАБИДОЛ®КАПС» иначе склеивается в одно слово.
 */
export function cleanTradeName(name: string): string {
  return name
    .replace(/[®™©]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(ХВОСТЫ_ФОРМЫ, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Лестница запросов — от точного к широкому.
 *
 * Аптеки ищут по-разному: одна найдёт «Конкор Кор 2,5 мг», другой нужно
 * «Конкор», третья знает только вещество. Первая ступень идёт в кнопку сети,
 * вещество — в отдельную ссылку рядом; остальное — запас на будущее, когда
 * появится способ понять, что сеть ничего не нашла.
 */
export function pharmacyQueries(medicine: Pick<Medicine, 'name' | 'dose' | 'inn'>): string[] {
  const имя = cleanTradeName(medicine.name)
  const доза = (medicine.dose ?? '').trim()
  const вещество = cleanTradeName(medicine.inn ?? '')
  const первоеСлово = имя.split(' ')[0] ?? ''
  // Дозировка сама по себе — не запрос: без имени ступени по имени пропускаем.
  const ступени = [
    ...(имя ? [[имя, доза].filter(Boolean).join(' '), имя, первоеСлово] : []),
    ...(вещество ? [[вещество, доза].filter(Boolean).join(' '), вещество] : []),
  ]
  const итог: string[] = []
  for (const q of ступени) if (q && !итог.includes(q)) итог.push(q)
  return итог
}

/** Первая ступень лестницы: то, что уходит в кнопку сети. */
export function pharmacyQuery(medicine: Pick<Medicine, 'name' | 'dose' | 'inn'>): string {
  return pharmacyQueries(medicine)[0] ?? ''
}

/**
 * Ссылки на выбранные аптеки. У каждой — адрес по торговому имени и, если
 * известно вещество, второй адрес по нему: дешёвый аналог находится так.
 */
export function pharmacyLinks(
  medicine: Pick<Medicine, 'name' | 'dose' | 'inn'>,
  chosen: readonly string[],
): { id: string; name: string; href: string; innHref: string | null }[] {
  const запрос = encodeURIComponent(pharmacyQuery(medicine))
  if (!запрос) return []
  const вещество = cleanTradeName(medicine.inn ?? '')
  const поВеществу = вещество && вещество.toLowerCase() !== cleanTradeName(medicine.name).toLowerCase()
    ? encodeURIComponent([вещество, (medicine.dose ?? '').trim()].filter(Boolean).join(' '))
    : null
  return PHARMACIES.filter((item) => chosen.includes(item.id)).map((item) => ({
    id: item.id,
    name: item.name,
    href: item.search.replace('{q}', запрос),
    innHref: поВеществу ? item.search.replace('{q}', поВеществу) : null,
  }))
}

/** Строка для настроек: какие аптеки выбраны. */
export function describePharmacies(chosen: readonly string[]): string {
  const свои = PHARMACIES.filter((item) => chosen.includes(item.id))
  if (свои.length === 0) return 'не выбраны'
  return свои.map((item) => item.name).join(', ')
}

/**
 * Общий поиск — когда своих аптек не выбрано.
 *
 * Раньше это была единственная кнопка «Найти в аптеке»: поисковик по названию,
 * дозировке и словам «купить в аптеке». Он остаётся для тех, кто аптеки не
 * выбирал, и как запасной путь, если у выбранной сети ничего не нашлось.
 */
export function searchEngineUrl(medicine: Pick<Medicine, 'name' | 'dose' | 'inn'>): string {
  const query = [medicine.inn || medicine.name, medicine.dose, 'купить в аптеке'].filter(Boolean).join(' ')
  return `https://yandex.ru/search/?text=${encodeURIComponent(query)}`
}
