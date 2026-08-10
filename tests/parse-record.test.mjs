/**
 * Сверяет разбор 14-байтовой записи с эталонным выводом оригинального
 * Python-драйвера omblepy (deviceSpecific/hem-6232t.py).
 *
 * Векторы в fixtures/omblepy-records.json сгенерированы этим драйвером на
 * случайных байтах, так что тест ловит любое расхождение в битовой раскладке —
 * это единственное место, где ошибка молча испортила бы историю измерений.
 */
import { readFileSync } from 'node:fs'
import { parseRecord } from './build/hem6232t.mjs'

const cases = JSON.parse(readFileSync(new URL('./fixtures/omblepy-records.json', import.meta.url), 'utf8'))

const pad = (n) => String(n).padStart(2, '0')
const fmt = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

export function run() {
  let parsedBoth = 0
  let rejectedBoth = 0
  const problems = []

  for (const { raw, expected } of cases) {
    const bytes = Uint8Array.from(raw.match(/../g).map((h) => parseInt(h, 16)))
    const actual = parseRecord(bytes, 1)

    if (expected === null) {
      if (actual !== null) problems.push(`${raw}: мы разобрали запись, эталон её отбрасывает`)
      else rejectedBoth++
      continue
    }

    if (actual === null) {
      // Наш парсер строже: дополнительно отсекает нефизиологичные значения.
      // Расхождение допустимо только на записях вне разумных границ.
      const plausible = expected.sys >= 40 && expected.sys <= 300 && expected.dia >= 20 && expected.dia <= 250
      if (plausible) problems.push(`${raw}: эталон разобрал правдоподобную запись, мы отбросили`)
      continue
    }

    parsedBoth++
    if (actual.dia !== expected.dia) problems.push(`${raw}: dia ${actual.dia} вместо ${expected.dia}`)
    if (actual.sys !== expected.sys) problems.push(`${raw}: sys ${actual.sys} вместо ${expected.sys}`)
    if (actual.bpm !== expected.bpm) problems.push(`${raw}: bpm ${actual.bpm} вместо ${expected.bpm}`)
    if (actual.ihb !== Boolean(expected.ihb)) problems.push(`${raw}: ihb ${actual.ihb} вместо ${expected.ihb}`)
    if (actual.mov !== Boolean(expected.mov)) problems.push(`${raw}: mov ${actual.mov} вместо ${expected.mov}`)
    if (fmt(actual.date) !== expected.datetime) problems.push(`${raw}: дата ${fmt(actual.date)} вместо ${expected.datetime}`)
  }

  console.log(`  векторов: ${cases.length} · совпало разобранных: ${parsedBoth} · совпало отброшенных: ${rejectedBoth}`)
  for (const problem of problems.slice(0, 10)) console.log(`  FAIL ${problem}`)
  if (problems.length > 10) console.log(`  …и ещё ${problems.length - 10}`)
  if (problems.length === 0) console.log('  ok   разбор записи совпадает с omblepy побайтово')
  return problems.length
}
