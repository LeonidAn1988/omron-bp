/** Когда препарат считается кончающимся и когда просроченным. */
import {
  EXPIRY_SOON_DAYS,
  KEEP_INTAKES_DAYS,
  RESTOCK_DAYS,
  SUPPLY_SOON_DAYS,
  addPack,
  adherence,
  countAlerts,
  dayStatus,
  daysToExpiry,
  displayAlert,
  dosesOn,
  dosesToday,
  effectiveLeft,
  expiryToMonth,
  formatTime,
  isEstimated,
  markTaken,
  markTakenAt,
  medicineAlert,
  monthToExpiry,
  normalizeTimes,
  packsNeeded,
  parseTime,
  partOfDay,
  pendingToday,
  perDayOf,
  perTimeOf,
  plural,
  projectedLeft,
  restockList,
  restockText,
  runsOutAt,
  setLeft,
  shortForm,
  sortMedicines,
  supplyDays,
  trackedSince,
  undoTaken,
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

  check(
    'показываем расчётный остаток и без автосписания',
    effectiveLeft(вручную, now) === 20 && effectiveLeft(авто, now) === 20,
    'иначе число «6 шт.» стоит рядом с полосой «запас кончился»',
  )
  check(
    'расхождение с подтверждённым помечено',
    isEstimated(вручную, now) === true && isEstimated(авто, now) === true,
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

  // ── части суток ──────────────────────────────────────────────────────────
  check('до полудня — утро', partOfDay('08:00') === 'morning' && partOfDay('11:59') === 'morning')
  check('полдень уже день', partOfDay('12:00') === 'day' && partOfDay('16:59') === 'day')
  check('с пяти вечер', partOfDay('17:00') === 'evening' && partOfDay('21:59') === 'evening')
  check('с десяти ночь', partOfDay('22:00') === 'night' && partOfDay('23:59') === 'night')
  check('полночь — утро', partOfDay('00:00') === 'morning')
  check('мусор не часть суток', partOfDay('нет') === null)

  // ── приёмы за произвольный день ──────────────────────────────────────────
  const вчера = now - DAY
  const завтра = now + DAY
  const режим = med({ times: ['08:00', '20:00'], left: 30 })

  check('вчерашние приёмы существуют', dosesOn(режим, вчера, now).length === 2)
  check('вчерашние просрочены', dosesOn(режим, вчера, now).every((s) => s.overdue))
  check('завтрашние не просрочены', dosesOn(режим, завтра, now).every((s) => !s.overdue))
  check(
    'приём привязан к своему дню',
    new Date(dosesOn(режим, вчера, now)[0].time === '08:00' ? вчера : now).getDate() === new Date(вчера).getDate(),
  )

  // ── отметка задним числом ────────────────────────────────────────────────
  const планВчера = startOfDayTs(вчера) + 8 * 60 * 60 * 1000
  const отмеченВчера = markTakenAt(режим, планВчера, now)
  check('отметка встала на вчерашнее время', (отмеченВчера.taken ?? [])[0] === планВчера, 'а не на «сейчас»')
  check('вчерашний приём считается отмеченным', dosesOn(отмеченВчера, вчера, now)[0].takenAt === планВчера)
  check('остаток списался', отмеченВчера.left === 29)
  check(
    'сегодняшние приёмы отметкой за вчера не задеты',
    dosesOn(отмеченВчера, now, now).every((s) => s.takenAt === null),
  )

  // ── состояние дня ────────────────────────────────────────────────────────
  check('день без расписания пуст', dayStatus([med({ left: 5 })], now, now) === 'empty')
  check('будущий день', dayStatus([режим], завтра, now) === 'future')
  check('вчера без отметок — пропуски', dayStatus([режим], вчера, now) === 'missed')
  const всёВчера = markTakenAt(markTakenAt(режим, планВчера, now), startOfDayTs(вчера) + 20 * 3600000, now)
  check('вчера всё отмечено', dayStatus([всёВчера], вчера, now) === 'done')
  const тольковечер = med({ times: ['23:59'], left: 10 })
  check(
    'сегодня время ещё не пришло — ждём, а не пропустили',
    dayStatus([тольковечер], now, now) === 'pending',
    '«пропустил» и «ещё не время» — разные вещи',
  )

  // ── что показывать: полоса или предупреждение ────────────────────────────
  const кончается = med({ left: 4, perDay: 1, expires: now + 400 * DAY })
  const п1 = displayAlert(кончается, now)
  check(
    'про запас говорит полоса, а не текст',
    п1.showSupply === true && п1.alert === null,
    'иначе «Хватит на 4 дня» стоит дважды подряд',
  )
  const иИстекает = med({ left: 4, perDay: 1, expires: now + 10 * DAY })
  const п2 = displayAlert(иИстекает, now)
  check(
    'освободившаяся строка отдана сроку годности',
    п2.alert?.kind === 'expiring' && п2.showSupply === true,
    'иначе истекающий срок молчит, пока препарат кончается',
  )
  const просрочен = displayAlert(med({ left: 30, perDay: 1, expires: now - DAY }), now)
  check('у просроченного полосы запаса нет', просрочен.showSupply === false && просрочен.alert?.kind === 'expired')

  // ── упаковка ─────────────────────────────────────────────────────────────
  check('упаковка прибавляется к остатку', addPack(med({ left: 4, packSize: 30 }), now).left === 34)
  check('пустой остаток становится упаковкой', addPack(med({ left: null, packSize: 30 }), now).left === 30)
  check('без размера упаковки ничего не меняется', addPack(med({ left: 4 }), now).left === 4)
  check('дата подтверждения обновилась', addPack(med({ left: 4, packSize: 30 }), now).leftAt === now)
  check('пачек берём с округлением вверх', packsNeeded(med({ packSize: 30 }), 31) === 2)
  check('ровно упаковка — одна пачка', packsNeeded(med({ packSize: 30 }), 30) === 1)
  check('без размера упаковки пачки не считаем', packsNeeded(med({}), 30) === null)

  // ── отметка обязана вставать на тот приём, по которому нажали ────────────
  const день0дозы = startOfDayTs(now)
  const вМомент = (час, мин = 0) => день0дозы + час * 3_600_000 + мин * 60_000
  const двоеВДень = ['08:00', '20:00']

  const толькоВечер = dosesOn(med({ times: двоеВДень, taken: [вМомент(20)] }), now, now)
  check(
    'отметка вечером не уезжает на утро',
    толькоВечер[0].takenAt === null && толькоВечер[1].takenAt === вМомент(20),
    'утренний приём забирал ближайшую свободную отметку, даже вечернюю',
  )
  check('непринятое утро остаётся просроченным', толькоВечер[0].overdue === true)

  const толькоУтро = dosesOn(med({ times: двоеВДень, taken: [вМомент(8)] }), now, now)
  check('отметка утром остаётся утром', толькоУтро[0].takenAt === вМомент(8) && толькоУтро[1].takenAt === null)

  const обе = dosesOn(med({ times: двоеВДень, taken: [вМомент(8), вМомент(20)] }), now, now)
  check('две отметки ложатся каждая на своё', обе[0].takenAt === вМомент(8) && обе[1].takenAt === вМомент(20))

  const трижды = dosesOn(
    med({ times: ['08:00', '14:00', '20:00'], taken: [вМомент(14)] }),
    now,
    now,
  )
  check(
    'при трёх приёмах отметка встаёт на средний',
    трижды[0].takenAt === null && трижды[1].takenAt === вМомент(14) && трижды[2].takenAt === null,
  )

  const сОпозданием = dosesOn(med({ times: двоеВДень, taken: [вМомент(8, 25)] }), now, now)
  check(
    'приняли на двадцать пять минут позже — это всё ещё утро',
    сОпозданием[0].takenAt === вМомент(8, 25) && сОпозданием[1].takenAt === null,
    'отметка привязывается к ближайшему приёму, а не к точной минуте',
  )

  const междуПриёмами = dosesOn(med({ times: двоеВДень, taken: [вМомент(15)] }), now, now)
  check(
    'отметка ровно посередине достаётся ближайшему по времени',
    междуПриёмами[0].takenAt === null && междуПриёмами[1].takenAt === вМомент(15),
    '15:00 ближе к 20:00, чем к 08:00',
  )

  // ── соблюдение режима: цифра уходит врачу, врать ей нельзя ───────────────
  const день0 = startOfDayTs(now)
  const в = (сдвиг, час) => день0 + сдвиг * DAY + час * 3_600_000
  const дважды = ['08:00', '20:00']

  const всёОтмечено = med({
    id: 'a',
    times: дважды,
    taken: [в(-2, 8), в(-2, 20), в(-1, 8), в(-1, 20), в(0, 8)],
  })
  const полный = adherence([всёОтмечено], now - 7 * DAY, now)
  check(
    'вечерний приём сегодня ещё не наступил и в счёт не идёт',
    полный.planned === 5 && полный.taken === 5 && полный.rate === 1,
    `получилось ${полный.taken}/${полный.planned}`,
  )
  check(
    'счёт идёт с первой отметки, а не с начала периода',
    полный.from === startOfDayTs(в(-2, 8)),
    'иначе препарат, заведённый вчера, отчитывается за весь месяц',
  )

  const спропуском = med({ id: 'b', times: дважды, taken: [в(-2, 8), в(-2, 20), в(-1, 8), в(0, 8)] })
  const частичный = adherence([спропуском], now - 7 * DAY, now)
  check(
    'пропущенный вечерний приём виден',
    частичный.planned === 5 && частичный.taken === 4,
    `получилось ${частичный.taken}/${частичный.planned}`,
  )

  const сСписанием = adherence(
    [med({ id: 'c', times: дважды, autoDeduct: true, taken: [в(-1, 8)] })],
    now - 7 * DAY,
    now,
  )
  check(
    'автосписание в долю не идёт',
    сСписанием.skipped === 1 && сСписанием.rows.length === 0 && сСписанием.rate === null,
    'у него отметок нет по устройству, а не по нерадивости',
  )

  const безРасписания = adherence([med({ id: 'd' })], now - 7 * DAY, now)
  check('препарат по потребности не учитывается', безРасписания.skipped === 1 && безРасписания.rows.length === 0)

  const ниОдной = adherence([med({ id: 'e', times: дважды })], now - 7 * DAY, now)
  check(
    'препарат без отметок вынесен отдельно, а не записан в нули',
    ниОдной.unmarked.length === 1 && ниОдной.rows.length === 0 && ниОдной.rate === null,
    'иначе «0%» читается как «не принимает», хотя человек просто не отмечал',
  )

  check(
    'период длиннее срока хранения отметок урезан',
    adherence([всёОтмечено], now - 365 * DAY, now).clipped === true,
  )
  check('короткий период не урезается', adherence([всёОтмечено], now - 10 * DAY, now).clipped === false)

  const общий = adherence([всёОтмечено, спропуском], now - 7 * DAY, now)
  check(
    'доли складываются по дозам, а не усредняются по препаратам',
    общий.planned === 10 && общий.taken === 9,
    `получилось ${общий.taken}/${общий.planned}`,
  )



  // ── с какого дня препарат ведётся ────────────────────────────────────────
  //
  // Расписание не действует задним числом: препарат, заведённый сегодня, вчера
  // пропущен не был — его не было. Иначе первый же заход в аптечку размечал
  // полосу дней сплошными провалами.
  {
    const сегодня = new Date(2026, 7, 24, 12, 0, 0).getTime()
    const день = (сдвиг) => new Date(2026, 7, 24 + сдвиг, 0, 0, 0).getTime()
    const базовый = { id: 'm', name: 'Лозартан', dose: '50 мг', left: 30, perDay: null, expires: null, times: ['08:00'] }

    const свежий = { ...базовый, since: сегодня }
    check('заведённый сегодня: вчера приёмов нет', dosesOn(свежий, день(-1), сегодня).length === 0)
    check('заведённый сегодня: сегодня приём есть', dosesOn(свежий, день(0), сегодня).length === 1)
    check('заведённый сегодня: завтра приём есть', dosesOn(свежий, день(1), сегодня).length === 1)
    check(
      'полоса дней не размечает прошлое пропусками',
      dayStatus([свежий], день(-1), сегодня) === 'empty',
      dayStatus([свежий], день(-1), сегодня),
    )

    const старый = { ...базовый, since: день(-3) }
    check('заведённый три дня назад: позавчера приём есть', dosesOn(старый, день(-2), сегодня).length === 1)
    check('заведённый три дня назад: четыре дня назад приёмов нет', dosesOn(старый, день(-4), сегодня).length === 0)

    // Записи, сделанные до появления поля, ведут себя как раньше — иначе
    // человек, забывший отметить вчерашний приём, не смог бы это исправить.
    const без = { ...базовый }
    check('без даты заведения и без отметок ограничения нет', dosesOn(без, день(-5), сегодня).length === 1)
    check(
      'без даты заведения начало берётся из первой отметки',
      trackedSince({ ...базовый, taken: [день(-2) + 8 * 3600_000] }, сегодня) === день(-2),
    )
    check(
      'до первой отметки приёмов нет',
      dosesOn({ ...базовый, taken: [день(-2) + 8 * 3600_000] }, день(-3), сегодня).length === 0,
    )
    check('явная дата важнее отметок', trackedSince({ ...базовый, since: день(-1), taken: [день(-5)] }, сегодня) === день(-1))
  }

  return failures
}

/** Начало суток — дублируем локально, чтобы не тянуть в тесты внутренности модуля. */
function startOfDayTs(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
