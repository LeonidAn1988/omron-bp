import { platform } from '../platform/ports'
import { useEffect, useRef, useState } from 'react'
import type { IntakeSlot, Medicine, Person } from '../types'
import {
  displayAlert,
  effectiveLeft,
  isEstimated,
  medicineAlert,
  runsOutAt,
  sortMedicines,
  supplyDays,
} from '../logic/medicines'
import { buildCalendar, countCalendarEvents } from '../logic/calendar'
import { download } from '../logic/io'
import { Banner } from './bits'
import { ChevronIcon } from './icons'
import { alertText, ALERT_TONE, KindTag, MedicineNudge, Restock, shortFormOf, Supply } from './Medicines'
import { MedicineCard } from './MedicineCard'
import { ownerOf, medicinesOf } from '../logic/people'
import { MedicineForm } from './MedicineForm'

/**
 * Аптечка: что лежит дома.
 *
 * Отдельный раздел от «Приёма»: сюда заходят раз в неделю — пересчитать пачку,
 * завести новый препарат, посмотреть срок. Ежедневное действие живёт в «Приёме»
 * и сюда не мешается.
 *
 * Строка списка — одна цель нажатия, открывает экран препарата. Раскрытия
 * прямо в списке нет намеренно: подробностей на десяток полей, а две цели
 * нажатия в одной строке дают промахи.
 */

type Filter = 'all' | 'week' | 'two-weeks' | 'month' | 'expired'

/**
 * Фильтры аптечки — по сроку, на который хватит запаса.
 *
 * «Кончается» отвечало на вопрос «что уже горит», но настоящий вопрос другой:
 * «что взять, пока я в аптеке». Ответ у него временной — на неделю вперёд, на
 * две, на месяц. Пороги растут, и каждый следующий включает предыдущий: тот,
 * кто выбирает «на месяц», хочет видеть и то, что кончается завтра.
 */
const FILTERS: { key: Filter; title: string; days?: number }[] = [
  { key: 'all', title: 'Все' },
  { key: 'week', title: 'На неделю', days: 7 },
  { key: 'two-weeks', title: 'На 2 недели', days: 14 },
  { key: 'month', title: 'На месяц', days: 30 },
  { key: 'expired', title: 'Просрочены' },
]

