/**
 * Гайд-курс: какие курсы и шаги показывать.
 *
 * Проверяется главное правило — курс не зовёт туда, чего в этой сборке нет:
 * ни в выключенный раздел, ни к напоминаниям в браузере, ни к кнопке выбора
 * человека, когда человек один.
 */
import { tours, tourByKey } from './build/api.mjs'

const базовые = {
  sections: { overview: true, bp: true, intake: true, cabinet: true },
  trackGlucose: false,
  people: [{ id: 'a', name: 'Я' }],
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

  const всё = tours(базовые)
  check('курсов четыре', всё.length === 4, `их ${всё.length}`)
  check('ключи не повторяются', new Set(всё.map((к) => к.key)).size === всё.length)
  check(
    'у каждого курса есть шаги и они не длиннее шести',
    всё.every((к) => к.steps.length > 0 && к.steps.length <= 6),
    всё.map((к) => `${к.key}:${к.steps.length}`).join(' '),
  )
  check(
    'у каждого шага есть цель, заголовок и текст',
    всё.every((к) => к.steps.every((ш) => ш.target && ш.title && ш.text)),
  )

  const один = всё.find((к) => к.key === 'basics')
  check('при одном человеке шага про выбор человека нет', !один.steps.some((ш) => ш.target === 'person'))

  const семья = tours({ ...базовые, people: [{ id: 'a' }, { id: 'b' }] })
  const сСемьёй = семья.find((к) => к.key === 'basics')
  check('в семье шаг про выбор человека появляется', сСемьёй.steps.some((ш) => ш.target === 'person'))

  const безНапоминаний = tours(базовые, { reminders: false })
  check(
    'без напоминаний шага про них нет',
    !безНапоминаний.some((к) => к.steps.some((ш) => ш.target === 'set-reminders')),
  )
  check(
    'с напоминаниями шаг про них есть',
    tours(базовые, { reminders: true }).some((к) => к.steps.some((ш) => ш.target === 'set-reminders')),
  )

  const безДавления = tours({ ...базовые, sections: { ...базовые.sections, bp: false } })
  check('без раздела давления курса про давление нет', !безДавления.some((к) => к.key === 'bp'))
  check(
    'и ни один шаг не зовёт на выключенную вкладку',
    !безДавления.some((к) => к.steps.some((ш) => ш.tab === 'bp')),
  )

  const толькоАптечка = tours({
    sections: { overview: false, bp: false, intake: false, cabinet: true },
    trackGlucose: false,
    people: [{ id: 'a' }],
  })
  check('с одной аптечкой курсы остаются', толькоАптечка.length >= 2, `их ${толькоАптечка.length}`)
  check(
    'и не зовут ни на «Обзор», ни на «Приём»',
    !толькоАптечка.some((к) => к.steps.some((ш) => ш.tab === 'overview' || ш.tab === 'intake')),
  )

  check('курс по ключу находится', tourByKey('meds', базовые)?.key === 'meds')
  check('несуществующий ключ даёт null', tourByKey('нет такого', базовые) === null)
  check('выключенный курс по ключу не отдаётся', tourByKey('bp', { ...базовые, sections: { ...базовые.sections, bp: false } }) === null)

  return failures
}
