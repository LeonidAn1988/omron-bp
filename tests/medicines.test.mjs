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
  perDayOf,
  perTimeOf,
  projectedLeft,
  parseTime,
  formatTime,
  normalizeTimes,
  dosesToday,
  pendingToday,
  markTaken,
  undoTaken,
  setLeft,
  effectiveLeft,
  isEstimated,
  runsOutAt,
  shortForm,
  restockList,
  restockText,
  RESTOCK_DAYS,
  KEEP_INTAKES_DAYS,
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

  // ── расписание ───────────────────────────────────────────────────────────
  check('время разбирается', parseTime('08:30') === 510)
  check('однозначные часы тоже', parseTime('8:05') === 485)
  check('мусор не время', parseTime('25:00') === null && parseTime('08:70') === null && parseTime('утром') === null)
  check('обратно с ведущим нулём', formatTime(510) === '08:30' && formatTime(5) === '00:05')
  check(
    'расписание сортируется и чистится',
    JSON.stringify(normalizeTimes(['20:00', '8:00', '20:00', 'ерунда'])) === JSON.stringify(['08:00', '20:00']),
  )

  // ── суточный расход ──────────────────────────────────────────────────────
  check('без расписания берётся ручное число', perDayOf(med({ perDay: 3 })) === 3)
  check('с расписанием считается по нему', perDayOf(med({ times: ['08:00', '20:00'], perDay: 99 })) === 2)
  check('две штуки за приём удваивают расход', perDayOf(med({ times: ['08:00', '20:00'], perTime: 2 })) === 4)
  check('по умолчанию одна штука за приём', perTimeOf(med({})) === 1)

  // ── расчётный остаток ────────────────────────────────────────────────────
  check('без даты подтверждения остаток как есть', projectedLeft(med({ left: 30, perDay: 1 }), now) === 30)
  check(
    'за десять дней списалось десять штук',
    projectedLeft(med({ left: 30, perDay: 1, leftAt: now - 10 * DAY }), now) === 20,
  )
  check(
    'по два в день списывается вдвое быстрее',
    projectedLeft(med({ left: 30, perDay: 2, leftAt: now - 10 * DAY }), now) === 10,
  )
  check(
    'ниже нуля не уходит',
    projectedLeft(med({ left: 5, perDay: 2, leftAt: now - 100 * DAY }), now) === 0,
  )
  check('в тот же день ничего не списывается', projectedLeft(med({ left: 30, perDay: 1, leftAt: now - 3600000 }), now) === 30)

  check(
    'предупреждение срабатывает по расчётному остатку',
    medicineAlert(med({ left: 30, perDay: 1, leftAt: now - 25 * DAY }), now)?.kind === 'low',
    'иначе «пора заказывать» не сработает никогда',
  )
  check(
    '«закончился» только по подтверждённому остатку',
    medicineAlert(med({ left: 30, perDay: 1, leftAt: now - 100 * DAY }), now)?.kind === 'low',
    'сказать «кончился», когда пачка лежит в тумбочке, значит соврать',
  )

  // ── приёмы за сегодня ────────────────────────────────────────────────────
  const утро = new Date(2026, 7, 13, 8, 0, 0).getTime()
  const вечер = new Date(2026, 7, 13, 20, 0, 0).getTime()
  const полдень = new Date(2026, 7, 13, 12, 0, 0).getTime()

  const расписание = med({ times: ['08:00', '20:00'], left: 30 })
  let слоты = dosesToday(расписание, полдень)
  check('в расписании два приёма', слоты.length === 2)
  check('утренний просрочен, вечерний ещё нет', слоты[0].overdue === true && слоты[1].overdue === false)
  check('без расписания приёмов нет', dosesToday(med({ left: 10 }), полдень).length === 0)

  const принят = markTaken(расписание, утро + 600000)
  слоты = dosesToday(принят, полдень)
  check('утренний приём отмечен', слоты[0].takenAt !== null && слоты[1].takenAt === null)
  check('отметка не просрочена', слоты[0].overdue === false)
  check('остаток списался на штуку', принят.left === 29)
  check('дата подтверждения обновилась', принят.leftAt === утро + 600000)
  check('исходный препарат не изменён', расписание.left === 30 && !расписание.taken)

  const оба = markTaken(принят, вечер)
  const слоты2 = dosesToday(оба, вечер + 60000)
  check('обе отметки разошлись по приёмам', слоты2[0].takenAt !== null && слоты2[1].takenAt !== null)
  check('остаток списался дважды', оба.left === 28)

  check('счётчик неотмеченных', pendingToday([расписание], полдень) === 2)
  check('после отметки счётчик уменьшился', pendingToday([принят], полдень) === 1)
  check('препарат без расписания в счётчик не идёт', pendingToday([med({ left: 5 })], полдень) === 0)

  const откат = undoTaken(оба, вечер)
  check('ошибочная отметка снята', (откат.taken ?? []).includes(вечер) === false)
  check('штуки вернулись в остаток', откат.left === 29)

  const давний = markTaken(med({ left: 10, taken: [now - (KEEP_INTAKES_DAYS + 5) * DAY] }), now)
  check(
    'старые отметки не копятся',
    (давний.taken ?? []).length === 1,
    'история за годы раздувает резервную копию и никому не нужна',
  )

  check('две штуки за приём списываются вместе', markTaken(med({ left: 10, perTime: 2 }), now).left === 8)
  check('остаток без счёта не ломает отметку', markTaken(med({ left: null }), now).left === null)

  // ── автосписание ─────────────────────────────────────────────────────────
  const вручную = med({ left: 30, perDay: 1, leftAt: now - 10 * DAY })
  const авто = med({ left: 30, perDay: 1, leftAt: now - 10 * DAY, autoDeduct: true })

  check('без автосписания показываем подтверждённый остаток', effectiveLeft(вручную, now) === 30)
  check('с автосписанием показываем расчётный', effectiveLeft(авто, now) === 20)
  check('без автосписания расчёт помечен как оценка', isEstimated(вручную, now) === false)
  check(
    'с автосписанием число расходится с подтверждённым',
    isEstimated(авто, now) === true,
    'интерфейс обязан сказать, что это расчёт, а не пересчитанная упаковка',
  )
  check('свежий остаток оценкой не считается', isEstimated(med({ left: 30, perDay: 1, leftAt: now, autoDeduct: true }), now) === false)

  const автоОтмечен = markTaken(авто, now)
  check(
    'при автосписании отметка не списывает второй раз',
    автоОтмечен.left === 30 && автоОтмечен.leftAt === авто.leftAt,
    'расписание уже списало эту дозу',
  )
  check('но сама отметка сохраняется', (автоОтмечен.taken ?? []).length === 1)
  check('снятие отметки при автосписании тоже не трогает остаток', undoTaken(автоОтмечен, now).left === 30)

  // ── правка остатка ───────────────────────────────────────────────────────
  const поправлен = setLeft(авто, 12, now)
  check('остаток заменён', поправлен.left === 12)
  check('отсчёт начат заново', поправлен.leftAt === now)
  check(
    'после правки расчёт совпадает с введённым',
    effectiveLeft(поправлен, now) === 12,
    'иначе человек вводит 12, а видит другое число',
  )
  check('дробное округляется', setLeft(вручную, 12.6, now).left === 13)
  check('отрицательное не принимается', setLeft(вручную, -5, now).left === 0)
  check('можно перестать считать', setLeft(вручную, null, now).left === null)

  // ── дата, когда запас кончится ───────────────────────────────────────────
  check(
    'запас кончится через столько же дней, сколько его хватит',
    runsOutAt(med({ left: 14, perDay: 1 }), now) === startOfDayTs(now) + 14 * DAY,
  )
  check('без расчёта даты нет', runsOutAt(med({ left: 14 }), now) === null)

  // ── форма коротко ────────────────────────────────────────────────────────
  check('от формы остаётся существительное', shortForm('Таблетки покрытые пленочной оболочкой') === 'таблетки')
  check('запятая тоже граница', shortForm('Таблетки, покрытые оболочкой') === 'таблетки')
  check('капли остаются каплями', shortForm('Капли глазные') === 'капли')
  check('формы может не быть', shortForm(undefined) === '' && shortForm('') === '')

  // ── список для заказа ────────────────────────────────────────────────────
  const аптечка = [
    med({ id: 'a', name: 'Спокойный', left: 100, perDay: 1, expires: now + 400 * DAY }),
    med({ id: 'b', name: 'Кончается', left: 4, perDay: 1 }),
    med({ id: 'c', name: 'Кончился', left: 0, perDay: 2 }),
    med({ id: 'd', name: 'Просрочен', left: 50, perDay: 1, expires: now - DAY }),
    med({ id: 'e', name: 'Истекает', left: 100, perDay: 1, expires: now + 10 * DAY }),
  ]
  const заказ = restockList(аптечка, now)

  check('спокойный в список не попал', !заказ.some((r) => r.medicine.name === 'Спокойный'))
  check('в списке четыре препарата', заказ.length === 4, заказ.map((r) => r.medicine.name).join(', '))
  check(
    'порядок по срочности',
    заказ.map((r) => r.medicine.name).join(',') === 'Кончился,Просрочен,Кончается,Истекает',
    заказ.map((r) => r.medicine.name).join(','),
  )
  check(
    'кончившийся требует месячный запас',
    заказ.find((r) => r.medicine.name === 'Кончился')?.need === RESTOCK_DAYS * 2,
    'по две в день на тридцать дней',
  )
  check(
    'кончающийся требует только недостающее',
    заказ.find((r) => r.medicine.name === 'Кончается')?.need === RESTOCK_DAYS - 4,
  )
  check(
    'у просроченного старая пачка не в счёт',
    заказ.find((r) => r.medicine.name === 'Просрочен')?.need === RESTOCK_DAYS,
    'принимать её нельзя, значит запас нулевой',
  )
  check(
    'без суточного расхода количество не выдумываем',
    restockList([med({ id: 'f', name: 'Без расхода', left: 0 })], now)[0].need === null,
  )

  const текст = restockText([
    { medicine: med({ name: 'Конкор®', dose: '5 мг', form: 'Таблетки покрытые пленочной оболочкой', inn: 'Бисопролол' }), reason: 'low', need: 30 },
    { medicine: med({ name: 'Лозартан', dose: '50 мг', inn: 'Лозартан' }), reason: 'out', need: null },
  ])
  check('строка содержит название, дозировку и форму', текст.split('\n')[0].startsWith('Конкор®, 5 мг, таблетки'))
  check('вещество в скобках — по нему подбирают аналог', текст.includes('(Бисопролол)'))
  check('количество дописано', текст.includes('— 30 шт.'))
  check('вещество не дублирует название', !текст.split('\n')[1].includes('(Лозартан)'))
  check('без количества строка не обрывается', текст.split('\n')[1] === 'Лозартан, 50 мг')

  return failures
}

/** Начало суток — дублируем локально, чтобы не тянуть в тесты внутренности модуля. */
function startOfDayTs(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
