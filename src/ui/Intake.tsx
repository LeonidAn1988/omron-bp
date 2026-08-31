import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Medicine } from '../types'
import { plural } from '../logic/plural'
import {
  DAY_PARTS,
  DAY_PART_TITLE,
  KEEP_INTAKES_DAYS,
  dayStatus,
  dosesOn,
  partOfDay,
  startOfDay,
  type DayPart,
  type DayStatus,
} from '../logic/medicines'

/**
 * Приём лекарств по дням.
 *
 * Отдельный раздел, а не часть аптечки: это действие делают каждый день, а в
 * аптечку заглядывают раз в неделю. Смешивать их — значит заставлять человека
 * каждое утро проходить мимо складского учёта.
 *
 * Здесь намеренно нет ни формы выпуска, ни действующего вещества, ни срока
 * годности. Утром нужно знать одно: что выпить и не забыл ли. Всё остальное
 * живёт в карточке препарата.
 */

const DAY = 24 * 60 * 60 * 1000

/** Насколько назад можно листать. Дальше отметок всё равно не хранится. */
const PAST_DAYS = KEEP_INTAKES_DAYS
/** Насколько вперёд. Неделя закрывает вопрос «что нужно завтра». */
const FUTURE_DAYS = 7

const MEAL_LABEL: Record<string, string> = { before: 'до еды', after: 'после еды' }

/** «2 шт., после еды» — то, чего не хватало строке приёма. */
function doseExtra(medicine: Medicine): string {
  const штук = medicine.perTime && medicine.perTime > 1 ? `${medicine.perTime} шт.` : ''
  const еда = medicine.meal ? (MEAL_LABEL[medicine.meal] ?? '') : ''
  return [штук, еда].filter(Boolean).join(', ')
}

const WEEKDAY = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
const DAY_TITLE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })

/** Подпись дня словами: «сегодня» читается быстрее, чем «14 августа». */
function dayName(day: number, today: number): string {
  const diff = Math.round((startOfDay(day) - startOfDay(today)) / DAY)
  if (diff === 0) return 'Сегодня'
  if (diff === -1) return 'Вчера'
  if (diff === 1) return 'Завтра'
  return DAY_TITLE.format(day)
}

const STATUS_TITLE: Record<DayStatus, string> = {
  done: 'всё принято',
  missed: 'есть пропуски',
  pending: 'ещё не всё',
  future: 'впереди',
  empty: 'приёмов нет',
}

/**
 * Лента дат.
 *
 * Главная жалоба на приложения этого класса — нельзя вернуться и отметить
 * вчерашнюю дозу. Поэтому прошлые дни здесь равноправны с сегодняшним, а не
 * заперты. Состояние дня видно точкой: цвет плюс подпись, потому что одним
 * цветом смысл передавать нельзя.
 */
function DayStrip({
  days,
  selected,
  today,
  statusOf,
  onSelect,
}: {
  days: number[]
  selected: number
  today: number
  statusOf: (day: number) => DayStatus
  onSelect: (day: number) => void
}) {
  const stripRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Выбранный день подтягивается в центр: без этого при открытии видно начало
  // ленты — то есть два месяца назад, а не сегодня.
  useLayoutEffect(() => {
    const strip = stripRef.current
    const active = activeRef.current
    if (!strip || !active) return
    strip.scrollLeft = active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2
  }, [selected])

  return (
    <div className="daystrip" ref={stripRef} role="tablist" aria-label="Выбор дня">
      {days.map((day) => {
        const status = statusOf(day)
        const active = startOfDay(day) === startOfDay(selected)
        return (
          <button
            key={day}
            ref={active ? activeRef : undefined}
            role="tab"
            aria-selected={active}
            className="daystrip__day"
            data-status={status}
            data-today={startOfDay(day) === startOfDay(today) ? 'true' : undefined}
            onClick={() => onSelect(day)}
          >
            <span className="daystrip__weekday">{WEEKDAY.format(day)}</span>
            <span className="daystrip__date">{new Date(day).getDate()}</span>
            <span className="daystrip__dot" aria-hidden="true" />
            <span className="sr-only">{STATUS_TITLE[status]}</span>
          </button>
        )
      })}
    </div>
  )
}

interface Slot {
  medicine: Medicine
  time: string
  planned: number
  takenAt: number | null
  overdue: boolean
}

