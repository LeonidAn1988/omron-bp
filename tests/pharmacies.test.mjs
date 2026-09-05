/**
 * Аптеки: ссылка на поиск и ничего больше.
 *
 * Проверяется главное обещание: запрос собирается из названия и дозировки, а
 * адрес получается ровно тот, что проверен вручную на телефоне. Ошибка здесь
 * ведёт человека на пустую страницу в магазине лекарств — и он решит, что
 * препарата нет в продаже.
 */
import { PHARMACIES, pharmacyQuery, pharmacyQueries, pharmacyLinks, cleanTradeName, describePharmacies, searchEngineUrl } from './build/api.mjs'

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

  // Имя из реестра — со знаком ® и хвостом формы. В аптеку оно уходит чистым.
  const реестр = { name: 'Конкор® Кор', dose: '2,5 мг', inn: 'Бисопролол' }
  check('знак ® вычищается', cleanTradeName('Конкор® Кор') === 'Конкор Кор')
  check('знак без пробела не склеивает слова', cleanTradeName('СЛАБИДОЛ®КАПС') === 'СЛАБИДОЛ КАПС')
  check('хвост формы отрезается', cleanTradeName('Амлодипин таблетки 5 мг') === 'Амлодипин')
  check('скобки отрезаются', cleanTradeName('Магний B6 (форте)') === 'Магний B6')
  const лестница = pharmacyQueries(реестр)
  check('лестница: пять ступеней от точного к широкому', лестница.join(' | ') === 'Конкор Кор 2,5 мг | Конкор Кор | Конкор | Бисопролол 2,5 мг | Бисопролол', лестница.join(' | '))
  check('дубли и пустые ступени выпадают', pharmacyQueries({ name: 'Конкор', dose: '' }).join(' | ') === 'Конкор')
  const ссылки = pharmacyLinks(реестр, ['megapteka'])
  check('в адресе нет ®', !ссылки[0].href.includes('%C2%AE'))
  check('первая ступень — в кнопку сети', decodeURIComponent(ссылки[0].href).endsWith('Конкор Кор 2,5 мг'))
  check('по веществу — второй адрес той же сети', decodeURIComponent(ссылки[0].innHref ?? '').endsWith('Бисопролол 2,5 мг'))
  check('без вещества второго адреса нет', pharmacyLinks({ name: 'Конкор', dose: '5 мг' }, ['megapteka'])[0].innHref === null)
  check('вещество, совпадающее с именем, второй адрес не даёт', pharmacyLinks({ name: 'Бисопролол', dose: '5 мг', inn: 'Бисопролол' }, ['megapteka'])[0].innHref === null)

  // Адреса проверены вручную 2 сентября 2026 — тест сторожит опечатку в них.
  const адреса = Object.fromEntries(PHARMACIES.map((p) => [p.id, p.search]))
  check('Аптека.ру', адреса['apteka-ru'] === 'https://apteka.ru/search/?q={q}')
  check('ЕАптека', адреса['eapteka'] === 'https://www.eapteka.ru/search/?q={q}')
  check('Мегаптека', адреса['megapteka'] === 'https://megapteka.ru/search?q={q}')
  check('Здравсити — параметр what, а не q', адреса['zdravcity'] === 'https://zdravcity.ru/search/?what={q}')
  check('Ютека — параметр query', адреса['uteka'] === 'https://uteka.ru/search/?query={q}')
  check('Планета Здоровья', адреса['planeta'] === 'https://planetazdorovo.ru/search/?q={q}')
  check('сетей шесть', PHARMACIES.length === 6)

  return failures
}
