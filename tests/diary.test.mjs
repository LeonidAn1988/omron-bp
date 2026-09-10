/**
 * Дневник самоконтроля по дням — форма, в которой врач его читает.
 *
 * Свёртка серии это обработка данных, и ошибка в ней уедет в документ, который
 * несут врачу. Поэтому границы проверяются с обеих сторон.
 */
import { diaryByDays, daysMissed, SERIES_GAP_MIN } from './build/api.mjs'

const ДЕНЬ = 24 * 60 * 60 * 1000
const МИН = 60_000
// Полдень по местному времени: части суток считаются по локальным часам.
const база = new Date(2026, 8, 10, 8, 0, 0).getTime()

export function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }
  const изм = (ts, sys, dia, bpm = 70) => ({ id: `r${ts}`, kind: 'bp', ts, sys, dia, bpm, user: 1 })

  check('пусто — ни одного дня', diaryByDays([]).length === 0)

  // Три замера подряд — одна строка со средним, а не три события.
  const серия = diaryByDays([изм(база, 140, 90), изм(база + 2 * МИН, 130, 85), изм(база + 4 * МИН, 120, 80)])
  check('день один', серия.length === 1)
  check('серия свёрнута в одну ячейку', серия[0].cells.morning.count === 3)
  check('в ячейке среднее', серия[0].cells.morning.sys === 130 && серия[0].cells.morning.dia === 85)
  check('время — начало серии', серия[0].cells.morning.time === '08:00')

  // Граница свёртки: ровно на пороге — ещё серия, на минуту дальше — уже нет.
  const наПороге = diaryByDays([изм(база, 140, 90), изм(база + SERIES_GAP_MIN * МИН, 120, 80)])
  check('ровно на пороге — одна серия', наПороге[0].cells.morning.count === 2)
  const заПорогом = diaryByDays([изм(база, 140, 90), изм(база + (SERIES_GAP_MIN + 1) * МИН, 120, 80)])
  check('за порогом — первая серия остаётся в ячейке', заПорогом[0].cells.morning.count === 1)
  check('и это именно первая', заПорогом[0].cells.morning.sys === 140)

  // Части суток разводятся по колонкам.
  const сутки = diaryByDays([
    изм(new Date(2026, 8, 10, 2, 0).getTime(), 120, 80),
    изм(new Date(2026, 8, 10, 8, 0).getTime(), 130, 85),
    изм(new Date(2026, 8, 10, 14, 0).getTime(), 140, 90),
    изм(new Date(2026, 8, 10, 20, 0).getTime(), 150, 95),
  ])
  check('четыре части суток в одном дне', Object.keys(сутки[0].cells).sort().join(',') === 'day,evening,morning,night')

  // Дни идут от свежих к старым.
  const дни = diaryByDays([изм(база, 120, 80), изм(база + 2 * ДЕНЬ, 130, 85)])
  check('свежий день первым', дни[0].day > дни[1].day)
  check('пропущенный день посчитан', daysMissed(дни) === 1)
  check('без пропусков — ноль', daysMissed(diaryByDays([изм(база, 120, 80)])) === 0)

  // Пульс: ноль и отсутствие в среднее не идут.
  const пульс = diaryByDays([изм(база, 120, 80, 60), изм(база + МИН, 120, 80, 0)])
  check('нулевой пульс в среднее не идёт', пульс[0].cells.morning.bpm === 60)

  // Отметки приёма по дням: врач видит, принимал ли пациент лекарства.
  const коробка = { id: 'm1', name: 'Конкор', times: ['08:00'], perTime: 1, taken: [база], dose: '', left: null, perDay: null, expires: null }
  const сПриёмом = diaryByDays([изм(база, 120, 80), изм(база + ДЕНЬ, 130, 85)], [коробка])
  check('в день с отметкой — да', сПриёмом[1].intake === true)
  check('в день без отметки — нет', сПриёмом[0].intake === false)
  check('без расписания про приём молчим', diaryByDays([изм(база, 120, 80)], []).length === 1 && diaryByDays([изм(база, 120, 80)], [])[0].intake === null)

  return failures
}