export function Intake({
  medicines,
  onMark,
  toRoot = 0,
  openDay = null,
}: {
  medicines: Medicine[]
  /**
   * Отметить или снять отметку приёма.
   *
   * Экран передаёт только «какой препарат и какой приём», а новое состояние
   * собирается там, где видно настоящее содержимое хранилища. Собирать его
   * здесь было нельзя: пропс — слепок последней отрисовки, и второе нажатие
   * подряд строило отметку на препарате без первой, стирая её.
   */
  onMark: (id: string, plannedTs: number, undo?: boolean) => Promise<void>
  /** Меняется, когда человек нажал на уже активную вкладку: вернуться на сегодня. */
  toRoot?: number
  /**
   * День, который надо показать: приходит от нажатия по напоминанию.
   *
   * Напоминание может быть о вчерашнем приёме — например, человек нажал
   * «Принял» утром на уведомлении, которое пришло вечером. Открыть при этом
   * сегодняшний день значит показать не то, что он только что отметил.
   */
  openDay?: number | null
}) {
  const [now, setNow] = useState(() => Date.now())
  const [selected, setSelected] = useState(() => openDay ?? Date.now())

  // День из уведомления главнее текущего выбора: человек только что нажал
  // «Принял» именно на нём.
  useEffect(() => {
    if (openDay !== null) setSelected(openDay)
  }, [openDay])

  // Уйдя листать прошлую неделю, вернуться к сегодняшнему дню человек будет
  // именно нажатием на вкладку — искать «Сегодня» в ленте из шести десятков
  // дней он не станет.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setSelected(Date.now())
  }, [toRoot])

  // Время идёт: без обновления «пора принять» не станет «время прошло», пока
  // человек не перезайдёт. Раз в минуту достаточно и не греет телефон.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const days: number[] = []
  for (let offset = -PAST_DAYS; offset <= FUTURE_DAYS; offset++) days.push(startOfDay(now) + offset * DAY)

  const slots: Slot[] = medicines
    .flatMap((medicine) =>
      dosesOn(medicine, selected, now).map((slot) => ({
        medicine,
        time: slot.time,
        planned: startOfDay(selected) + Number(slot.time.slice(0, 2)) * 3_600_000 + Number(slot.time.slice(3)) * 60_000,
        takenAt: slot.takenAt,
        overdue: slot.overdue,
      })),
    )
    .sort((a, b) => a.time.localeCompare(b.time))

  const byPart = DAY_PARTS.map((part) => ({
    part,
    rows: slots.filter((slot) => partOfDay(slot.time) === part),
  })).filter((group) => group.rows.length > 0)

  const left = slots.filter((slot) => slot.takenAt === null && !slot.medicine.autoDeduct).length
  const future = startOfDay(selected) > startOfDay(now)

  return (
    <div className="stack">
      <DayStrip
        days={days}
        selected={selected}
        today={now}
        statusOf={(day) => dayStatus(medicines, day, now)}
        onSelect={setSelected}
      />

      <div className="intake__head">
        <h2>{dayName(selected, now)}</h2>
        <span className="muted">
          {slots.length === 0
            ? 'приёмов нет'
            : left === 0
              ? 'всё отмечено'
              : future
                ? `приёмов: ${slots.length}`
                : `осталось отметить: ${left}`}
        </span>
      </div>

      {slots.length === 0 && (
        <div className="card">
          <div className="chart__empty">
            На этот день приёмов нет. Расписание задаётся в карточке препарата — раздел «Аптечка».
          </div>
        </div>
      )}

      {byPart.map(({ part, rows }) => (
        <PartCard key={part} part={part} rows={rows} future={future} onMark={onMark} />
      ))}
    </div>
  )
}

/**
 * Карточка части суток.
 *
 * Пожилой человек мыслит «утренние таблетки», а не «приём в 08:00» — так
 * назначение и проговаривает врач. Точное время при этом никуда не девается,
 * оно стоит у каждой строки.
 */
