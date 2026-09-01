/**
 * Следы удалений: удалённое не возвращается.
 *
 * Без надгробий удаление в этом приложении не держится. Записям прибора мы
 * присваиваем детерминированные идентификаторы, а выгрузка отдаёт всю память
 * целиком каждый раз — значит, стёртое руками измерение приходило обратно при
 * следующей же выгрузке. То же с копией: восстановился — и удалённое снова
 * здесь.
 *
 * Проверяется весь путь, а не одна функция: удаление, попытка записать то же
 * самое заново, перенос надгробий в копию и применение чужих надгробий.
 */
import { IDBFactory } from 'fake-indexeddb'
import {
  installWebPlatform,
  useIndexedDbFactory,
  getAllMeasurements,
  putMeasurements,
  deleteMeasurement,
  getAllMedicines,
  putMedicine,
  deleteMedicine,
  getAllTombstones,
  saveTombstones,
  toJson,
  parseJson,
} from './build/api.mjs'

const измерение = (id, ts) => ({ id, kind: 'bp', ts, user: 1, source: 'device', sys: 130, dia: 85, bpm: 70 })

export async function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }

  installWebPlatform()
  useIndexedDbFactory(new IDBFactory())

  await putMeasurements([измерение('d1-100', 100_000), измерение('d1-200', 200_000)])
  check('две записи легли', (await getAllMeasurements()).length === 2)

  await deleteMeasurement('d1-100')
  check('после удаления осталась одна', (await getAllMeasurements()).length === 1)

  const graves = await getAllTombstones()
  check('надгробие поставлено', graves.length === 1 && graves[0].id === 'd1-100', JSON.stringify(graves))
  check('надгробие знает вид записи', graves[0]?.kind === 'measurement')
  check('надгробие знает время', Number.isFinite(graves[0]?.at))

  // Главное: повторная выгрузка с прибора приносит ту же запись снова.
  await putMeasurements([измерение('d1-100', 100_000), измерение('d1-300', 300_000)])
  const после = await getAllMeasurements()
  check('удалённое не вернулось при повторной выгрузке', !после.some((m) => m.id === 'd1-100'), JSON.stringify(после.map((m) => m.id)))
  check('новое при этом добавилось', после.some((m) => m.id === 'd1-300'))

  // ── препараты ────────────────────────────────────────────────────────────
  await putMedicine({ id: 'm1', name: 'Конкор', dose: '2,5 мг' })
  await deleteMedicine('m1')
  await putMedicine({ id: 'm1', name: 'Конкор', dose: '2,5 мг' })
  check('удалённый препарат не вернулся', (await getAllMedicines()).length === 0)
  check('надгробий стало два', (await getAllTombstones()).length === 2)

  // ── копия ────────────────────────────────────────────────────────────────
  const файл = toJson({
    measurements: await getAllMeasurements(),
    medicines: [],
    tombstones: await getAllTombstones(),
    settings: null,
  })
  const разобрано = parseJson(файл)
  check('копия несёт надгробия', разобрано.tombstones.length === 2, JSON.stringify(разобрано.tombstones))
  check('копия несёт записи', разобрано.measurements.length === 2)

  // Старый файл без надгробий читается по-прежнему — иначе копии, сделанные
  // до этой версии, стали бы нечитаемыми.
  const старый = JSON.stringify({ format: 'omron-bp/v3', measurements: [измерение('d1-500', 500_000)] })
  check('файл без надгробий читается', parseJson(старый).tombstones.length === 0)

  // Мусор в надгробиях не должен удалять записи: чужое или испорченное
  // надгробие — это потеря данных.
  const кривой = JSON.stringify({
    format: 'omron-bp/v3',
    measurements: [],
    tombstones: [{ id: 'ok', kind: 'measurement', at: 1 }, { id: 5 }, null, { kind: 'measurement', at: 1 }, { id: 'x', kind: 'что-то', at: 1 }],
  })
  check('кривые надгробия отброшены, целое оставлено', parseJson(кривой).tombstones.length === 1)

  // ── чужие надгробия ──────────────────────────────────────────────────────
  await saveTombstones([{ id: 'd1-300', kind: 'measurement', at: Date.now() }])
  await deleteMeasurement('d1-300')
  await putMeasurements([измерение('d1-300', 300_000)])
  check('чужое надгробие тоже держит', !(await getAllMeasurements()).some((m) => m.id === 'd1-300'))

  return failures
}
