/** Круговой рейс экспорта-импорта и чтение чужих форматов. */
import { toCsv, toJson, parseCsv, parseJson, parseImportFile } from './build/api.mjs'

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
    { kind: 'bp', id: 'd1-1', ts: new Date(2026, 7, 10, 7, 5, 0).getTime(), sys: 128, dia: 82, bpm: 71, ihb: true, mov: false, user: 1, source: 'device' },
    {
      kind: 'bp',
      id: 'm-2',
      ts: new Date(2026, 7, 10, 21, 40, 0).getTime(),
      sys: 119, dia: 74, bpm: null, ihb: false, mov: true, user: 1, source: 'manual',
      note: 'после прогулки, "спокойно"; сидя',
    },
    { kind: 'bp', id: 'd2-3', ts: new Date(2026, 7, 9, 13, 0, 0).getTime(), sys: 145, dia: 95, bpm: 88, ihb: false, mov: false, user: 2, source: 'device' },
  ]

  const back = parseCsv(toCsv(sample))
  check('CSV: разобрались все строки', back.measurements.length === 3, `получено ${back.measurements.length}`)
  check('CSV: нечитаемых строк нет', back.skipped === 0)
  for (const original of sample) {
    const restored = back.measurements.find((r) => r.ts === original.ts && r.user === original.user)
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
  check('JSON: все записи на месте', json.measurements.length === 3)
  check('JSON: идентификаторы сохранены', json.measurements.every((r, i) => r.id === sample[i].id))

  const omblepyCsv = 'datetime,dia,sys,bpm,mov,ihb\n2026-08-10 07:05:00,82,128,71,0,1\n2026-08-09 13:00:00,95,145,88,0,0\n'
  const fromOmblepy = parseCsv(omblepyCsv)
  check('omblepy user1.csv: две записи', fromOmblepy.measurements.length === 2)
  check(
    'omblepy user1.csv: sys и dia не перепутаны (в файле обратный порядок)',
    fromOmblepy.measurements[0].sys === 128 && fromOmblepy.measurements[0].dia === 82,
    JSON.stringify(fromOmblepy.measurements[0]),
  )
  check('omblepy user1.csv: отметка аритмии прочитана', fromOmblepy.measurements[0].ihb === true)

  const ubpm = JSON.stringify({
    UBPM: {
      U1: [{ date: '10.08.2026', time: '07:05:00', msg: '', sys: 128, dia: 82, bpm: 71, ihb: 1, mov: 0 }],
      U2: [{ date: '09.08.2026', time: '13:00:00', msg: 'проба', sys: 145, dia: 95, bpm: 88, ihb: 0, mov: 0 }],
    },
  })
  const fromUbpm = parseImportFile('ubpm.json', ubpm)
  check('ubpm.json: обе учётные записи', fromUbpm.measurements.length === 2)
  check('ubpm.json: пользователь 2 распознан', fromUbpm.measurements.some((r) => r.user === 2 && r.sys === 145))
  const first = new Date(fromUbpm.measurements[0].ts)
  check('ubpm.json: дата ДД.ММ.ГГГГ разобрана', first.getFullYear() === 2026 && first.getMonth() === 7 && first.getDate() === 10)

  const ru = 'Дата;Время;Систолическое;Диастолическое;Пульс;Примечание\n10.08.2026;07:05;128;82;71;утро\n09.08.2026;21:30;119;74;;вечер\n'
  const fromRu = parseCsv(ru)
  check('CSV с русскими заголовками и «;»: две записи', fromRu.measurements.length === 2, JSON.stringify(fromRu))
  check('CSV с русскими заголовками: значения на местах', fromRu.measurements[0].sys === 128 && fromRu.measurements[0].dia === 82)
  check('CSV с русскими заголовками: пустой пульс стал null', fromRu.measurements[1].bpm === null)
  check('CSV с русскими заголовками: примечание прочитано', fromRu.measurements[0].note === 'утро')

  const dirty = 'datetime,sys,dia\n2026-08-10 07:05:00,128,82\nне дата,abc,def\n,,\n'
  const fromDirty = parseCsv(dirty)
  check('мусорные строки не ломают импорт', fromDirty.measurements.length === 1)
  check('мусорные строки посчитаны пропущенными', fromDirty.skipped === 2, `skipped=${fromDirty.skipped}`)

  // ── сахар ────────────────────────────────────────────────────────────────

  const mixed = [
    ...sample,
    { kind: 'glucose', id: 'g1-1', ts: new Date(2026, 7, 10, 7, 10, 0).getTime(), mmol: 6.2, context: 'fasting', user: 1, source: 'manual' },
    { kind: 'glucose', id: 'g1-2', ts: new Date(2026, 7, 10, 14, 0, 0).getTime(), mmol: 9.4, context: 'after-meal', user: 1, source: 'manual', note: 'плотный обед' },
  ]

  const mixedBack = parseCsv(toCsv(mixed))
  check('CSV: давление и сахар в одном файле', mixedBack.measurements.length === 5, `получено ${mixedBack.measurements.length}`)
  const glucoseRows = mixedBack.measurements.filter((m) => m.kind === 'glucose')
  check('CSV: сахар отличён от давления', glucoseRows.length === 2)
  check(
    'CSV: значение и момент замера восстановлены',
    glucoseRows.some((g) => g.mmol === 6.2 && g.context === 'fasting') &&
      glucoseRows.some((g) => g.mmol === 9.4 && g.context === 'after-meal'),
    JSON.stringify(glucoseRows),
  )
  check(
    'CSV: давление не пострадало от соседства с сахаром',
    mixedBack.measurements.filter((m) => m.kind === 'bp').length === 3,
  )

  const mixedJson = parseJson(toJson(mixed))
  check('JSON: оба дневника в одной резервной копии', mixedJson.measurements.length === 5)

  // Резервная копия версии 1 не знала о видах измерений — она обязана читаться.
  const legacyJson = JSON.stringify({
    format: 'omron-bp/v1',
    readings: [{ id: 'd1-9', ts: Date.UTC(2026, 7, 1, 6, 0, 0), sys: 130, dia: 85, bpm: 70, ihb: false, mov: false, user: 1, source: 'device' }],
  })
  const fromLegacy = parseJson(legacyJson)
  check('старая резервная копия читается', fromLegacy.measurements.length === 1)
  check('записям из старой копии проставлен вид', fromLegacy.measurements[0].kind === 'bp')

  // Чужой файл только с сахаром: колонки kind нет, вид выводится по данным.
  const sugarOnly = 'Дата;Время;Глюкоза;Момент\n10.08.2026;07:10;6,2;натощак\n10.08.2026;14:00;9,4;после еды\n'
  const fromSugar = parseCsv(sugarOnly)
  check('чужой CSV только с сахаром распознан', fromSugar.measurements.length === 2, JSON.stringify(fromSugar))
  check('вид выведен без колонки kind', fromSugar.measurements.every((m) => m.kind === 'glucose'))
  check('запятая как десятичный разделитель понята', fromSugar.measurements[0].mmol === 6.2)
  check('момент замера по-русски распознан', fromSugar.measurements[1].context === 'after-meal')

  // ── полный снимок: копия обязана содержать всё, что вводили руками ────────
  const snapshot = {
    measurements: mixed,
    medicines: [
      {
        id: 'med-1', name: 'Лозартан', dose: '50 мг', inn: 'Лозартан', form: 'Таблетки покрытые пленочной оболочкой', maker: 'ООО «Завод»', packSize: 30, left: 12, perDay: null,
        expires: Date.UTC(2027, 4, 1), note: 'утром', leftAt: Date.UTC(2026, 7, 3),
        times: ['08:00', '20:00'], perTime: 2, meal: 'after', autoDeduct: true,
        taken: [Date.UTC(2026, 7, 12, 5, 0), Date.UTC(2026, 7, 12, 17, 0)],
      },
      { id: 'med-2', name: 'Метформин', dose: '850 мг', left: null, perDay: null, expires: null },
      { id: 'med-3', name: 'Омега-3', dose: '', kind: 1, left: null, perDay: null, expires: null },
    ],
    settings: { targetSys: 135, targetDia: 85, activeUser: 1, trackGlucose: true },
  }
  const restored = parseJson(toJson(snapshot))
  check('в копии есть измерения', restored.measurements.length === 5)
  check('в копии есть аптечка', restored.medicines.length === 3, JSON.stringify(restored.medicines))
  check('пометка БАДа пережила копию', restored.medicines[2].kind === 1)
  check('у обычного лекарства пометки не появилось', restored.medicines[0].kind === undefined)
  check('препарат восстановлен полностью', restored.medicines[0].name === 'Лозартан' && restored.medicines[0].left === 12)
  check('действующее вещество пережило копию', restored.medicines[0].inn === 'Лозартан')
  check('форма выпуска пережила копию', restored.medicines[0].form === 'Таблетки покрытые пленочной оболочкой')
  check('производитель пережил копию', restored.medicines[0].maker === 'ООО «Завод»')
  check('размер упаковки пережил копию', restored.medicines[0].packSize === 30)

  // Расписание и автосписание — тоже введённые руками данные: без них
  // восстановленная аптечка молчит, а остаток перестаёт считаться.
  const m = restored.medicines[0]
  check('расписание пережило копию', JSON.stringify(m.times) === JSON.stringify(['08:00', '20:00']), JSON.stringify(m))
  check('штук за приём пережило копию', m.perTime === 2)
  check('отношение к еде пережило копию', m.meal === 'after')
  check('автосписание пережило копию', m.autoDeduct === true)
  check('дата подтверждения остатка пережила копию', m.leftAt === Date.UTC(2026, 7, 3))
  check('отметки о приёме пережили копию', (m.taken ?? []).length === 2)

  // Чужой или испорченный файл не должен протащить мусор в расписание.
  const кривое = parseJson(
    JSON.stringify({
      format: 'omron-bp/v3',
      measurements: [],
      medicines: [
        { id: 'x', name: 'Тест', kind: 7, times: ['08:00', 'вечером', 25, null], perTime: 'два', meal: 'иногда', autoDeduct: 'да', taken: ['вчера', 5] },
      ],
    }),
  ).medicines[0]
  check('в расписание попало только время', JSON.stringify(кривое.times) === JSON.stringify(['08:00']), JSON.stringify(кривое.times))
  check('нечисловое число за приём отброшено', кривое.perTime === undefined)
  check('незнакомое отношение к еде отброшено', кривое.meal === undefined)
  check('автосписание включается только настоящим true', кривое.autoDeduct === undefined)
  check('нечисловые отметки отброшены', JSON.stringify(кривое.taken) === JSON.stringify([5]))
  check(
    'незнакомый вид препарата отброшен',
    кривое.kind === undefined,
    'иначе интерфейс не знает, как назвать пометку, и рисует пустую плашку',
  )
  check('пустые поля препарата остались пустыми', restored.medicines[1].left === null && restored.medicines[1].expires === null)
  check('в копии есть настройки', restored.settings?.targetSys === 135)

  // Служебные поля описывают устройство, где копия делалась, и переезжать не должны.
  const withBookkeeping = parseJson(
    toJson({ ...snapshot, settings: { ...snapshot.settings, backupLastAt: 123, backupLastCount: 7 } }),
  )
  check(
    'отметки о копировании не переносятся',
    withBookkeeping.settings?.backupLastAt === undefined && withBookkeeping.settings?.backupLastCount === undefined,
    JSON.stringify(withBookkeeping.settings),
  )

  // Испорченный или чужой файл не должен протащить пустую запись в аптечку.
  const junk = parseJson(
    JSON.stringify({
      format: 'omron-bp/v3',
      measurements: [],
      medicines: [{ id: 'ok', name: 'Аспирин' }, { id: 'no-name', name: '  ' }, { name: 'без id' }, null, 'строка'],
    }),
  )
  check('мусор в аптечке отброшен', junk.medicines.length === 1 && junk.medicines[0].name === 'Аспирин', JSON.stringify(junk.medicines))
  check('недостающие поля препарата заполнены пустыми', junk.medicines[0].left === null && junk.medicines[0].dose === '')

  // Старые копии аптечки не содержат — это не ошибка.
  check('копия без аптечки читается', fromLegacy.medicines.length === 0 && fromLegacy.settings === null)

  return failures
}