function PartCard({
  part,
  rows,
  future,
  onMark,
}: {
  part: DayPart
  rows: Slot[]
  future: boolean
  onMark: (id: string, plannedTs: number, undo?: boolean) => Promise<void>
}) {
  const done = rows.every((row) => row.takenAt !== null || row.medicine.autoDeduct)
  const [занят, setЗанят] = useState(false)

  // Что в этой карточке ещё не отмечено. Препараты с автосписанием не считаем:
  // кнопки «Принял» у них нет вовсе, и отмечать за них нечего.
  const неотмеченных = rows.filter((row) => row.takenAt === null && !row.medicine.autoDeduct)

  async function принятьВсё() {
    setЗанят(true)
    try {
      // По очереди, а не разом: каждая отметка меняет остаток препарата, и
      // параллельная запись затёрла бы соседнюю — обе читают одно состояние.
      for (const row of неотмеченных) {
        await onMark(row.medicine.id, row.planned)
      }
    } finally {
      setЗанят(false)
    }
  }
  const времена = [...new Set(rows.map((row) => row.time))].sort()
  const часыКарточки = времена.length > 1 ? `${времена[0]}–${времена[времена.length - 1]}` : времена[0]

  return (
    <div className="card intake" data-done={done ? 'true' : undefined}>
      <div className="card__head">
        <h2>{DAY_PART_TITLE[part]}</h2>
        {/* Часть суток может держать несколько приёмов: «Вечер» это и 20:00, и
            21:00. Раньше в заголовок шло время первой строки, и карточка
            уверяла, что весь вечер — двадцать ноль-ноль. */}
        <span className="muted">{часыКарточки}</span>
      </div>

      {/*
        Отметить весь приём разом.
        Утром человек подходит к аптечке один раз и принимает всё назначенное —
        нажимать «Принял» пять раз подряд значит заставлять его повторять то, что
        он сделал одним действием. Кнопка появляется, только когда отмечать есть
        что и таких строк больше одной: на единственной она была бы вторым
        способом сделать то же самое.
      */}
      {!future && неотмеченных.length > 1 && (
        <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
          <button className="btn btn--primary" disabled={занят} onClick={() => void принятьВсё()}>
            {занят ? 'Отмечаю…' : `Принял всё — ${неотмеченных.length} ${plural(неотмеченных.length, 'препарат', 'препарата', 'препаратов')}`}
          </button>
        </div>
      )}

      <ul className="doses">
        {rows.map((row) => (
          <li
            key={`${row.medicine.id}-${row.time}`}
            className="dose"
            data-done={row.takenAt !== null ? 'true' : undefined}
          >
            {/* Когда приём в карточке один, час уже стоит в заголовке —
                повторять его у каждой строки значит писать одно число трижды.
                Колонку при этом убираем целиком: пустой span шириной 3,5em
                оставлял слева широкий провал и сдвигал названия к середине. */}
            {времена.length > 1 && <span className="dose__time">{row.time}</span>}

            <span className="dose__body">
              <span className="dose__name">{row.medicine.name}</span>
              {row.medicine.dose && <span className="dose__amount">{row.medicine.dose}</span>}
              {/* Сколько штук и когда относительно еды.
                  Экран приёма отвечает на вопрос «что выпить сейчас», и без
                  количества он отвечает на половину: назначение «по две
                  таблетки утром» превращалось в «Лозап 50 мг». Ошибка вдвое по
                  дозе у гипертоника опаснее пропуска. В уведомлении эти данные
                  показывались, а на самом экране — нет. */}
              {doseExtra(row.medicine) && <span className="dose__extra">{doseExtra(row.medicine)}</span>}
              {/* Отметка и её отмена стоят одной строкой под названием, а не в
                  колонке действий: широкая кнопка выдавливала название в три
                  строки, и отмеченная строка была вдвое выше остальных. */}
              {row.takenAt !== null && (
                <span className="dose__done">
                  {/* Раньше здесь стояло «принято в 08:00», и это было
                      плановое время, а не фактическое: приняв таблетки в 11:40,
                      человек читал, что принял их в восемь. Приложение врало в
                      собственных данных, и эта неправда уезжала врачу. Пока
                      отметка хранит плановый час (по нему приём и опознаётся),
                      честнее не называть час вовсе. */}
                  ✓ принято
                  <button className="dose__undo" onClick={() => void onMark(row.medicine.id, row.takenAt!, true)}>
                    убрать отметку
                  </button>
                </span>
              )}
              {/* Тревога только там, где есть что сделать. У препарата с
                  автосписанием кнопки «Принял» нет вовсе, и остаток списывается
                  сам — «время прошло» на нём это тревога без повода и без
                  выхода, да ещё и набранная ярче отмеченных строк. */}
              {row.overdue && row.takenAt === null && !row.medicine.autoDeduct && (
                <span className="dose__late">● время прошло</span>
              )}
            </span>

            {row.medicine.autoDeduct ? (
              <span className="dose__auto">списывается само</span>
            ) : row.takenAt === null ? (
              <button
                className="btn btn--primary"
                disabled={future}
                onClick={() => void onMark(row.medicine.id, row.planned)}
              >
                Принял
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {future && (
        <p className="muted" style={{ margin: 'var(--space-3) 0 0' }}>
          День ещё не наступил — отмечать нечего, это список на будущее.
        </p>
      )}
    </div>
  )
}
