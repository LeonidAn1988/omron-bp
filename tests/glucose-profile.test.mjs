/**
 * Разбор пакетов стандартного профиля глюкометра.
 *
 * Прибора нет, эталонной чужой реализации — тоже, поэтому пакеты собираются
 * здесь вручную строго по спецификации Bluetooth SIG, а разбор сверяется с
 * величинами, посчитанными независимо. Это не заменяет живую проверку, но
 * ловит ошибки в раскладке полей, единицах и порядке байтов.
 */
import { parseSFloat, parseGlucoseMeasurement, parseGlucoseContext, parseRacpResponse } from './build/api.mjs'

/** Собирает SFLOAT: 4 бита знакового порядка, 12 бит знаковой мантиссы. */
function sfloat(mantissa, exponent) {
  const e = (exponent < 0 ? exponent + 0x10 : exponent) & 0x0f
  const m = (mantissa < 0 ? mantissa + 0x1000 : mantissa) & 0x0fff
  return (e << 12) | m
}

function measurement({ flags, sequence, date, concentration, timeOffset }) {
  const bytes = []
  const u16 = (v) => bytes.push(v & 0xff, (v >> 8) & 0xff)
  bytes.push(flags)
  u16(sequence)
  u16(date.getFullYear())
  bytes.push(date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds())
  if (timeOffset !== undefined) u16(timeOffset < 0 ? timeOffset + 0x10000 : timeOffset)
  if (concentration !== undefined) {
    u16(concentration)
    bytes.push(0x11) // тип и место забора: капиллярная кровь, палец
  }
  return Uint8Array.from(bytes)
}

