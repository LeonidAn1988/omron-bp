/**
 * Стек экранов.
 *
 * Проверяется главное обещание навигации: «Назад» снимает ровно то, что
 * открылось поверх, и никогда не уносит человека дальше, чем он заходил. Отец
 * 75 лет, у которого кнопка «Назад» из середины настроек выбрасывала на
 * рабочий стол, перестал бы ей пользоваться вообще.
 */
import { rootStack, tabOf, topOf, push, pop, replaceTop, depthOf, tapTab, toTab, pathOf, prune } from './build/api.mjs'

export function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }

  const УЗЛЫ = [
    { kind: 'sub', sub: 'backup' },
    { kind: 'person', id: 'p-dad' },
    { kind: 'card', id: 'm1' },
    { kind: 'form', id: null },
    { kind: 'step', step: 2 },
  ]

  // ── дно стека ────────────────────────────────────────────────────────────
  const корень = rootStack('intake')
  check('дно — вкладка', tabOf(корень) === 'intake' && depthOf(корень) === 0)
  check('с вкладки снимать нечего — приложение свернётся', pop(корень) === null)

  for (const узел of УЗЛЫ) {
    const глубже = push(корень, узел)
    check(`«${узел.kind}» кладётся и снимается`, depthOf(глубже) === 1 && tabOf(pop(глубже)) === 'intake')
    check(`«${узел.kind}» наверху`, topOf(глубже).kind === узел.kind)
  }

  // ── глубокая ссылка возвращает туда, откуда пришли ───────────────────────
  const нб_копия = [{ kind: 'tab', tab: 'intake' }, { kind: 'sub', sub: 'settings' }, { kind: 'sub', sub: 'backup' }]
  const нб_шаг1 = pop(нб_копия)
  check('из копии первая «Назад» — корень настроек', pathOf(нб_шаг1) === 'intake/settings')
  check('вторая — на прежнюю вкладку, а не на «Обзор»', pathOf(pop(нб_шаг1)) === 'intake')

  const нб_человек = [
    { kind: 'tab', tab: 'bp' },
    { kind: 'sub', sub: 'settings' },
    { kind: 'sub', sub: 'people' },
    { kind: 'person', id: 'p-dad' },
  ]
  check('от человека до вкладки три шага', depthOf(нб_человек) === 3)
  check('промежуточный шаг — список людей', pathOf(pop(нб_человек)) === 'bp/settings/people')
  check('глубокая ссылка сохраняет вкладку', tabOf(pop(pop(pop(нб_человек)))) === 'bp')

  // ── нажатие по вкладке ───────────────────────────────────────────────────
  const нв_вглубь = push(push(rootStack('cabinet'), { kind: 'card', id: 'm1' }), { kind: 'form', id: 'm1' })
  const нв_своя = tapTab(нв_вглубь, 'cabinet')
  check('нажатие по своей вкладке из глубины возвращает к корню', depthOf(нв_своя.stack) === 0 && !нв_своя.toRoot)
  const нв_корень = rootStack('cabinet')
  const нв_накорне = tapTab(нв_корень, 'cabinet')
  check('на корне своей вкладки — только сигнал экрану', нв_накорне.toRoot === true)
  check('и стек при этом не трогается', нв_накорне.stack === нв_корень)
  const нв_чужая = tapTab(нв_вглубь, 'overview')
  check('чужая вкладка открывается с корня', pathOf(нв_чужая.stack) === 'overview' && !нв_чужая.toRoot)

  // ── замена верхнего узла ─────────────────────────────────────────────────
  const зам = replaceTop(push(rootStack('overview'), { kind: 'step', step: 1 }), { kind: 'step', step: 2 })
  check('шаг знакомства меняется без углубления', depthOf(зам) === 1 && topOf(зам).step === 2)
  check('на пустом стеке замена кладёт узел', depthOf(replaceTop(rootStack('overview'), { kind: 'sub', sub: 'people' })) === 1)

  // ── вкладка из настроек или чужой копии ──────────────────────────────────
  const ВКЛАДКИ = ['overview', 'bp', 'glucose', 'intake', 'cabinet']
  check('чепуха вкладкой не считается', toTab('чепуха', ВКЛАДКИ) === null)
  check('число вкладкой не считается', toTab(3, ВКЛАДКИ) === null)
  check('известная вкладка проходит', toTab('intake', ВКЛАДКИ) === 'intake')

  // ── чистка стека от исчезнувшего ─────────────────────────────────────────
  const чс_есть = (node) => !(node.kind === 'person' && node.id === 'p-удалён')
  const чс_стек = [
    { kind: 'tab', tab: 'overview' },
    { kind: 'sub', sub: 'settings' },
    { kind: 'sub', sub: 'people' },
    { kind: 'person', id: 'p-удалён' },
  ]
  check('удалённый человек уходит со стека вместе с тем, что над ним', pathOf(prune(чс_стек, чс_есть)) === 'overview/settings/people')
  check('когда чистить нечего — тот же объект', prune(нб_копия, () => true) === нб_копия)

  // ── инвариант на длинной случайной последовательности ────────────────────
  let ин_стек = rootStack('overview')
  let ин_семя = 12345
  const ин_дальше = () => (ин_семя = (ин_семя * 1103515245 + 12345) % 2147483648) / 2147483648
  for (let i = 0; i < 300; i++) {
    const ход = ин_дальше()
    if (ход < 0.4) ин_стек = push(ин_стек, УЗЛЫ[Math.floor(ин_дальше() * УЗЛЫ.length)])
    else if (ход < 0.7) ин_стек = pop(ин_стек) ?? ин_стек
    else if (ход < 0.9) ин_стек = tapTab(ин_стек, ВКЛАДКИ[Math.floor(ин_дальше() * ВКЛАДКИ.length)]).stack
    else ин_стек = replaceTop(ин_стек, УЗЛЫ[Math.floor(ин_дальше() * УЗЛЫ.length)])
    if (ин_стек.length < 1 || ин_стек[0].kind !== 'tab' || !ВКЛАДКИ.includes(tabOf(ин_стек))) {
      check('инвариант стека держится', false, `шаг ${i}: ${pathOf(ин_стек)}`)
      break
    }
  }
  check('после 300 случайных ходов дно осталось вкладкой', ин_стек[0].kind === 'tab' && ин_стек.length >= 1)

  return failures
}
