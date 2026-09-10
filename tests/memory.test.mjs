/**
 * Память прибора: сколько занято и на сколько ещё хватит.
 *
 * Буфер кольцевой: набралась сотня — прибор молча затирает самое старое.
 * Ошибка здесь не в интерфейсе, а в данных: человек приносит врачу месяц
 * вместо трёх и не знает об этом.
 */
import { memoryUse, memoryHint, memoryTight, DEVICE_SLOTS } from './build/api.mjs'

const ДЕНЬ = 24 * 60 * 60 * 1000
const база = Date.UTC(2026, 8, 1, 9, 0, 0)

export function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }

  const записи = (n, user = 1, шагДней = 1) =>
    Array.from({ length: n }, (_, i) => ({ user, ts: база + i * шагДней * ДЕНЬ }))

  check('пусто — ничего не считаем', memoryUse([]).length === 0)

  // Тридцать записей за тридцать дней: по одной в день, места ещё на семьдесят.
  const [ровно] = memoryUse(записи(30))
  check('занято столько, сколько записей', ровно.used === 30 && ровно.capacity === DEVICE_SLOTS)
  check('память не заполнена', ровно.full === false)
  check('темп — одна в день', Math.round(ровно.perDay) === 1)
  check('хватит примерно на семьдесят дней', ровно.daysLeft === 70, String(ровно.daysLeft))
  check('до заполнения далеко — торопиться незачем', memoryTight(ровно) === false)

  // Три замера в день: сотня набьётся за тридцать три дня, и это ровно тот
  // случай, ради которого пункт заводился.
  const часто = Array.from({ length: 60 }, (_, i) => ({ user: 1, ts: база + Math.floor(i / 3) * ДЕНЬ + (i % 3) * 3600_000 }))
  const [густо] = memoryUse(часто)
  check('трижды в день — темп три', Math.round(густо.perDay) === 3, String(густо.perDay))
  check('осталось меньше двух недель — пора выгружать', memoryTight(густо) === true, String(густо.daysLeft))

  // Заполненная память: прибор уже затирает.
  const [полна] = memoryUse(записи(DEVICE_SLOTS))
  check('сотня из сотни — заполнена', полна.full === true && полна.used === DEVICE_SLOTS)
  check('про заполненную говорим прямо', /затирает самое старое/.test(memoryHint(полна)))
  check('заполненная всегда требует внимания', memoryTight(полна) === true)

  // Две кнопки прибора: у каждой своя сотня, складывать нельзя.
  const обе = memoryUse([...записи(96, 1), ...записи(4, 2)])
  check('кнопки считаются отдельно', обе.length === 2 && обе[0].used === 96 && обе[1].used === 4)
  check('кнопки идут по порядку', обе[0].user === 1 && обе[1].user === 2)
  check('чужая кнопка на нашу тревогу не влияет', memoryTight(обе[1]) === false)

  // Всё в один день — темп посчитать не из чего, и врать не надо.
  const [залпом] = memoryUse([
    { user: 1, ts: база },
    { user: 1, ts: база + 60_000 },
    { user: 1, ts: база + 120_000 },
  ])
  check('за один день темп не считаем', залпом.perDay === null && залпом.daysLeft === null)
  check('но занятость знаем', залпом.used === 3)
  check('без темпа подсказка короткая', memoryHint(залпом) === 'Занято 3 из 100.')

  check('одна запись — темпа нет', memoryUse([{ user: 1, ts: база }])[0].perDay === null)

  return failures
}
