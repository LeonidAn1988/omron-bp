/**
 * Аптеки: ссылка на поиск и ничего больше.
 *
 * Проверяется главное обещание: запрос собирается из названия и дозировки, а
 * адрес получается ровно тот, что проверен вручную на телефоне. Ошибка здесь
 * ведёт человека на пустую страницу в магазине лекарств — и он решит, что
 * препарата нет в продаже.
 */
import { PHARMACIES, pharmacyQuery, pharmacyLinks, describePharmacies, searchEngineUrl } from './build/api.mjs'

export function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }

  const конкор = { name: 'Конкор', dose: '5 мг', inn: 'Бисопролол' }

  check('запрос — название с упаковки и дозировка', pharmacyQuery(конкор) === 'Конкор 5 мг')
  check('без названия берётся вещество', pharmacyQuery({ name: '  ', dose: '5 мг', inn: 'Бисопролол' }) === 'Бисопролол 5 мг')
  check('без дозировки — одно название', pharmacyQuery({ name: 'Конкор', dose: '' }) === 'Конкор')

  const все = pharmacyLinks(конкор, PHARMACIES.map((p) => p.id))
  check('ссылка на каждую выбранную аптеку', все.length === PHARMACIES.length)
  check('запрос закодирован', все.every((l) => l.href.includes('%D0%9A%D0%BE%D0%BD%D0%BA%D0%BE%D1%80')))
  check('в адресе не осталось шаблона', все.every((l) => !l.href.includes('{q}')))
  check('все адреса — https', все.every((l) => l.href.startsWith('https://')))
  check('пробел не попал в адрес сырым', все.every((l) => !/\s/.test(l.href)))

  check('невыбранных аптек в списке нет', pharmacyLinks(конкор, ['apteka-ru']).length === 1)
  check('ни одной не выбрано — ссылок нет', pharmacyLinks(конкор, []).length === 0)
  check('без названия и вещества ссылок нет', pharmacyLinks({ name: '', dose: '' }, ['apteka-ru']).length === 0)

  check('подпись перечисляет выбранные', describePharmacies(['apteka-ru', 'megapteka']).includes('Аптека.ру'))
  check('ничего не выбрано', describePharmacies([]) === 'не выбраны')
  check('чужой ключ в подпись не попадает', describePharmacies(['неизвестная']) === 'не выбраны')

  check('общий поиск ищет по веществу', searchEngineUrl(конкор).includes(encodeURIComponent('Бисопролол')))

  // Адреса проверены вручную 2 сентября 2026 — тест сторожит опечатку в них.
  const адреса = Object.fromEntries(PHARMACIES.map((p) => [p.id, p.search]))
  check('Аптека.ру', адреса['apteka-ru'] === 'https://apteka.ru/search/?q={q}')
  check('ЕАптека', адреса['eapteka'] === 'https://www.eapteka.ru/search/?q={q}')
  check('Мегаптека', адреса['megapteka'] === 'https://megapteka.ru/search?q={q}')

  return failures
}
