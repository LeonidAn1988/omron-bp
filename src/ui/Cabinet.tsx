import { platform } from '../platform/ports'
import { useEffect, useRef, useState } from 'react'
import type { IntakeTimes, Medicine, Person } from '../types'
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

type Filter = 'all' | 'low' | 'expired'

const FILTERS: { key: Filter; title: string }[] = [
  { key: 'all', title: 'Все' },
  { key: 'low', title: 'Кончаются' },
  { key: 'expired', title: 'Просрочены' },
]

export function Cabinet({
  medicines,
  intakeTimes,
  people,
  activePerson,
  onSave,
  onDelete,
  toRoot = 0,
}: {
  medicines: Medicine[]
  /** Часы стандартных приёмов из настроек — кнопки в форме препарата. */
  intakeTimes: IntakeTimes
  people: Person[]
  activePerson: string
  onSave: (item: Medicine) => Promise<void>
  onDelete: (id: string) => Promise<void>
  /** Меняется, когда человек нажал на уже активную вкладку: вернуться к списку. */
  toRoot?: number
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  /** Куда вернуть список после экрана препарата: терять место при возврате нельзя. */
  const scrollRef = useRef(0)

  // Возврат к списку по нажатию на свою же вкладку. Фильтр при этом остаётся:
  // человек просил вернуться из карточки, а не сбросить всё, что настроил.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setOpenId(null)
    setEditingId(null)
    setAdding(false)
  }, [toRoot])

  const now = Date.now()
  const opened = medicines.find((item) => item.id === openId) ?? null

  const back = () => {
    setOpenId(null)
    // Восстанавливаем после отрисовки списка, иначе прокручивать ещё нечего.
    requestAnimationFrame(() => window.scrollTo({ top: scrollRef.current }))
  }

  if (editingId || adding) {
    const item = medicines.find((m) => m.id === editingId)
    return (
      <div className="card">
        <div className="card__head">
          <h2>{item ? 'Изменить препарат' : 'Новый препарат'}</h2>
        </div>
        <MedicineForm
          people={people}
          activePerson={activePerson}
          medicine={item}
          intakeTimes={intakeTimes}
          onSave={async (next) => {
            await onSave(next)
            setEditingId(null)
            setAdding(false)
          }}
          onCancel={() => {
            setEditingId(null)
            setAdding(false)
          }}
        />
      </div>
    )
  }

  if (opened) {
    return (
      <MedicineCard
        medicine={opened}
        onBack={back}
        onSave={onSave}
        onEdit={() => {
          setOpenId(null)
          setEditingId(opened.id)
        }}
        onDelete={async () => {
          await onDelete(opened.id)
          back()
        }}
      />
    )
  }

  const all = sortMedicines(medicines, now)
  const rows = all.filter((item) => {
    if (filter === 'all') return true
    const alert = medicineAlert(item, now)
    if (filter === 'low') return alert?.kind === 'low' || alert?.kind === 'out'
    return alert?.kind === 'expired' || alert?.kind === 'expiring'
  })

  const events = countCalendarEvents(medicines)

  return (
    <div className="stack">
      <Restock medicines={medicines} />

      <div className="card">
        <div className="card__head">
          <h2>Аптечка</h2>
          {medicines.length > 0 && <span className="muted">препаратов: {medicines.length}</span>}
        </div>

        {medicines.length > 1 && (
          <div className="segmented segmented--fill no-print" role="group" aria-label="Что показывать">
            {FILTERS.map((item) => (
              <button key={item.key} aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
                {item.title}
              </button>
            ))}
          </div>
        )}

        {medicines.length === 0 && (
          <div className="chart__empty">
            Аптечка пуста. Внесите препараты — приложение предупредит, когда они кончаются или истекает срок.
          </div>
        )}

        {medicines.length > 0 && rows.length === 0 && (
          <div className="chart__empty">В этой группе пусто — и это хорошая новость.</div>
        )}

        {rows.length > 0 && (
          <ul className="pills">
            {rows.map((item) => (
              <CabinetRow
                key={item.id}
                medicine={item}
                now={now}
                onOpen={() => {
                  scrollRef.current = window.scrollY
                  setOpenId(item.id)
                }}
              />
            ))}
          </ul>
        )}

        <div className="row" style={{ marginTop: 'var(--space-5)' }}>
          <button className="btn btn--primary" onClick={() => setAdding(true)}>
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
function CabinetRow({ medicine, now, onOpen }: { medicine: Medicine; now: number; onOpen: () => void }) {
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
            shortFormOf(medicine.form),
            left === null ? '' : `${estimated ? '≈ ' : ''}${left} шт.`,
            estimated ? (medicine.autoDeduct ? 'списывается само' : 'по расчёту') : '',
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
