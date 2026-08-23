/**
 * Сборка напоминаний о приёме.
 *
 * Проверяется то, из-за чего напоминание молчит, врёт или не замолкает:
 * слипание препаратов по времени, повторы до отметки, снятие повторов уже
 * отмеченного приёма, прошедшие моменты и устойчивость идентификаторов.
 */
import {
  HORIZON_DAYS,
  REPEATS,
  REPEAT_INTERVAL_MIN,
  buildReminders,
  doseLine,
  reminderId,
  reminderTimes,
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

  const med = (over) => ({
    id: 'med-1', name: 'Лозартан', dose: '50 мг', left: 30, perDay: null, expires: null, ...over,
  })
  // Шесть утра: приёмы в 08:00 и 20:00 ещё впереди, вчерашние — позади.
  const now = new Date(2026, 7, 20, 6, 0, 0).getTime()
  const начало = (сдвиг = 0) => new Date(2026, 7, 20 + сдвиг, 0, 0, 0).getTime()
  const момент = (час, минута = 0, сдвиг = 0) => new Date(2026, 7, 20 + сдвиг, час, минута, 0).getTime()

  // ── строка препарата ─────────────────────────────────────────────────────
  check('название и дозировка', doseLine(med({})) === 'Лозартан 50 мг')
  check(
    'штуки указываются только когда их больше одной',
    doseLine(med({ perTime: 1 })) === 'Лозартан 50 мг' && doseLine(med({ perTime: 2 })) === 'Лозартан 50 мг — 2 шт.',
  )
  check('отношение к еде попадает в строку', doseLine(med({ meal: 'after' })) === 'Лозартан 50 мг — после еды')
  check('штуки и еда вместе', doseLine(med({ perTime: 2, meal: 'before' })) === 'Лозартан 50 мг — 2 шт., до еды')

  // ── времена приёма ───────────────────────────────────────────────────────
  check('времена собираются без повторов и по порядку', JSON.stringify(reminderTimes([
    med({ id: 'a', times: ['20:00'] }),
    med({ id: 'b', times: ['08:00', '20:00'] }),
  ])) === JSON.stringify(['08:00', '20:00']))
  check('нечитаемое время в список не идёт', JSON.stringify(reminderTimes([med({ times: ['вечером'] })])) === '[]')

  // ── пусто ────────────────────────────────────────────────────────────────
  check('пустая аптечка — пустой набор', buildReminders([], now).length === 0)
  check('препараты без расписания не напоминают', buildReminders([med({ times: [] })], now).length === 0)

  // ── группировка и повторы ────────────────────────────────────────────────
  const один = buildReminders([med({ times: ['08:00'] })], now, { repeat: true, horizonDays: 1 })
  check('один приём даёт основное плюс повторы', один.length === REPEATS + 1, `получилось ${один.length}`)
  check('первое — ровно в назначенное время', один[0].at === момент(8), new Date(один[0].at).toString())
  check(
    'повторы идут через заданный интервал',
    один.every((r, i) => r.at === момент(8) + i * REPEAT_INTERVAL_MIN * 60_000),
  )
  check('шаги пронумерованы подряд', JSON.stringify(один.map((r) => r.step)) === JSON.stringify([0, 1, 2, 3]))
  check('заголовок повтора отличается от основного', один[0].title !== один[1].title, один[1].title)
  check('повтор говорит, что приём не отмечен', один[1].title.includes('не отмечен'), один[1].title)

  const без = buildReminders([med({ times: ['08:00'] })], now, { repeat: false, horizonDays: 1 })
  check('без повторов остаётся одно напоминание', без.length === 1)

  const двое = buildReminders(
    [med({ id: 'a', name: 'Метформин', times: ['08:00'] }), med({ id: 'b', name: 'Аторвастатин', times: ['08:00'] })],
    now,
    { repeat: false, horizonDays: 1 },
  )
  check('два препарата на одно время — одно уведомление', двое.length === 1, `получилось ${двое.length}`)
  check('оба препарата в тексте', двое[0].body.split('\n').length === 2, двое[0].body.replace(/\n/g, ' | '))
  check('препараты внутри уведомления по алфавиту', двое[0].body.startsWith('Аторвастатин'), двое[0].body)

  // ── горизонт ─────────────────────────────────────────────────────────────
  const неделя = buildReminders([med({ times: ['08:00'] })], now, { repeat: false, horizonDays: 7 })
  check('горизонт соблюдается', неделя.length === 7, `получилось ${неделя.length}`)
  check('набор отсортирован по времени', неделя.every((r, i) => i === 0 || r.at >= неделя[i - 1].at))
  check('по умолчанию горизонт — две недели', HORIZON_DAYS === 14)

  // ── прошедшее ────────────────────────────────────────────────────────────
  const позже = new Date(2026, 7, 20, 8, 20, 0).getTime()
  const хвост = buildReminders([med({ times: ['08:00'] })], позже, { repeat: true, horizonDays: 1 })
  check(
    'прошедшие моменты не ставятся, оставшиеся повторы — да',
    хвост.length === 2 && хвост.every((r) => r.at > позже),
    `получилось ${хвост.length}`,
  )

  // ── отметка снимает повторы ──────────────────────────────────────────────
  const отмечено = buildReminders(
    [med({ times: ['08:00', '20:00'], taken: [момент(8)] })],
    now,
    { repeat: true, horizonDays: 1 },
  )
  check(
    'отмеченный приём не напоминает вовсе',
    отмечено.every((r) => r.slot === '20:00'),
    отмечено.map((r) => r.slot).join(','),
  )
  check('второй приём того же дня остаётся', отмечено.length === REPEATS + 1, `получилось ${отмечено.length}`)

  const частично = buildReminders(
    [
      med({ id: 'a', name: 'Метформин', times: ['08:00'], taken: [момент(8)] }),
      med({ id: 'b', name: 'Аторвастатин', times: ['08:00'] }),
    ],
    now,
    { repeat: false, horizonDays: 1 },
  )
  check('отмеченный препарат исчезает из текста', частично.length === 1 && частично[0].body === 'Аторвастатин 50 мг',
    частично[0]?.body)

  check(
    'отметка вчера на завтрашние напоминания не влияет',
    buildReminders([med({ times: ['08:00'], taken: [момент(8, 0, -1)] })], now, { repeat: false, horizonDays: 2 })
      .length === 2,
  )

  // ── идентификаторы ───────────────────────────────────────────────────────
  const много = buildReminders(
    [med({ id: 'a', times: ['08:00', '14:00', '20:00'] })],
    now,
    { repeat: true, horizonDays: 5 },
  )
  check('идентификаторы уникальны', new Set(много.map((r) => r.id)).size === много.length,
    `${много.length} штук, различных ${new Set(много.map((r) => r.id)).size}`)
  check('идентификатор укладывается в 32 бита', много.every((r) => r.id > 0 && r.id < 2 ** 31))
  check(
    'идентификатор восстанавливается из дня, приёма и шага',
    много[0].id === reminderId(начало(0), 0, 0),
  )
  check(
    'переименование препарата идентификаторов не меняет',
    buildReminders([med({ id: 'x', name: 'Другое', times: ['08:00'] })], now, { repeat: false, horizonDays: 1 })[0].id
      === buildReminders([med({ id: 'a', times: ['08:00'] })], now, { repeat: false, horizonDays: 1 })[0].id,
  )

  // ── привязка к приёму ────────────────────────────────────────────────────
  check(
    'сутки у каждого напоминания совпадают с его же моментом',
    много.every((r) => r.day === new Date(r.at).setHours(0, 0, 0, 0)),
    много.map((r) => `${new Date(r.at).toLocaleString('ru')} → ${new Date(r.day).toLocaleDateString('ru')}`).slice(0, 3).join('; '),
  )
  check(
    'приёмы покрывают все времена расписания',
    JSON.stringify([...new Set(много.map((r) => r.slot))].sort()) === JSON.stringify(['08:00', '14:00', '20:00']),
  )
  check('приём записан как в расписании', один.every((r) => r.slot === '08:00'))
  check('сутки — начало дня, а не момент приёма', один.every((r) => r.day === начало(0)))

  return failures
}
