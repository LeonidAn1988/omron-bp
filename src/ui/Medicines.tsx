import { useState } from 'react'
import type { Medicine } from '../types'
import {
  daysToExpiry,
  expiryToMonth,
  medicineAlert,
  monthToExpiry,
  sortMedicines,
  supplyDays,
  type MedicineAlert,
} from '../logic/medicines'
import { plural } from '../logic/plural'
import { NumberField } from './NumberField'
import { Banner, Field } from './bits'
import { DoseChips, DrugPicker } from './DrugPicker'
import type { Drug } from '../logic/drugs'
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

  return (
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
        </div>
      )}
    </div>
  )
}

function MedicineRow({
  medicine,
  now,
  onEdit,
  onDelete,
}: {
  medicine: Medicine
  now: number
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const alert = medicineAlert(medicine, now)
  const supply = supplyDays(medicine)
  const expiry = daysToExpiry(medicine, now)

  // Факты в строку: то, что уже сказано предупреждением, здесь не повторяется.
  const facts = [
    medicine.left !== null && `осталось ${medicine.left}`,
    medicine.perDay !== null && `по ${medicine.perDay} в день`,
    supply !== null && alert?.kind !== 'low' && `хватит на ${days(supply)}`,
    medicine.expires !== null && alert?.kind !== 'expired' && alert?.kind !== 'expiring' && expiry !== null
      ? `годен до конца ${monthYear(medicine.expires)}`
      : false,
  ].filter(Boolean) as string[]

  return (
    <li className="pill">
      <div className="pill__body">
        <div className="pill__title">
          <span className="pill__name">{medicine.name}</span>
          {medicine.dose && <span className="pill__dose">{medicine.dose}</span>}
        </div>
        {/* Действующее вещество под торговым названием: врач называет препарат
            им, а на упаковке напечатано название конкретной фирмы. */}
        {medicine.inn && medicine.inn.toLowerCase() !== medicine.name.toLowerCase() && (
          <div className="pill__inn">{medicine.inn}</div>
        )}
        {facts.length > 0 && <div className="pill__facts">{facts.join(' · ')}</div>}
        {alert && <div className={`pill__alert pill__alert--${ALERT_TONE[alert.kind]}`}>{alertText(alert, medicine)}</div>}
        {medicine.note && <div className="pill__note">{medicine.note}</div>}
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
    </li>
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
  /** Дозировки выбранного из реестра препарата — показываем кнопками. */
  const [doses, setDoses] = useState<string[]>([])
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
        left: numberOrNull(left),
        perDay: numberOrNull(perDay),
        expires: month ? monthToExpiry(month) : null,
        note: note.trim() || undefined,
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
          // Правка названия руками отвязывает карточку от реестра: подставленное
          // международное наименование могло относиться к другому препарату.
          setInn('')
          setDoses([])
        }}
        onPick={(drug: Drug) => {
          setName(drug.n)
          setInn(drug.i ?? '')
          setDoses(drug.d ?? [])
          if (drug.d?.length === 1) setDose(drug.d[0])
        }}
      />

      {inn && inn.toLowerCase() !== name.trim().toLowerCase() && (
        <div className="muted" style={{ marginTop: 'calc(-1 * var(--space-2))' }}>
          Действующее вещество: <b>{inn}</b>
        </div>
      )}

      <Field label="Дозировка, как на упаковке">
        <input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="50 мг" />
      </Field>
      <DoseChips doses={doses} value={dose} onPick={setDose} />

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
