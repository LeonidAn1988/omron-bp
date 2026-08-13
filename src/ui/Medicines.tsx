import { useState } from 'react'
import type { Medicine } from '../types'
import {
  daysToExpiry,
  dosesToday,
  EXPIRY_SOON_DAYS,
  effectiveLeft,
  isEstimated,
  runsOutAt,
  setLeft,
  shortForm,
  SUPPLY_SOON_DAYS,
  expiryToMonth,
  formatTime,
  markTaken,
  medicineAlert,
  monthToExpiry,
  normalizeTimes,
  parseTime,
  perDayOf,
  sortMedicines,
  supplyDays,
  undoTaken,
  type MedicineAlert,
} from '../logic/medicines'
import { buildCalendar, countCalendarEvents } from '../logic/calendar'
import { download } from '../logic/io'
import { plural } from '../logic/plural'
import { NumberField } from './NumberField'
import { Banner, Field } from './bits'
import { DrugPicker, VariantPicker } from './DrugPicker'
import type { Drug, DrugVariant } from '../logic/drugs'
import { PencilIcon, TrashIcon } from './icons'

/**
 * Аптечка: что лежит дома, сколько осталось и до какого месяца годно.
 *
 * Список, а не карточки: карточка на каждую коробку превратила бы полтора
 * десятка препаратов в частокол одинаковых прямоугольников внутри карточки
 * раздела — вложенные карточки всегда ошибка. Строки со скупыми разделителями
 * читаются быстрее и на телефоне, и на компьютере.
 *
 * Напоминаний о приёме здесь нет намеренно: браузер не умеет будить приложение
 * по расписанию, и обещать напоминание, которое не придёт, хуже, чем не обещать.
 */

/**
 * «мая 2027», а не «май 2027». Intl с month: 'long' даёт именительный падеж, и
 * получается «годен до май 2027» — падеж приходится задавать руками.
 */
const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

const monthYear = (ts: number): string => {
  const d = new Date(ts)
  return `${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}`
}

/** Для истёкшего срока — точная дата: последний годный день мы знаем наверняка. */
const EXACT_DATE = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })

const days = (n: number): string => `${n} ${plural(n, 'день', 'дня', 'дней')}`

function alertText(alert: MedicineAlert, medicine: Medicine): string {
  switch (alert.kind) {
    case 'expired':
      return `Срок годности истёк ${EXACT_DATE.format(medicine.expires!)}`
    case 'out':
      return 'Закончился'
    case 'low':
      return alert.days === 0 ? 'Хватит меньше чем на день' : `Хватит на ${days(alert.days)}`
    case 'expiring':
      return `Годен до конца ${monthYear(medicine.expires!)}`
  }
}

/** Строгий срок и кончившийся препарат — красным, остальное — жёлтым. */
const ALERT_TONE: Record<MedicineAlert['kind'], 'critical' | 'warning'> = {
  expired: 'critical',
  out: 'critical',
  low: 'warning',
  expiring: 'warning',
}

/**
 * Строка на обзоре. Пометка на переключателе внутри «Записей» видна только тому,
 * кто уже туда зашёл, — а до аптечки два касания, и по дороге предупреждение
 * теряется.
 */
export function MedicineNudge({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count === 0) return null

  return (
    <Banner tone="warning">
      <b>
        Аптечка: {count} {plural(count, 'препарат требует', 'препарата требуют', 'препаратов требуют')} внимания
      </b>
      <div style={{ marginTop: 4 }}>Что-то заканчивается или у чего-то истекает срок годности.</div>
      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <button className="btn" onClick={onOpen}>
          Открыть аптечку
        </button>
      </div>
    </Banner>
  )
}

const TIME_LABEL = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

/**
 * Что принять сегодня.
 *
 * Стоит первым, потому что это единственный вопрос, с которым человек открывает
 * аптечку каждый день. Остальное — справочная часть, к ней обращаются раз в
 * месяц.
 */
