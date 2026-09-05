/**
 * Статистика для отчёта врачу — на наборе, посчитанном руками.
 *
 * Пять измерений: 120/80, 130/85, 140/90, 150/95, 160/100. Среднее по
 * систолическому 140, по диастолическому 90; выборочное стандартное отклонение
 * систолического — sqrt(1000/4) ≈ 15,81; в цели 135/85 — ровно одно из пяти.
 */
import { describe, summarize, filterByPeriod, dailyAverages, movingAverage, summarizeGlucose } from './build/api.mjs'

const ДЕНЬ = 24 * 60 * 60 * 1000
const база = Date.UTC(2026, 7, 1, 9, 0, 0)
const bp = (i, sys, dia, bpm = 60 + i) => ({
  id: `r${i}`, kind: 'bp', ts: база + i * ДЕНЬ, sys, dia, bpm, ihb: i === 2, mov: false, user: 1,
})
const ряд = [bp(0, 120, 80), bp(1, 130, 85), bp(2, 140, 90), bp(3, 150, 95), bp(4, 160, 100)]

export function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }
  const близко = (a, b, eps = 0.02) => Math.abs(a - b) < eps

  const d = describe([120, 130, 140, 150, 160])
  check('среднее', d.avg === 140)
  check('минимум и максимум', d.min === 120 && d.max === 160)
  check('стандартное отклонение', близко(d.sd, 15.81), String(d.sd))
  check('пустой ряд — null', describe([]) === null)

  const s = summarize(ряд, 135, 85)
  check('число измерений', s.count === 5)
  check('средние', s.avgSys === 140 && s.avgDia === 90)
  check('крайние', s.minSys === 120 && s.maxSys === 160 && s.minDia === 80 && s.maxDia === 100)
  check('доля в цели — ровно одно из пяти', s.withinTarget === 0.2)
  check('нерегулярный пульс посчитан', s.ihbCount === 1)
  check('первая и последняя дата', s.firstTs === ряд[0].ts && s.lastTs === ряд[4].ts)
  check('без измерений — null', summarize([], 135, 85) === null)

  check('период «всё» ничего не режет', filterByPeriod(ряд, 'all').length === 5)
  check('период отбирает не больше исходного', filterByPeriod(ряд, '7d').length <= 5)

  const дни = dailyAverages(ряд)
  check('по дню на измерение', дни.length === 5)
  const сглаж = movingAverage(дни, 7)
  check('скользящее среднее последней точки — среднее всех', сглаж.length === 5 && сглаж[4].sys === 140)

  const g = summarizeGlucose(
    [
      { id: 'g1', kind: 'glucose', ts: база, mmol: 5.5, context: 'fasting', user: 1, source: 'manual' },
      { id: 'g2', kind: 'glucose', ts: база + ДЕНЬ, mmol: 11, context: 'after-meal', user: 1, source: 'manual' },
    ],
    { fastingMax: 7, postMealMax: 10, low: 3.9 },
  )
  check('сахар: обе записи учтены', g !== null && g.count === 2)

  return failures
}