export function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }

  // ── SFLOAT ───────────────────────────────────────────────────────────────
  check('SFLOAT: ноль', parseSFloat(0x0000) === 0)
  check('SFLOAT: целое 100', parseSFloat(sfloat(100, 0)) === 100)
  check('SFLOAT: отрицательный порядок', Math.abs(parseSFloat(sfloat(55, -4)) - 0.0055) < 1e-9)
  check('SFLOAT: отрицательная мантисса', parseSFloat(sfloat(-5, 0)) === -5)
  check('SFLOAT: NaN отбрасывается', parseSFloat(0x07ff) === null)
  check('SFLOAT: бесконечность отбрасывается', parseSFloat(0x07fe) === null && parseSFloat(0x0802) === null)

  // ── измерение в моль/л ───────────────────────────────────────────────────
  const when = new Date(2026, 7, 12, 7, 5, 0)
  const molar = measurement({
    flags: 0x02 | 0x04, // концентрация есть, единицы моль/л
    sequence: 7,
    date: when,
    concentration: sfloat(55, -4), // 0,0055 моль/л
  })
  const m1 = parseGlucoseMeasurement(molar)
  check('моль/л: запись разобрана', m1 !== null)
  check('моль/л: номер записи', m1?.sequence === 7, String(m1?.sequence))
  check('моль/л: 0,0055 моль/л → 5,5 ммоль/л', m1?.mmol === 5.5, String(m1?.mmol))
  check('моль/л: дата и время', m1?.date.getTime() === when.getTime(), m1?.date.toString())

  // ── измерение в кг/л ─────────────────────────────────────────────────────
  // 0,001 кг/л = 100 мг/дл; 100 / 18,0156 = 5,5507 → 5,6 ммоль/л.
  // Проверка стоит именно на границе округления: с делителем 18,02 вышло бы 5,5.
  const massBased = measurement({
    flags: 0x02, // концентрация есть, единицы кг/л
    sequence: 8,
    date: when,
    concentration: sfloat(1, -3),
  })
  const m2 = parseGlucoseMeasurement(massBased)
  check('кг/л: 100 мг/дл → 5,6 ммоль/л', m2?.mmol === 5.6, String(m2?.mmol))

  // ── смещение времени ─────────────────────────────────────────────────────
  const shifted = measurement({
    flags: 0x01 | 0x02 | 0x04, // смещение + концентрация + моль/л
    sequence: 9,
    date: when,
    timeOffset: -90, // прибор жил в другом часовом поясе
    concentration: sfloat(62, -4),
  })
  const m3 = parseGlucoseMeasurement(shifted)
  check(
    'смещение времени применено',
    m3?.date.getTime() === when.getTime() - 90 * 60_000,
    m3?.date.toString(),
  )
  check('смещение не сдвинуло значение', m3?.mmol === 6.2, String(m3?.mmol))

  // ── запись без значения ──────────────────────────────────────────────────
  const noValue = measurement({ flags: 0x00, sequence: 10, date: when })
  const m4 = parseGlucoseMeasurement(noValue)
  check('запись без концентрации не выдумывает число', m4 !== null && m4.mmol === null)

  // ── некорректная дата ────────────────────────────────────────────────────
  const badDate = Uint8Array.from([0x06, 0x0b, 0x00, 0x00, 0x00, 0x08, 0x0c, 0x07, 0x05, 0x00, 0x37, 0xc0, 0x11])
  check('нулевой год отбрасывается', parseGlucoseMeasurement(badDate) === null)
  check('обрезанный пакет отбрасывается', parseGlucoseMeasurement(Uint8Array.from([0x06, 0x01])) === null)

  // ── контекст ─────────────────────────────────────────────────────────────
  // флаги 0x02 = присутствует поле Meal, за номером записи сразу идёт оно
  const contextFasting = Uint8Array.from([0x02, 0x07, 0x00, 0x03])
  const c1 = parseGlucoseContext(contextFasting)
  check('контекст: номер записи', c1?.sequence === 7)
  check('контекст: натощак', c1?.context === 'fasting', String(c1?.context))

  check('контекст: после еды', parseGlucoseContext(Uint8Array.from([0x02, 0x07, 0x00, 0x02]))?.context === 'after-meal')
  check('контекст: перед сном', parseGlucoseContext(Uint8Array.from([0x02, 0x07, 0x00, 0x05]))?.context === 'bedtime')

  // Углеводы идут перед Meal и занимают три байта — без их пропуска съедется поле.
  const withCarbs = Uint8Array.from([0x01 | 0x02, 0x07, 0x00, 0x01, 0x50, 0xb0, 0x03])
  check('контекст: поле Meal найдено за углеводами', parseGlucoseContext(withCarbs)?.context === 'fasting',
    String(parseGlucoseContext(withCarbs)?.context))

  // Расширенные флаги добавляют байт перед всем остальным.
  const withExtended = Uint8Array.from([0x02 | 0x80, 0x07, 0x00, 0x00, 0x05])
  check('контекст: расширенные флаги пропущены', parseGlucoseContext(withExtended)?.context === 'bedtime',
    String(parseGlucoseContext(withExtended)?.context))

  check('контекст без Meal не выдумывает момент', parseGlucoseContext(Uint8Array.from([0x00, 0x07, 0x00]))?.context === undefined)

  // ── ответы точки управления записями ─────────────────────────────────────
  const ok = parseRacpResponse(Uint8Array.from([0x06, 0x00, 0x01, 0x01]))
  check('RACP: успех завершает выгрузку', ok.done === true && ok.error === null)

  const empty = parseRacpResponse(Uint8Array.from([0x06, 0x00, 0x01, 0x06]))
  check('RACP: «нет записей» распознано', empty.done === true && /нет записей/.test(empty.error ?? ''), String(empty.error))

  const unsupported = parseRacpResponse(Uint8Array.from([0x06, 0x00, 0x01, 0x02]))
  check('RACP: неподдерживаемая команда распознана', unsupported.done === true && unsupported.error !== null)

  const other = parseRacpResponse(Uint8Array.from([0x05, 0x00, 0x0a, 0x00]))
  check('RACP: чужой ответ не считается завершением', other.done === false)

  return failures
}