function TodayDoses({ medicines, onSave }: { medicines: Medicine[]; onSave: (item: Medicine) => Promise<void> }) {
  const now = Date.now()
  const rows = medicines
    .map((m) => ({ medicine: m, slots: dosesToday(m, now) }))
    .filter((r) => r.slots.length > 0)
    .flatMap((r) => r.slots.map((slot) => ({ medicine: r.medicine, slot })))
    .sort((a, b) => a.slot.time.localeCompare(b.slot.time))

  if (rows.length === 0) return null

  // Автосписываемые в счётчик не идут: отмечать их не нужно, и «осталось 6»
  // при пяти автоматических читалось бы как невыполненный долг.
  const left = rows.filter((r) => r.slot.takenAt === null && !r.medicine.autoDeduct).length

  return (
    <div className="card">
      <div className="card__head">
        <h2>Сегодня</h2>
        <span className="muted">{left === 0 ? 'всё отмечено' : `осталось отметить: ${left}`}</span>
      </div>

      <ul className="doses">
        {rows.map(({ medicine, slot }) => (
          <li key={`${medicine.id}-${slot.time}`} className="dose" data-done={slot.takenAt !== null ? 'true' : undefined}>
            <span className="dose__time">{slot.time}</span>
            <span className="dose__body">
              <span className="dose__name">{medicine.name}</span>
              {medicine.dose && <span className="dose__amount">{medicine.dose}</span>}
              {slot.takenAt !== null && (
                <span className="dose__done">принято в {TIME_LABEL.format(slot.takenAt)}</span>
              )}
              {slot.overdue && <span className="dose__late">время прошло</span>}
            </span>
            {/* При автосписании кнопки нет намеренно: расписание уже списало эту
                дозу, и второе списание по нажатию увело бы остаток вдвое. */}
            {medicine.autoDeduct ? (
              <span className="dose__auto">списывается само</span>
            ) : slot.takenAt === null ? (
              <button className="btn btn--primary" onClick={() => void onSave(markTaken(medicine, Date.now()))}>
                Принял
              </button>
            ) : (
              <button className="btn btn--sm" onClick={() => void onSave(undoTaken(medicine, slot.takenAt!))}>
                Отменить
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Medicines({
  medicines,
  onSave,
  onDelete,
}: {
  medicines: Medicine[]
  onSave: (item: Medicine) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const now = Date.now()
  const rows = sortMedicines(medicines, now)
  const events = countCalendarEvents(medicines)

  const exportCalendar = () =>
    void download('приём-лекарств.ics', buildCalendar(medicines, Date.now()), 'text/calendar')

  return (
    <>
      <TodayDoses medicines={medicines} onSave={onSave} />

      <div className="card">
      <div className="card__head">
        <h2>Аптечка</h2>
        {medicines.length > 0 && <span className="muted">препаратов: {medicines.length}</span>}
      </div>

      {rows.length === 0 && !adding && (
        <div className="chart__empty">
          Аптечка пуста. Внесите препараты — приложение предупредит, когда они кончаются или истекает срок.
        </div>
      )}

      {rows.length > 0 && (
        <ul className="pills">
          {rows.map((item) =>
            editingId === item.id ? (
              <li key={item.id} className="pills__edit">
                <MedicineForm
                  medicine={item}
                  onSave={async (next) => {
                    await onSave(next)
                    setEditingId(null)
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <MedicineRow
                key={item.id}
                medicine={item}
                now={now}
                onSave={onSave}
                onEdit={() => {
                  setAdding(false)
                  setEditingId(item.id)
                }}
                onDelete={() => onDelete(item.id)}
              />
            ),
          )}
        </ul>
      )}

      {adding ? (
        <div className="pills__edit pills__edit--new">
          <MedicineForm
            onSave={async (next) => {
              await onSave(next)
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          <button
            className="btn btn--primary"
            onClick={() => {
              setEditingId(null)
              setAdding(true)
            }}
          >
            Добавить препарат
          </button>
          {events > 0 && (
            <button className="btn" onClick={exportCalendar}>
              Напоминания в календарь
            </button>
          )}
        </div>
      )}

      {events > 0 && (
        <Banner tone="info">
          <b>Напоминает календарь телефона, а не дневник.</b>
          <div style={{ marginTop: 4 }}>
            Браузер не умеет будить приложение по расписанию, поэтому приёмы выгружаются файлом в календарь — он и
            звонит. Событий получится {events}. Если поменяете расписание, выгрузите заново: события с тем же временем
            обновятся, а отменённые придётся убрать из календаря руками.
          </div>
        </Banner>
      )}
      </div>
    </>
  )
}

/** «26 августа» — дата, когда запас кончится. Она нагляднее, чем «через 13 дней». */
const dayMonth = (ts: number): string => {
  const d = new Date(ts)
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`
}

/** Горизонт полосы запаса. Дальше месяца загадывать бессмысленно, а полоса всё равно полна. */
const SUPPLY_HORIZON = 30

/**
 * Прогноз запаса: полоса и подпись.
 *
 * Полоса нужна для взгляда мельком — заполнена наполовину или почти пуста
 * видно быстрее, чем читается число. Смысл при этом несёт подпись: полоса
 * скрыта от скринридера, дублировать её словами нечем.
 */
function Supply({ days, until }: { days: number; until: number | null }) {
  const state = days <= 0 ? 'critical' : days <= SUPPLY_SOON_DAYS ? 'warning' : 'ok'
  const fill = Math.max(2, Math.min(100, Math.round((days / SUPPLY_HORIZON) * 100)))

  return (
    <div className="supply" data-state={state}>
      <div className="supply__track" aria-hidden="true">
        <div className="supply__fill" style={{ width: `${fill}%` }} />
      </div>
      <div className="supply__text">
        {days <= 0 ? 'Запас кончился' : <>Хватит на {days} {plural(days, 'день', 'дня', 'дней')}</>}
        {until !== null && days > 0 && <span className="muted"> · до {dayMonth(until)}</span>}
      </div>
    </div>
  )
}

/** Пара «подпись — значение». Сетка вместо строки через точки: глазами ищут подпись. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function MedicineRow({
  medicine,
  now,
  onEdit,
  onSave,
  onDelete,
}: {
  medicine: Medicine
  now: number
  onEdit: () => void
  onSave: (item: Medicine) => Promise<void>
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [editingLeft, setEditingLeft] = useState(false)

  const alert = medicineAlert(medicine, now)
  const supply = supplyDays(medicine, now)
  const perDay = perDayOf(medicine)
  const left = effectiveLeft(medicine, now)
  const estimated = isEstimated(medicine, now)
  /** Просроченному препарату прогноз запаса не нужен: его не принимают. */
  const showSupply = supply !== null && alert?.kind !== 'expired'

  /**
   * Что написать в строке предупреждения.
   *
   * Про запас теперь говорит полоса — цветом и датой, полнее любого текста.
   * Значит строка свободна для следующего по важности, а это срок годности.
   * Иначе истекающий в этом месяце срок молчал бы, пока препарат кончается.
   */
  const expiry = daysToExpiry(medicine, now)
  const expirySoon: MedicineAlert | null =
    expiry === null ? null : expiry < 0 ? { kind: 'expired', days: expiry } : expiry <= EXPIRY_SOON_DAYS ? { kind: 'expiring', days: expiry } : null
  const shownAlert = alert && !(alert.kind === 'low' && showSupply) ? alert : expirySoon

  const schedule = medicine.times?.length
    ? medicine.times.join(', ')
    : perDay !== null
      ? `${perDay} ${plural(perDay, 'раз', 'раза', 'раз')} в день`
      : null

  const perTime = medicine.perTime ?? 1
  const scheduleNote = [
    medicine.times?.length && perTime > 1 ? `по ${perTime} шт.` : '',
    medicine.meal ? MEAL_SHORT[medicine.meal] : '',
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <li className="pill">
      <div className="pill__head">
        <div className="pill__title">
          <span className="pill__name">{medicine.name}</span>
          {medicine.dose && <span className="pill__dose">{medicine.dose}</span>}
        </div>

        <div className="pill__actions">
          {confirming ? (
            // Удаление в два касания. Отменить его нечем — препарат вводили руками,
            // и восстанавливать его будет неоткуда, кроме резервной копии.
            <>
              <button className="btn btn--danger btn--sm" onClick={onDelete}>
                Удалить
              </button>
              <button className="btn btn--sm" onClick={() => setConfirming(false)}>
                Отмена
              </button>
            </>
          ) : (
            <>
              <button className="btn btn--icon" onClick={onEdit} aria-label={`Изменить: ${medicine.name}`}>
                <PencilIcon />
              </button>
              <button
                className="btn btn--icon"
                onClick={() => setConfirming(true)}
                aria-label={`Удалить: ${medicine.name}`}
              >
                <TrashIcon />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Действующее вещество под торговым названием: врач называет препарат им,
          а на упаковке напечатано название конкретной фирмы. */}
      {(medicine.form || (medicine.inn && medicine.inn.toLowerCase() !== medicine.name.toLowerCase())) && (
        <div className="pill__inn">
          {[shortForm(medicine.form), medicine.inn !== medicine.name ? medicine.inn : ''].filter(Boolean).join(' · ')}
        </div>
      )}

      {shownAlert && (
        <div className={`pill__alert pill__alert--${ALERT_TONE[shownAlert.kind]}`}>
          {alertText(shownAlert, medicine)}
        </div>
      )}

      {showSupply && <Supply days={supply!} until={runsOutAt(medicine, now)} />}

      <dl className="facts">
        <Fact label="Остаток">
          {left === null ? (
            <span className="muted">не считаем</span>
          ) : (
            <button
              className="fact__edit"
              onClick={() => setEditingLeft(true)}
              aria-label={`Изменить остаток: ${medicine.name}`}
            >
              {estimated && '≈ '}
              {left} шт.
              <PencilIcon />
            </button>
          )}
          {medicine.autoDeduct && <span className="fact__note">списывается само</span>}
          {estimated && !medicine.autoDeduct && <span className="fact__note">по расчёту</span>}
        </Fact>

        {schedule && (
          <Fact label="Приём">
            {schedule}
            {scheduleNote && <span className="fact__note">{scheduleNote}</span>}
          </Fact>
        )}

        {/* Срок не повторяем, когда о нём уже сказано предупреждением: одно и то
            же двумя способами в одной строке читается как две разные вещи. */}
        {medicine.expires !== null && shownAlert?.kind !== 'expired' && shownAlert?.kind !== 'expiring' && (
          <Fact label="Годен до">{monthYear(medicine.expires)}</Fact>
        )}
      </dl>

      {editingLeft && (
        <LeftEditor
          medicine={medicine}
          onCancel={() => setEditingLeft(false)}
          onSave={async (value) => {
            await onSave(setLeft(medicine, value, Date.now()))
            setEditingLeft(false)
          }}
        />
      )}

      {medicine.note && <div className="pill__note">{medicine.note}</div>}
    </li>
  )
}

/**
 * Правка остатка на месте.
 *
 * Отдельно от общей формы: пересчитать упаковку — самое частое действие после
 * отметки приёма, и открывать ради одного числа форму с восемью полями незачем.
 */
function LeftEditor({
  medicine,
  onSave,
  onCancel,
}: {
  medicine: Medicine
  onSave: (value: number) => Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState(String(medicine.left ?? ''))
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const parsed = Number(value.replace(',', '.'))
    if (!Number.isFinite(parsed)) return
    setBusy(true)
    try {
      await onSave(parsed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="pill__left-edit" onSubmit={submit}>
      <div style={{ maxWidth: 170 }}>
        <NumberField
          label="Сколько осталось"
          value={value}
          onChange={setValue}
          min={0}
          max={999}
          start={30}
          size="compact"
          autoFocus
        />
      </div>
      <div className="row">
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
          Сохранить
        </button>
        <button type="button" className="btn btn--sm" onClick={onCancel} disabled={busy}>
          Отмена
        </button>
      </div>
    </form>
  )
}

const MEAL_SHORT: Record<NonNullable<Medicine['meal']>, string> = {
  before: 'до еды',
  after: 'после еды',
  any: '',
}

const MEALS: { key: Medicine['meal']; title: string }[] = [
  { key: undefined, title: 'Неважно' },
  { key: 'before', title: 'До еды' },
  { key: 'after', title: 'После еды' },
]

/** Готовые времена: почти все схемы приёма укладываются в эти четыре. */
const PRESETS = [
  { time: '08:00', title: 'Утром' },
  { time: '13:00', title: 'Днём' },
  { time: '19:00', title: 'Вечером' },
  { time: '22:00', title: 'На ночь' },
]

/**
 * Время приёма кнопками плюс поле для своего.
 *
 * Набирать время руками на телефоне пожилому человеку тяжело, а четыре готовых
 * значения покрывают почти все назначения. Своё время остаётся для остальных.
 */
function TimePicker({ times, onChange }: { times: string[]; onChange: (next: string[]) => void }) {
  const [custom, setCustom] = useState('')

  const toggle = (time: string) =>
    onChange(normalizeTimes(times.includes(time) ? times.filter((t) => t !== time) : [...times, time]))

  const addCustom = () => {
    if (parseTime(custom) === null) return
    onChange(normalizeTimes([...times, formatTime(parseTime(custom)!)]))
    setCustom('')
  }

  const extra = times.filter((t) => !PRESETS.some((p) => p.time === t))

  return (
    <>
      <div className="chips">
        {PRESETS.map(({ time, title }) => (
          <button key={time} type="button" className="chip" aria-pressed={times.includes(time)} onClick={() => toggle(time)}>
            {title} <span className="muted">{time}</span>
          </button>
        ))}
        {extra.map((time) => (
          <button key={time} type="button" className="chip" aria-pressed onClick={() => toggle(time)}>
            {time}
          </button>
        ))}
      </div>

      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <input
          type="time"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          aria-label="Своё время приёма"
          style={{ maxWidth: 150 }}
        />
        <button type="button" className="btn btn--sm" onClick={addCustom} disabled={parseTime(custom) === null}>
          Добавить время
        </button>
      </div>

      {times.length === 0 && (
        <p className="muted" style={{ margin: 'var(--space-2) 0 0' }}>
          Без расписания препарат просто лежит в аптечке: остаток считается по полю «В день», напоминаний нет.
        </p>
      )}
    </>
  )
}

/**
 * Форма препарата. Раскрывается на месте, как и правка измерения: модальное окно
 * на телефоне отбирает весь экран ради четырёх полей.
 */
function MedicineForm({
  medicine,
  onSave,
  onCancel,
}: {
  medicine?: Medicine
  onSave: (item: Medicine) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(medicine?.name ?? '')
  const [dose, setDose] = useState(medicine?.dose ?? '')
  const [left, setLeft] = useState(medicine?.left !== null && medicine?.left !== undefined ? String(medicine.left) : '')
  const [perDay, setPerDay] = useState(
    medicine?.perDay !== null && medicine?.perDay !== undefined ? String(medicine.perDay).replace('.', ',') : '',
  )
  const [month, setMonth] = useState(medicine?.expires ? expiryToMonth(medicine.expires) : '')
  const [note, setNote] = useState(medicine?.note ?? '')
  const [inn, setInn] = useState(medicine?.inn ?? '')
  const [form, setForm] = useState(medicine?.form ?? '')
  /** Варианты выпуска выбранного препарата: форма и её дозировки. */
  const [variants, setVariants] = useState<DrugVariant[]>([])
  const [times, setTimes] = useState<string[]>(normalizeTimes(medicine?.times ?? []))
  const [perTime, setPerTime] = useState(String(medicine?.perTime ?? 1))
  const [meal, setMeal] = useState<Medicine['meal']>(medicine?.meal)
  const [autoDeduct, setAutoDeduct] = useState(medicine?.autoDeduct ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const numberOrNull = (raw: string): number | null => {
    const value = Number(raw.replace(',', '.'))
    return raw.trim() === '' || !Number.isFinite(value) ? null : value
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (name.trim() === '') {
      setError('Без названия препарат не найти в списке.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave({
        id: medicine?.id ?? '',
        name: name.trim(),
        dose: dose.trim(),
        inn: inn.trim() || undefined,
        form: form.trim() || undefined,
        left: numberOrNull(left),
        perDay: numberOrNull(perDay),
        expires: month ? monthToExpiry(month) : null,
        note: note.trim() || undefined,
        autoDeduct: autoDeduct || undefined,
        times: times.length > 0 ? times : undefined,
        perTime: times.length > 0 ? Number(perTime) || 1 : undefined,
        meal: times.length > 0 ? meal : undefined,
        // Правка остатка руками — это подтверждение: расчётной поправке
        // отсчитывать заново не с чего.
        leftAt: Date.now(),
        taken: medicine?.taken,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 'var(--space-4)' }}>
      <DrugPicker
        value={name}
        onChange={(next) => {
          setName(next)
          // Правка названия руками отвязывает карточку от реестра: подставленные
          // вещество и форма могли относиться к другому препарату.
          setInn('')
          setForm('')
          setVariants([])
        }}
        onPick={(drug: Drug, picked: DrugVariant[]) => {
          setName(drug.n)
          setInn(drug.i ?? '')
          setVariants(picked)
          // Форма одна — выбирать не из чего, ставим молча. Заодно подставляем
          // единственную дозировку: спрашивать про выбор из одного незачем.
          const only = picked.length === 1 ? picked[0] : null
          setForm(only?.form ?? '')
          if (only?.doses.length === 1) setDose(only.doses[0])
        }}
      />

      {inn && inn.toLowerCase() !== name.trim().toLowerCase() && (
        <div className="muted" style={{ marginTop: 'calc(-1 * var(--space-2))' }}>
          Действующее вещество: <b>{inn}</b>
        </div>
      )}

      <VariantPicker
        variants={variants}
        form={form}
        dose={dose}
        onForm={(next) => {
          setForm(next)
          // Дозировка от прежней формы к новой не относится: «5 %» у геля и
          // «200 мг» у капсул — разные величины.
          setDose('')
        }}
        onDose={setDose}
      />

      <Field label="Дозировка, как на упаковке">
        <input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="50 мг" />
      </Field>

      {form && <div className="muted" style={{ marginTop: 'calc(-1 * var(--space-2))' }}>Форма: {form}</div>}

      <div className="grid grid--two">
        <NumberField label="Осталось" value={left} onChange={setLeft} placeholder="30" min={0} max={999} start={30} size="compact" />
        <NumberField
          label="В день"
          value={perDay}
          onChange={setPerDay}
          placeholder="1"
          min={0.5}
          max={12}
          start={1}
          step={0.5}
          decimals={1}
          size="compact"
        />
      </div>

      <div>
        <div className="tile__label" style={{ marginBottom: 'var(--space-2)' }}>
          Когда принимать
        </div>
        <TimePicker times={times} onChange={setTimes} />
        {times.length > 0 && (
          <div className="row" style={{ marginTop: 'var(--space-3)', alignItems: 'flex-end' }}>
            <div style={{ maxWidth: 150 }}>
              <NumberField
                label="Штук за приём"
                value={perTime}
                onChange={setPerTime}
                min={1}
                max={10}
                start={1}
                size="compact"
              />
            </div>
            <div className="segmented" role="group" aria-label="Отношение к еде">
              {MEALS.map(({ key, title }) => (
                <button
                  key={title}
                  type="button"
                  aria-pressed={meal === key || (key === undefined && !meal)}
                  onClick={() => setMeal(key)}
                >
                  {title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {(times.length > 0 || left.trim() !== '') && (
        <div>
          <label className="badge">
            <input type="checkbox" checked={autoDeduct} onChange={(e) => setAutoDeduct(e.target.checked)} />
            Списывать без подтверждения
          </label>
          <p className="muted" style={{ margin: 'var(--space-1) 0 0' }}>
            {autoDeduct
              ? 'Остаток уменьшается сам по расписанию. Отмечать приём не нужно — кнопка «Принял» пропадёт.'
              : 'Остаток уменьшается только по кнопке «Принял». Включите, если отмечать каждый приём не хочется.'}
          </p>
        </div>
      )}

      <Field label="Годен до — месяц с упаковки">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </Field>

      <Field label="Примечание">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="утром, после еды" />
      </Field>

      {error && (
        <div className="pill__alert pill__alert--critical" role="alert">
          {error}
        </div>
      )}

      <div className="row">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          Сохранить
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Отмена
        </button>
      </div>
    </form>
  )
}
