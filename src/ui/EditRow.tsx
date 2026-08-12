import { useState } from 'react'
import { GLUCOSE_CONTEXT_LABELS, type BpReading, type GlucoseContext, type GlucoseReading } from '../types'
import { NumberField } from './NumberField'
import { Banner } from './bits'

/**
 * Правка записи прямо в списке.
 *
 * Не модальное окно: в продуктовом интерфейсе модалка — ленивый первый ответ,
 * и на телефоне она отбирает весь экран ради двух чисел. Строка раскрывается на
 * месте, окружение остаётся видимым, отмена возвращает всё как было.
 */

const CONTEXTS: GlucoseContext[] = ['fasting', 'before-meal', 'after-meal', 'bedtime', 'night']

const SHORT_CONTEXT: Record<GlucoseContext, string> = {
  fasting: 'Натощак',
  'before-meal': 'До еды',
  'after-meal': 'После еды',
  bedtime: 'Перед сном',
  night: 'Ночью',
}

function toLocalInput(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Actions({ onCancel, busy }: { onCancel: () => void; busy: boolean }) {
  return (
    <div className="row editrow__actions">
      <button type="submit" className="btn btn--primary" disabled={busy}>
        Сохранить
      </button>
      <button type="button" className="btn" onClick={onCancel} disabled={busy}>
        Отмена
      </button>
    </div>
  )
}

export function BpEditor({
  reading,
  onSave,
  onCancel,
}: {
  reading: BpReading
  onSave: (next: BpReading) => Promise<void>
  onCancel: () => void
}) {
  const [sys, setSys] = useState(String(reading.sys))
  const [dia, setDia] = useState(String(reading.dia))
  const [bpm, setBpm] = useState(reading.bpm === null ? '' : String(reading.bpm))
  const [when, setWhen] = useState(() => toLocalInput(reading.ts))
  const [arm, setArm] = useState<'' | 'left' | 'right'>(reading.arm ?? '')
  const [note, setNote] = useState(reading.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const sysValue = Number(sys)
    const diaValue = Number(dia)
    if (!Number.isFinite(sysValue) || sysValue < 40 || sysValue > 300) return setError('Верхнее давление — от 40 до 300')
    if (!Number.isFinite(diaValue) || diaValue < 20 || diaValue > 250) return setError('Нижнее давление — от 20 до 250')
    if (diaValue >= sysValue) return setError('Нижнее должно быть меньше верхнего')
    const ts = new Date(when).getTime()
    if (!Number.isFinite(ts)) return setError('Не разобрал дату и время')

    const pulse = Number(bpm)
    setBusy(true)
    try {
      await onSave({
        ...reading,
        ts,
        sys: Math.round(sysValue),
        dia: Math.round(diaValue),
        bpm: Number.isFinite(pulse) && pulse > 0 ? Math.round(pulse) : null,
        arm: arm || undefined,
        note: note.trim() || undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="editrow" onSubmit={submit}>
      <div className="editrow__grid">
        <NumberField label="Верхнее" value={sys} onChange={setSys} min={40} max={300} start={120} size="compact" autoFocus />
        <NumberField label="Нижнее" value={dia} onChange={setDia} min={20} max={250} start={80} size="compact" />
        <NumberField label="Пульс" value={bpm} onChange={setBpm} min={20} max={250} start={70} size="compact" />
        <label className="field">
          <span>Дата и время</span>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="field">
          <span>Рука</span>
          <select value={arm} onChange={(e) => setArm(e.target.value as typeof arm)}>
            <option value="">не указана</option>
            <option value="left">левая</option>
            <option value="right">правая</option>
          </select>
        </label>
        <label className="field">
          <span>Примечание</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="необязательно" />
        </label>
      </div>

      {error && (
        <div style={{ marginTop: 'var(--space-3)' }} role="alert">
          <Banner tone="critical">{error}</Banner>
        </div>
      )}

      <Actions onCancel={onCancel} busy={busy} />
    </form>
  )
}

export function GlucoseEditor({
  reading,
  onSave,
  onCancel,
}: {
  reading: GlucoseReading
  onSave: (next: GlucoseReading) => Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState(String(reading.mmol).replace('.', ','))
  const [context, setContext] = useState<GlucoseContext>(reading.context)
  const [when, setWhen] = useState(() => toLocalInput(reading.ts))
  const [note, setNote] = useState(reading.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const mmol = Number(value.replace(',', '.'))
    if (!Number.isFinite(mmol) || mmol <= 0.5 || mmol > 50) return setError('Сахар — обычно от 2 до 25 ммоль/л')
    const ts = new Date(when).getTime()
    if (!Number.isFinite(ts)) return setError('Не разобрал дату и время')

    setBusy(true)
    try {
      await onSave({
        ...reading,
        ts,
        mmol: Math.round(mmol * 10) / 10,
        context,
        note: note.trim() || undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="editrow" onSubmit={submit}>
      <div className="editrow__grid">
        <NumberField
          label="Сахар"
          unit="ммоль/л"
          value={value}
          onChange={setValue}
          min={1}
          max={40}
          start={5.5}
          step={0.1}
          decimals={1}
          size="compact"
          autoFocus
        />
        <label className="field">
          <span>Дата и время</span>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="field">
          <span>Примечание</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="необязательно" />
        </label>
      </div>

      <fieldset className="chips" style={{ marginTop: 'var(--space-3)' }}>
        <legend>Момент замера — от него зависит норма</legend>
        {CONTEXTS.map((item) => (
          <button key={item} type="button" className="chip" aria-pressed={context === item} onClick={() => setContext(item)}>
            {SHORT_CONTEXT[item]}
          </button>
        ))}
      </fieldset>
      <div className="muted" style={{ marginTop: 'var(--space-2)' }}>
        {GLUCOSE_CONTEXT_LABELS[context]}
      </div>

      {error && (
        <div style={{ marginTop: 'var(--space-3)' }} role="alert">
          <Banner tone="critical">{error}</Banner>
        </div>
      )}

      <Actions onCancel={onCancel} busy={busy} />
    </form>
  )
}
