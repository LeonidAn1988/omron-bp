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

/**
 * Что искать: название с упаковки и дозировка.
 *
 * Именно название, а не действующее вещество: человек идёт за той коробкой,
 * которую ему назначили. Действующее вещество остаётся запасным вариантом —
 * без названия по нему хотя бы найдётся аналог.
 */
export function pharmacyQuery(medicine: Pick<Medicine, 'name' | 'dose' | 'inn'>): string {
  const название = medicine.name.trim() || (medicine.inn ?? '').trim()
  return [название, (medicine.dose ?? '').trim()].filter(Boolean).join(' ')
}

/** Ссылки на выбранные аптеки. Пусто — ни одна не выбрана. */
export function pharmacyLinks(
  medicine: Pick<Medicine, 'name' | 'dose' | 'inn'>,
  chosen: readonly string[],
): { id: string; name: string; href: string }[] {
  const запрос = encodeURIComponent(pharmacyQuery(medicine))
  if (!запрос) return []
  return PHARMACIES.filter((item) => chosen.includes(item.id)).map((item) => ({
    id: item.id,
    name: item.name,
    href: item.search.replace('{q}', запрос),
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