export function Cabinet({
  medicines,
  allMedicines,
  intakeSlots,
  people,
  activePerson,
  onSave,
  onDelete,
  pharmacies = [],
  card = null,
  form = null,
  onOpenCard,
  onEditCard,
  onAdd,
  onBack,
}: {
  medicines: Medicine[]
  /** Вся аптечка семьи — для сводного вида. */
  allMedicines: Medicine[]
  /** Кнопки стандартных приёмов из настроек — они же в форме препарата. */
  intakeSlots: IntakeSlot[]
  people: Person[]
  activePerson: string
  onSave: (item: Medicine) => Promise<void>
  onDelete: (id: string) => Promise<void>
  /** Выбранные аптеки: кнопки поиска у препарата и в списке покупок. */
  pharmacies?: readonly string[]
  /**
   * Открытая коробка и форма приходят снаружи, из стека экранов приложения.
   *
   * Своим состоянием они быть перестали: аппаратная «Назад» на Android должна
   * закрывать карточку, а не сворачивать приложение, и знать о ней обязано то
   * место, где живёт вся глубина. Заодно уход на другую вкладку и обратно
   * больше не теряет открытую коробку — раньше её стирало размонтирование.
   */
  card?: string | null
  /** Открытая форма: `id` — правка коробки, `null` внутри объекта — новая. */
  form?: { id: string | null } | null
  onOpenCard: (id: string) => void
  onEditCard: (id: string) => void
  onAdd: () => void
  onBack: () => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  /**
   * Чью аптечку показываем.
   *
   * Семейный вид нужен ради двух вопросов, которые в личной аптечке не
   * задаются: «что вообще заканчивается в доме» и «что купить одним походом».
   * Он живёт только здесь: приём и отчёт врачу общими быть не могут — отметка
   * ставится человеку, и отчёт тоже про одного.
   */
  const [scope, setScope] = useState<string>(activePerson)
  const семья = people.length > 1
  // Выбранный сверху человек мог смениться на другом экране: показывать чужую
  // аптечку с чужим именем в заголовке нельзя.
  useEffect(() => {
    if (scope !== 'family' && !people.some((p) => p.id === scope)) setScope(activePerson)
  }, [scope, people, activePerson])
  const видимые =
    !семья || scope === 'family' ? (scope === 'family' ? allMedicines : medicines) : medicinesOf(allMedicines, people, scope)
  const людиПоId = (id: string | null) => people.find((p) => p.id === id)?.name?.trim() || null
  const имяВладельца = (item: Medicine) => {
    if (!семья || scope !== 'family') return null
    const id = ownerOf(item, people)
    return people.find((p) => p.id === id)?.name?.trim() || null
  }
  /** Куда вернуть список после экрана препарата: терять место при возврате нельзя. */
  const scrollRef = useRef(0)
  const былоГлубже = useRef(false)

  // Прокрутку возвращаем сами: наверх стек не смотрит, а список из полутора
  // десятков коробок, открывшийся в начале, ощущается как потеря места.
  const глубже = card !== null || form !== null
  useEffect(() => {
    if (былоГлубже.current && !глубже) {
      requestAnimationFrame(() => window.scrollTo({ top: scrollRef.current }))
    }
    былоГлубже.current = глубже
  }, [глубже])

  const открыть = (id: string) => {
    scrollRef.current = window.scrollY
    onOpenCard(id)
  }

  const now = Date.now()
  const opened = видимые.find((item) => item.id === card) ?? allMedicines.find((item) => item.id === card) ?? null

  if (form) {
    const item = allMedicines.find((m) => m.id === form.id)
    return (
      <div className="card">
        <div className="card__head">
          <h2>{item ? 'Изменить препарат' : 'Новый препарат'}</h2>
        </div>
        <MedicineForm
          people={people}
          activePerson={activePerson}
          medicine={item}
          intakeSlots={intakeSlots}
          onSave={async (next) => {
            await onSave(next)
            onBack()
          }}
          onCancel={onBack}
        />
      </div>
    )
  }

  if (opened) {
    return (
      <MedicineCard
        medicine={opened}
        owner={имяВладельца(opened) ?? (семья ? людиПоId(ownerOf(opened, people)) : null)}
        pharmacies={pharmacies}
        onBack={onBack}
        onSave={onSave}
        onEdit={() => onEditCard(opened.id)}
        onDelete={async () => {
          await onDelete(opened.id)
          onBack()
        }}
      />
    )
  }

  const all = sortMedicines(видимые, now)
  const порог = FILTERS.find((item) => item.key === filter)?.days
  const rows = all.filter((item) => {
    if (filter === 'all') return true
    const alert = medicineAlert(item, now)
    if (filter === 'expired') return alert?.kind === 'expired' || alert?.kind === 'expiring'
    if (порог === undefined) return true
    // Кончившееся и просроченное показываем при любом пороге: за ними идут в
    // аптеку в первую очередь, и прятать их за словом «на месяц» нельзя.
    if (alert?.kind === 'out' || alert?.kind === 'expired') return true
    const хватит = supplyDays(item, now)
    return хватит !== null && хватит <= порог
  })

  const events = countCalendarEvents(видимые)

  const имя = (id: string) => people.find((p) => p.id === id)?.name?.trim() || 'Без имени'

  return (
    <div className="stack">
      {/* Чей список — над всем, а не внутри карточки аптечки. Раньше этот
          переключатель стоял ниже «Купить», но менял и его: человек листал
          список покупок и не понимал, откуда там чужие лекарства.

          Каждый человек отдельным чипом, а не «мой / вся семья»: в семье из
          четверых «мой» не отвечает на вопрос «что купить отцу». */}
      {семья && (
        <div className="segmented segmented--chips no-print" role="group" aria-label="Чей список">
          {people.map((person) => (
            <button
              key={person.id}
              aria-pressed={scope === person.id}
              onClick={() => setScope(person.id)}
            >
              {имя(person.id)}
            </button>
          ))}
          <button aria-pressed={scope === 'family'} onClick={() => setScope('family')}>
            Вся семья
          </button>
        </div>
      )}

      <Restock medicines={видимые} ownerName={имяВладельца} pharmacies={pharmacies} />

      <div className="card">
        <div className="card__head">
          <h2>
            Аптечка
            {семья && scope !== 'family' && <span className="muted"> · {имя(scope)}</span>}
          </h2>
          {видимые.length > 0 && <span className="muted">препаратов: {видимые.length}</span>}
        </div>

        {видимые.length > 1 && (
          <div className="segmented segmented--chips no-print" role="group" aria-label="Что показывать">
            {FILTERS.map((item) => (
              <button key={item.key} aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
                {item.title}
              </button>
            ))}
          </div>
        )}

        {видимые.length === 0 && (
          <div className="chart__empty">
            Аптечка пуста. Внесите препараты — приложение предупредит, когда они кончаются или истекает срок.
          </div>
        )}

        {видимые.length > 0 && rows.length === 0 && (
          <div className="chart__empty">В этой группе пусто — и это хорошая новость.</div>
        )}

        {rows.length > 0 && (
          <ul className="pills">
            {rows.map((item) => (
              <CabinetRow
                key={item.id}
                medicine={item}
                now={now}
                owner={имяВладельца(item)}
                // Чужую коробку открываем как есть, не переключая человека.
                // Раньше переключали «чтобы правки шли владельцу», но владелец
                // берётся из самой коробки, отметить приём с карточки нельзя, а
                // менялся при этом весь экран под человеком, который просто
                // смотрел, что в доме заканчивается.
                onOpen={() => открыть(item.id)}
              />
            ))}
          </ul>
        )}

        {/* Столбиком во всю ширину: в строку эти две не помещаются, а по
            отдельности получаются разной длины — лесенкой. */}
        <div className="row row--stack" style={{ marginTop: 'var(--space-5)' }}>
          <button className="btn btn--primary" onClick={onAdd}>
            Добавить препарат
          </button>
          {events > 0 && (
            <button
              className="btn"
              onClick={() => void download('приём-лекарств.ics', buildCalendar(medicines, Date.now()), 'text/calendar')}
            >
              Напоминания в календарь
            </button>
          )}
        </div>

        {events > 0 && (
          <Banner tone="info">
            {platform().reminders.isSupported() ? (
              <>
                <b>Приложение напоминает само.</b>
                <div style={{ marginTop: 4 }}>
                  Уведомления со звуком приходят по расписанию из аптечки — включаются в настройках. Выгрузка в
                  календарь остаётся на случай, если удобнее видеть приёмы вместе с остальными делами: событий
                  получится {events}, и после правки расписания её нужно повторить.
                </div>
              </>
            ) : (
              <>
                <b>Напоминает календарь телефона, а не дневник.</b>
                <div style={{ marginTop: 4 }}>
                  Браузер не умеет будить приложение по расписанию, поэтому приёмы выгружаются файлом в календарь — он и
                  звонит. Событий получится {events}. Если поменяете расписание, выгрузите заново.
                </div>
              </>
            )}
          </Banner>
        )}
      </div>
    </div>
  )
}

/**
 * Строка списка: только то, что нужно для беглого просмотра.
 *
 * Название, дозировка, полоса запаса и предупреждение. Всё остальное — на
 * экране препарата: в списке из полутора десятков коробок подробности мешают,
 * а не помогают.
 */
function CabinetRow({
  medicine,
  now,
  owner,
  onOpen,
}: {
  medicine: Medicine
  now: number
  /** Чья коробка. Пусто — своя или человек в дневнике один. */
  owner?: string | null
  onOpen: () => void
}) {
  const { alert, showSupply } = displayAlert(medicine, now)
  const supply = supplyDays(medicine, now)
  const left = effectiveLeft(medicine, now)
  const estimated = isEstimated(medicine, now)

  return (
    <li className="pill">
      <button className="pill__open" onClick={onOpen}>
        <span className="pill__head">
          <span className="pill__title">
            <span className="pill__name">{medicine.name}</span>
            <KindTag kind={medicine.kind} />
            {medicine.dose && <span className="pill__dose">{medicine.dose}</span>}
          </span>
          <ChevronIcon />
        </span>

        <span className="pill__sub">
          {[
            owner ?? '',
            shortFormOf(medicine.form),
            left === null ? '' : `${estimated ? '≈ ' : ''}${left} шт.`,
            estimated ? (medicine.autoDeduct ? 'отмечать не нужно' : 'по расчёту') : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>

        {alert && (
          <span className={`pill__alert pill__alert--${ALERT_TONE[alert.kind]}`}>{alertText(alert, medicine)}</span>
        )}

        {showSupply && <Supply days={supply!} until={runsOutAt(medicine, now)} />}
      </button>
    </li>
  )
}

export { MedicineNudge }
