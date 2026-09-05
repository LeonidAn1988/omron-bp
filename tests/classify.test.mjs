/**
 * Пороги давления и сахара.
 *
 * Здесь решается, когда приложение пишет «вызывайте скорую». Ошибка на единицу
 * в границе — это либо ложная тревога у здорового, либо молчание у того, кому
 * плохо. Каждая граница проверяется с обеих сторон.
 */
import { classify, isWithinTarget, alertFor, glucoseCeiling } from './build/api.mjs'

export function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }

  const k = (sys, dia) => classify(sys, dia).level

  check('119/79 — оптимальное', k(119, 79) === 'optimal')
  check('120/79 — нормальное по систолическому', k(120, 79) === 'normal')
  check('119/80 — нормальное по диастолическому', k(119, 80) === 'normal')
  check('130/84 — высокое нормальное', k(130, 84) === 'high-normal')
  check('139/89 — ещё высокое нормальное', k(139, 89) === 'high-normal')
  check('140/89 — гипертензия 1 степени', k(140, 89) === 'ht1')
  check('139/90 — 1 степень по диастолическому', k(139, 90) === 'ht1')
  check('159/99 — всё ещё 1 степень', k(159, 99) === 'ht1')
  check('160/99 — 2 степень', k(160, 99) === 'ht2')
  check('179/109 — 2 степень', k(179, 109) === 'ht2')
  check('180/109 — 3 степень', k(180, 109) === 'ht3')
  check('179/110 — 3 степень по диастолическому', k(179, 110) === 'ht3')
  check('89/70 — пониженное', k(89, 70) === 'low')
  check('110/59 — пониженное по диастолическому', k(110, 59) === 'low')
  check('категория берётся по худшему показателю', k(125, 95) === 'ht1')

  check('134/84 — в цели по умолчанию', isWithinTarget(134, 84) === true)
  check('135/84 — уже вне цели', isWithinTarget(135, 84) === false)
  check('134/85 — вне цели по диастолическому', isWithinTarget(134, 85) === false)
  check('цель врача 130/80: 129/79 внутри', isWithinTarget(129, 79, 130, 80) === true)

  check('179/119 — не криз, но выраженно повышенное', alertFor(179, 119)?.kind === 'severe')
  check('180/100 — криз', alertFor(180, 100)?.kind === 'crisis')
  check('160/120 — криз по диастолическому', alertFor(160, 120)?.kind === 'crisis')
  check('160/99 — выраженно повышенное', alertFor(160, 99)?.kind === 'severe')
  check('159/100 — выраженно повышенное по диастолическому', alertFor(159, 100)?.kind === 'severe')
  check('159/99 — без тревоги', alertFor(159, 99) === null)
  check('89/60 — гипотензия', alertFor(89, 60)?.kind === 'hypotension')
  check('90/59 — гипотензия по диастолическому', alertFor(90, 59)?.kind === 'hypotension')
  check('90/60 — без тревоги', alertFor(90, 60) === null)
  check('текст криза зовёт скорую', /скорую/.test(alertFor(185, 100)?.text ?? ''))

  const targets = { fastingMax: 7, postMealMax: 10, low: 3.9 }
  check('натощак — свой порог', glucoseCeiling('fasting', targets) === 7)
  check('после еды — свой порог', glucoseCeiling('after-meal', targets) === 10)

  return failures
}
