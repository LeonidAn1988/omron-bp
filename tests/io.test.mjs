/** Круговой рейс экспорта-импорта и чтение чужих форматов. */
import { toCsv, toJson, parseCsv, parseJson, parseImportFile } from './build/io.mjs'

export function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }

  const sample = [
    { id: 'd1-1', ts: new Date(2026, 7, 10, 7, 5, 0).getTime(), sys: 128, dia: 82, bpm: 71, ihb: true, mov: false, user: 1, source: 'device' },
    {
      id: 'm-2',
      ts: new Date(2026, 7, 10, 21, 40, 0).getTime(),
      sys: 119, dia: 74, bpm: null, ihb: false, mov: true, user: 1, source: 'manual',
      note: 'после прогулки, "спокойно"; сидя',
    },
    { id: 'd2-3', ts: new Date(2026, 7, 9, 13, 0, 0).getTime(), sys: 145, dia: 95, bpm: 88, ihb: false, mov: false, user: 2, source: 'device' },
  ]

  const back = parseCsv(toCsv(sample))
  check('CSV: разобрались все строки', back.readings.length === 3, `получено ${back.readings.length}`)
  check('CSV: нечитаемых строк нет', back.skipped === 0)
  for (const original of sample) {
    const restored = back.readings.find((r) => r.ts === original.ts && r.user === original.user)
    if (!restored) {
      check(`CSV: запись ${original.sys}/${original.dia} восстановлена`, false)
      continue
    }
    check(
      `CSV: запись ${original.sys}/${original.dia} восстановлена без потерь`,
      restored.sys === original.sys &&
        restored.dia === original.dia &&
        restored.bpm === original.bpm &&
        restored.ihb === original.ihb &&
        restored.mov === original.mov &&
        (restored.note ?? undefined) === original.note,
      JSON.stringify(restored),
    )
  }

  const json = parseJson(toJson(sample))
  check('JSON: все записи на месте', json.readings.length === 3)
  check('JSON: идентификаторы сохранены', json.readings.every((r, i) => r.id === sample[i].id))

  const omblepyCsv = 'datetime,dia,sys,bpm,mov,ihb\n2026-08-10 07:05:00,82,128,71,0,1\n2026-08-09 13:00:00,95,145,88,0,0\n'
  const fromOmblepy = parseCsv(omblepyCsv)
  check('omblepy user1.csv: две записи', fromOmblepy.readings.length === 2)
  check(
    'omblepy user1.csv: sys и dia не перепутаны (в файле обратный порядок)',
    fromOmblepy.readings[0].sys === 128 && fromOmblepy.readings[0].dia === 82,
    JSON.stringify(fromOmblepy.readings[0]),
  )
  check('omblepy user1.csv: отметка аритмии прочитана', fromOmblepy.readings[0].ihb === true)

  const ubpm = JSON.stringify({
    UBPM: {
      U1: [{ date: '10.08.2026', time: '07:05:00', msg: '', sys: 128, dia: 82, bpm: 71, ihb: 1, mov: 0 }],
      U2: [{ date: '09.08.2026', time: '13:00:00', msg: 'проба', sys: 145, dia: 95, bpm: 88, ihb: 0, mov: 0 }],
    },
  })
  const fromUbpm = parseImportFile('ubpm.json', ubpm)
  check('ubpm.json: обе учётные записи', fromUbpm.readings.length === 2)
  check('ubpm.json: пользователь 2 распознан', fromUbpm.readings.some((r) => r.user === 2 && r.sys === 145))
  const first = new Date(fromUbpm.readings[0].ts)
  check('ubpm.json: дата ДД.ММ.ГГГГ разобрана', first.getFullYear() === 2026 && first.getMonth() === 7 && first.getDate() === 10)

  const ru = 'Дата;Время;Систолическое;Диастолическое;Пульс;Примечание\n10.08.2026;07:05;128;82;71;утро\n09.08.2026;21:30;119;74;;вечер\n'
  const fromRu = parseCsv(ru)
  check('CSV с русскими заголовками и «;»: две записи', fromRu.readings.length === 2, JSON.stringify(fromRu))
  check('CSV с русскими заголовками: значения на местах', fromRu.readings[0].sys === 128 && fromRu.readings[0].dia === 82)
  check('CSV с русскими заголовками: пустой пульс стал null', fromRu.readings[1].bpm === null)
  check('CSV с русскими заголовками: примечание прочитано', fromRu.readings[0].note === 'утро')

  const dirty = 'datetime,sys,dia\n2026-08-10 07:05:00,128,82\nне дата,abc,def\n,,\n'
  const fromDirty = parseCsv(dirty)
  check('мусорные строки не ломают импорт', fromDirty.readings.length === 1)
  check('мусорные строки посчитаны пропущенными', fromDirty.skipped === 2, `skipped=${fromDirty.skipped}`)

  return failures
}
