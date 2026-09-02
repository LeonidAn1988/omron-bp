/**
 * Слияние дневников двух телефонов.
 *
 * Главное, что проверяется, — ничего не пропадает. Отметка приёма, сделанная
 * женой на её телефоне, обязана пережить слияние с телефоном мужа, даже если он
 * в те же сутки правил ту же коробку. Потерять её незаметно хуже, чем не
 * синхронизировать вовсе: человек считает, что таблетка отмечена.
 */
import { mergeDiary, mergeMedicine, mergeChangedAnything, diarySignature } from './build/api.mjs'

const пусто = { measurements: [], medicines: [], tombstones: [], people: [] }
const коробка = (fields) => ({ id: 'm1', name: 'Метформин', dose: '850 мг', ...fields })

export function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }

  // ── измерения ────────────────────────────────────────────────────────────
  const из_моё = { ...пусто, measurements: [{ id: 'a', ts: 100, kind: 'bp', sys: 120, dia: 80, user: 1, updatedAt: 5 }] }
  const из_чужое = {
    measurements: [
      { id: 'a', ts: 100, kind: 'bp', sys: 125, dia: 82, user: 1, updatedAt: 9 },
      { id: 'b', ts: 200, kind: 'bp', sys: 130, dia: 85, user: 2, updatedAt: 7 },
    ],
    medicines: [],
    tombstones: [],
  }
  const из = mergeDiary(из_моё, из_чужое)
  check('чужая запись добавляется', из.measurements.length === 2)
  check('более свежая чужая правка побеждает', из.measurements.find((m) => m.id === 'a').sys === 125)
  check('журнал считает добавленное и обновлённое', из.log.addedMeasurements === 1 && из.log.updatedMeasurements === 1)

  const из_старое = mergeDiary(из_моё, { ...из_чужое, measurements: [{ id: 'a', ts: 100, kind: 'bp', sys: 999, dia: 9, user: 1, updatedAt: 1 }] })
  check('старая чужая правка не побеждает', из_старое.measurements[0].sys === 120)
  const из_безВремени = mergeDiary(из_моё, { measurements: [{ id: 'a', ts: 100, kind: 'bp', sys: 999, dia: 9, user: 1 }], medicines: [], tombstones: [] })
  check('запись без отметки времени не побеждает известную', из_безВремени.measurements[0].sys === 120)

  // ── удаления сильнее правок ──────────────────────────────────────────────
  const уд = mergeDiary(из_моё, { measurements: [{ id: 'a', ts: 100, kind: 'bp', sys: 999, dia: 9, user: 1, updatedAt: 99 }], medicines: [], tombstones: [{ id: 'a', kind: 'measurement', at: 50 }] })
  check('удалённое на другом телефоне уходит и здесь', уд.measurements.length === 0 && уд.log.removed === 1)
  check('надгробие сохраняется', уд.tombstones.length === 1)
  const уд_своё = mergeDiary({ ...пусто, tombstones: [{ id: 'a', kind: 'measurement', at: 10 }] }, из_чужое)
  check('своё удаление не отменяется чужой записью', !уд_своё.measurements.some((m) => m.id === 'a'))
  const уд_дата = mergeDiary(
    { ...пусто, tombstones: [{ id: 'a', kind: 'measurement', at: 80 }] },
    { measurements: [], medicines: [], tombstones: [{ id: 'a', kind: 'measurement', at: 20 }] },
  )
  check('дата удаления — самая ранняя', уд_дата.tombstones[0].at === 20)

  // ── отметки приёма: накопитель, а не значение ────────────────────────────
  const пр_своя = коробка({ left: 10, leftAt: 100, taken: [10, 20], updatedAt: 100 })
  const пр_чужая = коробка({ left: 8, leftAt: 200, taken: [20, 30], updatedAt: 200 })
  const пр = mergeMedicine(пр_своя, пр_чужая)
  check('отметки объединяются, а не заменяются', пр.next.taken.join(',') === '10,20,30')
  check('остаток берётся из более позднего подтверждения', пр.next.left === 8 && пр.next.leftAt === 200)
  check('отметка времени не младше слагаемых', пр.next.updatedAt === 200)

  const пр_обратно = mergeMedicine(пр_чужая, пр_своя)
  check('слияние не зависит от порядка по отметкам', пр_обратно.next.taken.join(',') === '10,20,30')
  check('и по остатку тоже', пр_обратно.next.left === 8 && пр_обратно.next.leftAt === 200)

  // ── свойства коробки: побеждает свежая правка ────────────────────────────
  const св = mergeMedicine(коробка({ dose: '850 мг', updatedAt: 10 }), коробка({ dose: '1000 мг', updatedAt: 20 }))
  check('свежая дозировка побеждает', св.next.dose === '1000 мг')
  // Своя правка свежее — сливать нечего, и функция честно говорит «ничего не
  // изменилось»: писать в хранилище не надо.
  const св_назад = mergeMedicine(коробка({ dose: '850 мг', updatedAt: 30 }), коробка({ dose: '1000 мг', updatedAt: 20 }))
  check('старая чужая дозировка не побеждает', св_назад === null)
  const св_назад_вжурнале = mergeDiary(
    { ...пусто, medicines: [коробка({ dose: '850 мг', updatedAt: 30 })] },
    { measurements: [], medicines: [коробка({ dose: '1000 мг', updatedAt: 20 })], tombstones: [] },
  )
  check('и в дневнике дозировка осталась своей', св_назад_вжурнале.medicines[0].dose === '850 мг')

  // ── свёрнутая история ────────────────────────────────────────────────────
  const ис = mergeMedicine(
    коробка({ history: { '2026-07': { planned: 30, taken: 28 } }, foldedUntil: 100, updatedAt: 1 }),
    коробка({ history: { '2026-07': { planned: 30, taken: 29 }, '2026-08': { planned: 31, taken: 30 } }, foldedUntil: 200, updatedAt: 2 }),
  )
  check('история объединяется по месяцам', Object.keys(ис.next.history).length === 2)
  check('в общем месяце берётся полный счёт', ис.next.history['2026-07'].taken === 29)
  check('граница свёртки — самая поздняя', ис.next.foldedUntil === 200)

  // ── расхождение остатка называется, а не решается молча ──────────────────
  const ро = mergeDiary(
    { ...пусто, medicines: [коробка({ left: 10, leftAt: 100, updatedAt: 100 })] },
    { measurements: [], medicines: [коробка({ left: 4, leftAt: 100, updatedAt: 110 })], tombstones: [] },
  )
  check('расхождение остатка попадает в журнал', ро.log.stockConflicts.join() === 'Метформин')
  const ро_нет = mergeDiary(
    { ...пусто, medicines: [коробка({ left: 10, leftAt: 100, updatedAt: 100 })] },
    { measurements: [], medicines: [коробка({ left: 4, leftAt: 300, updatedAt: 300 })], tombstones: [] },
  )
  check('разное время подтверждения расхождением не считается', ро_нет.log.stockConflicts.length === 0)

  // ── люди только добавляются ──────────────────────────────────────────────
  const лю = mergeDiary(
    { ...пусто, people: [{ id: 'p1', name: 'Леонид', deviceUser: 1 }] },
    { measurements: [], medicines: [], tombstones: [], people: [{ id: 'p1', name: 'ЧУЖОЕ ИМЯ' }, { id: 'p-w', name: 'Жена' }] },
  )
  check('новый человек добавляется', лю.people.length === 2 && лю.log.addedPeople === 1)
  check('своего человека чужой файл не переименовывает', лю.people[0].name === 'Леонид')

  // ── ничего не менялось ───────────────────────────────────────────────────
  const ни = mergeDiary(из_моё, { measurements: из_моё.measurements, medicines: [], tombstones: [] })
  check('повторное слияние того же ничего не меняет', !mergeChangedAnything(ни.log))
  check('и коробка не переписывается зря', mergeMedicine(пр_своя, пр_своя) === null)

  // ── слепок содержимого ───────────────────────────────────────────────────
  const сл_а = diarySignature(из_моё.measurements, [пр_своя], [])
  const сл_то_же = diarySignature([...из_моё.measurements], [{ ...пр_своя }], [])
  check('слепок не зависит от копии объектов', сл_а === сл_то_же)
  check('правка остатка меняет слепок', diarySignature(из_моё.measurements, [{ ...пр_своя, left: 9, updatedAt: 101 }], []) !== сл_а)
  check('новая запись меняет слепок', diarySignature([...из_моё.measurements, { id: 'z', ts: 1, updatedAt: 1 }], [пр_своя], []) !== сл_а)
  check('надгробие меняет слепок', diarySignature(из_моё.measurements, [пр_своя], [{ id: 'a', kind: 'measurement', at: 5 }]) !== сл_а)
  check('порядок записей на слепок не влияет',
    diarySignature([...из_чужое.measurements].reverse(), [], []) === diarySignature(из_чужое.measurements, [], []))

  return failures
}
