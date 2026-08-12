/** Когда препарат считается кончающимся и когда просроченным. */
import {
  medicineAlert,
  supplyDays,
  daysToExpiry,
  sortMedicines,
  countAlerts,
  monthToExpiry,
  expiryToMonth,
  EXPIRY_SOON_DAYS,
  SUPPLY_SOON_DAYS,
  plural,
} from './build/api.mjs'

export function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }

  const DAY = 24 * 60 * 60 * 1000
  const now = new Date(2026, 7, 13, 15, 30, 0).getTime()
  const med = (over) => ({ id: 'x', name: 'Тест', dose: '', left: null, perDay: null, expires: null, ...over })

  // ── срок годности вводится месяцем, а годен препарат весь месяц ───────────
  const may2027 = monthToExpiry('2027-05')
  check('месяц превращается в последний день месяца', new Date(may2027).getDate() === 31 && new Date(may2027).getMonth() === 4)
  check('февраль високосного года', new Date(monthToExpiry('2028-02')).getDate() === 29)
  check('обратное преобразование', expiryToMonth(may2027) === '2027-05')
  check('мусор не превращается в дату', monthToExpiry('не месяц') === null && monthToExpiry('2027-13') === null)

  // ── запас ────────────────────────────────────────────────────────────────
  check('без остатка запас не считается', supplyDays(med({ perDay: 1 })) === null)
  check('без суточной дозы запас не считается', supplyDays(med({ left: 30 })) === null)
  check('запас округляется вниз', supplyDays(med({ left: 5, perDay: 2 })) === 2, 'на 2,5 дня рассчитывать нельзя')
  check('деление на ноль не ломает', supplyDays(med({ left: 5, perDay: 0 })) === null)

  // ── предупреждения ───────────────────────────────────────────────────────
  check('полная упаковка со свежим сроком молчит', medicineAlert(med({ left: 60, perDay: 1, expires: may2027 }), now) === null)
  check('пустая упаковка', medicineAlert(med({ left: 0 }), now)?.kind === 'out')
  check(
    'запаса меньше недели',
    medicineAlert(med({ left: SUPPLY_SOON_DAYS, perDay: 1 }), now)?.kind === 'low',
  )
  check('запаса больше недели — молчим', medicineAlert(med({ left: SUPPLY_SOON_DAYS + 1, perDay: 1 }), now) === null)
  check(
    'срок истекает в ближайший месяц',
    medicineAlert(med({ left: 100, perDay: 1, expires: now + (EXPIRY_SOON_DAYS - 1) * DAY }), now)?.kind === 'expiring',
  )
  check(
    'срок истёк',
    medicineAlert(med({ left: 100, perDay: 1, expires: now - DAY }), now)?.kind === 'expired',
  )
  check(
    'истёкший срок важнее пустой упаковки',
    medicineAlert(med({ left: 0, expires: now - DAY }), now)?.kind === 'expired',
    'просроченное ещё и лежит в аптечке, про него важнее сказать',
  )
  check(
    'последний годный день ещё не просрочка',
    medicineAlert(med({ left: 100, perDay: 1, expires: now }), now)?.kind === 'expiring',
    'сравнение идёт по дням, а не по часам',
  )

  // ── порядок в списке ─────────────────────────────────────────────────────
  const list = [
    med({ id: 'a', name: 'Ясный', left: 100, perDay: 1, expires: may2027 }),
    med({ id: 'b', name: 'Просроченный', expires: now - DAY }),
    med({ id: 'c', name: 'Кончается', left: 2, perDay: 1 }),
    med({ id: 'd', name: 'Аспирин', left: 100, perDay: 1, expires: may2027 }),
  ]
  const sorted = sortMedicines(list, now).map((m) => m.name)
  check('сначала требующее внимания', sorted[0] === 'Просроченный' && sorted[1] === 'Кончается', sorted.join(', '))
  check('спокойные — по алфавиту', sorted[2] === 'Аспирин' && sorted[3] === 'Ясный', sorted.join(', '))
  check('исходный список не изменён', list[0].name === 'Ясный')

  check('счётчик требующих внимания', countAlerts(list, now) === 2)
  check('пустая аптечка ничего не требует', countAlerts([], now) === 0)

  check('срок не указан — про него молчим', daysToExpiry(med({}), now) === null)

  // ── русские окончания ────────────────────────────────────────────────────
  const form = (n) => plural(n, 'день', 'дня', 'дней')
  check('1 день', form(1) === 'день')
  check('2 дня', form(2) === 'дня')
  check('5 дней', form(5) === 'дней')
  check('11 дней, а не «11 день»', form(11) === 'дней', 'вторая десятка — исключение')
  check('12, 13, 14 дней', form(12) === 'дней' && form(13) === 'дней' && form(14) === 'дней')
  check('21 день', form(21) === 'день')
  check('22 дня', form(22) === 'дня')
  check('25 дней', form(25) === 'дней')
  check('111 дней', form(111) === 'дней')
  check('0 дней', form(0) === 'дней')

  return failures
}
