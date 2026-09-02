/**
 * Правила и подписи настроек.
 *
 * Настройки стали двухуровневыми, и одно решение теперь принимается на одном
 * подэкране, а сказывается на другом: сахар включается на «Нормах», а нижняя
 * строка и стартовый экран настраиваются на «Экране». Здесь проверяется, что
 * эти правила остались одним куском кода и согласованы между собой.
 */
import {
  visibleSections,
  lockedSection,
  toggleSection,
  setTrackGlucose,
  setIntakeTime,
  describeDisplay,
  describePeople,
  describeTargets,
  describeReminders,
  describeBackupRow,
  describePerson,
  describeSections,
} from './build/api.mjs'

const БАЗА = {
  sections: { overview: true, bp: true, glucose: true, intake: true, cabinet: true },
  trackGlucose: true,
  startTab: 'overview',
  theme: 'dark',
  density: 'normal',
  targetSys: 135,
  targetDia: 85,
  remindersOn: true,
  remindersRepeat: true,
  intakeTimes: { morning: '08:00', day: '13:00', evening: '19:00', night: '22:00' },
  people: [{ id: 'p1', name: 'Я', deviceUser: 1 }],
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

  // ── видимые разделы ──────────────────────────────────────────────────────
  check('порядок разделов — как у вкладок', visibleSections(БАЗА).join(',') === 'overview,bp,glucose,intake,cabinet')
  check('сахар держится на своём переключателе, а не на галке раздела',
    visibleSections({ ...БАЗА, trackGlucose: false }).join(',') === 'overview,bp,intake,cabinet')
  check('сахар появляется даже при выключенной галке раздела',
    visibleSections({ ...БАЗА, sections: { ...БАЗА.sections, glucose: false } }).includes('glucose'))

  // ── последний раздел ─────────────────────────────────────────────────────
  const пс_один = { ...БАЗА, sections: { overview: false, bp: false, glucose: true, intake: true, cabinet: false } }
  check('последний раздел заперт', lockedSection(пс_один) === 'intake')
  check('когда разделов двое, ничего не заперто', lockedSection(БАЗА) === null)
  check('сахар последним разделом не считается',
    lockedSection({ ...БАЗА, sections: { overview: false, bp: false, glucose: true, intake: false, cabinet: true } }) === 'cabinet')

  // ── переключение разделов и стартовый экран ──────────────────────────────
  const пр_скрыли = toggleSection({ ...БАЗА, startTab: 'bp' }, 'bp', false)
  check('старт уходит с прячущегося раздела', пр_скрыли.startTab === 'overview', пр_скрыли.startTab)
  check('и сам раздел скрыт', пр_скрыли.sections.bp === false)
  const пр_чужой = toggleSection({ ...БАЗА, startTab: 'intake' }, 'bp', false)
  check('чужой стартовый экран не трогается', пр_чужой.startTab === 'intake')
  const пр_вернули = toggleSection({ ...БАЗА, sections: { ...БАЗА.sections, bp: false }, startTab: 'overview' }, 'bp', true)
  check('возврат раздела старт не двигает', пр_вернули.startTab === 'overview' && пр_вернули.sections.bp === true)

  // ── дневник сахара: одно решение ─────────────────────────────────────────
  const дс_выкл = setTrackGlucose({ ...БАЗА, startTab: 'glucose' }, false)
  check('выключенный сахар уводит стартовый экран', дс_выкл.startTab === 'overview', дс_выкл.startTab)
  check('и гасит галку раздела заодно', дс_выкл.sections.glucose === false && дс_выкл.trackGlucose === false)
  const дс_вкл = setTrackGlucose({ ...БАЗА, trackGlucose: false, sections: { ...БАЗА.sections, glucose: false } }, true)
  check('включение возвращает оба значения', дс_вкл.trackGlucose === true && дс_вкл.sections.glucose === true)
  const дс_только = setTrackGlucose(
    { sections: { overview: false, bp: false, glucose: true, intake: false, cabinet: true }, trackGlucose: true, startTab: 'glucose' },
    false,
  )
  check('без сахара стартом становится оставшийся раздел', дс_только.startTab === 'cabinet', дс_только.startTab)

  // ── часы приёма ──────────────────────────────────────────────────────────
  const чп_один = setIntakeTime(БАЗА, 'p1', 'morning', '06:30')
  check('при одном человеке часы общие', чп_один.intakeTimes.morning === '06:30' && !чп_один.people)
  const чп_семья = {
    ...БАЗА,
    people: [{ id: 'p1', name: 'Я', deviceUser: 1 }, { id: 'p-dad', name: 'Отец', deviceUser: 2 }],
  }
  const чп_отцу = setIntakeTime(чп_семья, 'p-dad', 'morning', '09:00')
  check('в семье часы личные', чп_отцу.people[1].intakeTimes.morning === '09:00' && !чп_отцу.intakeTimes)
  check('чужие часы не тронуты', чп_отцу.people[0].intakeTimes === undefined)
  const чп_пусто = setIntakeTime(чп_семья, 'p-dad', 'morning', '')
  check('пустое значение оставляет прежнее время', чп_пусто.people[1].intakeTimes.morning === '08:00')
  const чп_нет = setIntakeTime(чп_семья, 'p-нет', 'morning', '07:00')
  check('человек не найден — правим общие, а не чужие', чп_нет.intakeTimes.morning === '07:00')

  // ── подписи строк корня ──────────────────────────────────────────────────
  check('экран', describeDisplay(БАЗА) === 'тёмная · обычная плотность', describeDisplay(БАЗА))
  check('плотность называется, когда она не обычная',
    describeDisplay({ ...БАЗА, density: 'roomy' }) === 'тёмная · просторно')
  check('люди перечислены', describePeople(чп_семья.people) === 'Я, Отец')
  check('безымянный человек назван по месту', describePeople([{ id: 'p1', name: '  ' }]) === 'Человек 1')
  check('нормы', describeTargets(БАЗА) === 'давление 135/85 · сахар ведётся')
  check('нормы без сахара', describeTargets({ ...БАЗА, trackGlucose: false }).endsWith('сахар не ведётся'))
  check('напоминания с повтором', describeReminders(БАЗА) === 'включены, повтор 3 раза', describeReminders(БАЗА))
  check('напоминания без повтора', describeReminders({ ...БАЗА, remindersRepeat: false }) === 'включены, без повтора')
  check('напоминания выключены', describeReminders({ ...БАЗА, remindersOn: false }) === 'выключены')

  const сейчас = Date.UTC(2026, 8, 2, 10, 30)
  check('копий ещё не было', describeBackupRow(null, сейчас) === 'копий ещё не было')
  check('вчерашняя копия', describeBackupRow(сейчас - 86400000, сейчас) === 'последняя вчера', describeBackupRow(сейчас - 86400000, сейчас))

  check('человек с кнопкой прибора',
    describePerson({ id: 'p-dad', name: 'Отец', deviceUser: 2, intakeTimes: { morning: '09:00', day: '13:00', evening: '18:00', night: '21:30' } }, БАЗА.intakeTimes)
      === 'кнопка 2 · часы 09:00–21:30')
  check('человек без кнопки прибора',
    describePerson({ id: 'p-k', name: 'Ребёнок' }, БАЗА.intakeTimes).startsWith('без кнопки прибора'))

  check('скрытого нет', describeSections(БАЗА) === 'показаны все')
  check('скрыт один', describeSections({ sections: { ...БАЗА.sections, overview: false } }) === 'скрыт раздел «Обзор»')
  check('скрыто несколько',
    describeSections({ sections: { ...БАЗА.sections, overview: false, bp: false } }) === 'скрыто 2 раздела')

  return failures
}
