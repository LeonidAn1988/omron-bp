import { useState } from 'react'
import type { Reading } from '../types'
import { alertFor, classify } from '../logic/classify'
import { Banner, Field } from './bits'

/** Значение для input[type=datetime-local] — он работает в локальном времени без зоны. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function Entry({ user, onAdd }: { user: number; onAdd: (reading: Reading) => Promise<void> }) {
  const [sys, setSys] = useState('')
  const [dia, setDia] = useState('')
  const [bpm, setBpm] = useState('')
  const [when, setWhen] = useState(() => toLocalInput(new Date()))
  const [arm, setArm] = useState<'' | 'left' | 'right'>('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const sysValue = Number(sys)
  const diaValue = Number(dia)
  const preview = sysValue > 0 && diaValue > 0 ? classify(sysValue, diaValue) : null
  const warning = preview ? alertFor(sysValue, diaValue) : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaved(false)

    if (!Number.isFinite(sysValue) || sysValue < 40 || sysValue > 300) {
      return setError('Систолическое давление должно быть в диапазоне 40–300')
    }
    if (!Number.isFinite(diaValue) || diaValue < 20 || diaValue > 250) {
      return setError('Диастолическое давление должно быть в диапазоне 20–250')
    }
    if (diaValue >= sysValue) {
      return setError('Нижнее давление должно быть меньше верхнего — проверьте, не перепутаны ли поля')
    }
    const ts = new Date(when).getTime()
    if (!Number.isFinite(ts)) return setError('Не разобрал дату и время')

    const pulse = Number(bpm)
    await onAdd({
      id: `m-${crypto.randomUUID()}`,
      ts,
      sys: Math.round(sysValue),
      dia: Math.round(diaValue),
      bpm: Number.isFinite(pulse) && pulse > 0 ? Math.round(pulse) : null,
      ihb: false,
      mov: false,
      user,
      source: 'manual',
      arm: arm || undefined,
      note: note.trim() || undefined,
    })

    setError(null)
    setSaved(true)
    setSys('')
    setDia('')
    setBpm('')
    setNote('')
    setWhen(toLocalInput(new Date()))
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="card__head">
        <h2>Записать измерение вручную</h2>
        {preview && (
          <span className="badge badge--solid" style={{ ['--dot' as string]: preview.color }}>
            <span className="badge__dot" />
            {preview.label}
          </span>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
        <Field label="Верхнее (САД)">
          <input inputMode="numeric" value={sys} onChange={(e) => setSys(e.target.value)} placeholder="120" required />
        </Field>
        <Field label="Нижнее (ДАД)">
          <input inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="80" required />
        </Field>
        <Field label="Пульс">
          <input inputMode="numeric" value={bpm} onChange={(e) => setBpm(e.target.value)} placeholder="70" />
        </Field>
        <Field label="Дата и время">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required />
        </Field>
        <Field label="Рука">
          <select value={arm} onChange={(e) => setArm(e.target.value as typeof arm)}>
            <option value="">не указана</option>
            <option value="left">левая</option>
            <option value="right">правая</option>
          </select>
        </Field>
      </div>

      <div style={{ marginTop: 12 }}>
        <Field label="Примечание">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="например: после приёма лекарства" />
        </Field>
      </div>

      {warning && (
        <div style={{ marginTop: 12 }}>
          <Banner tone={warning.kind === 'crisis' ? 'critical' : warning.kind === 'severe' ? 'warning' : 'info'}>
            {warning.text}
          </Banner>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12 }}>
          <Banner tone="critical">{error}</Banner>
        </div>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn btn--primary" type="submit">
          Добавить
        </button>
        {saved && <span className="muted">Сохранено</span>}
      </div>
    </form>
  )
}
