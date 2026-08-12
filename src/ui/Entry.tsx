import { useRef, useState } from 'react'
import type { BpReading } from '../types'
import { alertFor, classify } from '../logic/classify'
import { Banner, Field, Reveal } from './bits'
import { ValueField, useCoarsePointer } from './ValueField'

/** Значение для input[type=datetime-local] — он работает в локальном времени без зоны. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const TIME_FMT = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })
const DATE_FMT = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })

function describeWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'выбрать время'
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return `${sameDay ? 'сегодня' : DATE_FMT.format(date)}, ${TIME_FMT.format(date)}`
}

export function Entry({ user, onAdd }: { user: number; onAdd: (reading: BpReading) => Promise<void> }) {
  const [sys, setSys] = useState('')
  const [dia, setDia] = useState('')
  const [bpm, setBpm] = useState('')
  const [when, setWhen] = useState(() => toLocalInput(new Date()))
  const [editingWhen, setEditingWhen] = useState(false)
  const [arm, setArm] = useState<'' | 'left' | 'right'>('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const coarse = useCoarsePointer()
  const sysRef = useRef<HTMLInputElement>(null)
  const diaRef = useRef<HTMLInputElement>(null)

  const sysValue = Number(sys)
  const diaValue = Number(dia)

  // Пока значения не выглядят завершёнными, ничего не оцениваем: иначе на середине
  // набора «120» человеку с гипертонией показывают «Пониженное давление».
  const complete = sysValue >= 40 && sysValue <= 300 && diaValue >= 20 && diaValue <= 250
  const preview = complete ? classify(sysValue, diaValue) : null
  const warning = complete ? alertFor(sysValue, diaValue) : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaved(false)

    if (!Number.isFinite(sysValue) || sysValue < 40 || sysValue > 300) {
      sysRef.current?.focus()
      return setError(coarse ? 'Выберите верхнее давление — прокрутите колесо или коснитесь значения' : 'Верхнее давление должно быть от 40 до 300')
    }
    if (!Number.isFinite(diaValue) || diaValue < 20 || diaValue > 250) {
      diaRef.current?.focus()
      return setError(coarse ? 'Выберите нижнее давление — прокрутите колесо или коснитесь значения' : 'Нижнее давление должно быть от 20 до 250')
    }
    if (diaValue >= sysValue) {
      diaRef.current?.focus()
      return setError('Нижнее должно быть меньше верхнего — возможно, поля перепутаны местами')
    }
    const ts = new Date(when).getTime()
    if (!Number.isFinite(ts)) return setError('Не разобрал дату и время')

    const pulse = Number(bpm)
    await onAdd({
      kind: 'bp',
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
    setArm('')
    setWhen(toLocalInput(new Date()))
    setEditingWhen(false)
    sysRef.current?.focus()
    window.setTimeout(() => setSaved(false), 4000)
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="card__head">
        <h2>Записать измерение</h2>
        {preview && (
          <span className="badge badge--solid" style={{ ['--dot' as string]: preview.color }}>
            <span className="badge__dot" />
            {preview.label}
          </span>
        )}
      </div>

      {/* Барабаны узкие — три в ряд, как в системном выборе времени.
          Поля с клавиатуры шире из-за кнопок шага, им нужен больший минимум. */}
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${coarse ? '92px' : '150px'}, 1fr))` }}
      >
        <ValueField label="Верхнее" value={sys} onChange={setSys} placeholder="120" min={40} max={300} start={120}
          ariaSuffix="мм рт. ст." inputRef={sysRef} required />
        <ValueField label="Нижнее" value={dia} onChange={setDia} placeholder="80" min={20} max={250} start={80}
          ariaSuffix="мм рт. ст." inputRef={diaRef} required />
        <ValueField label="Пульс" value={bpm} onChange={setBpm} placeholder="70" min={20} max={250} start={70}
          ariaSuffix="ударов в минуту" />
      </div>

      <div className="field" style={{ marginTop: 'var(--space-3)' }}>
        <span>Когда</span>
        {editingWhen ? (
          <input type="datetime-local" value={when} autoFocus onChange={(e) => setWhen(e.target.value)} />
        ) : (
          <button type="button" className="btn" onClick={() => setEditingWhen(true)}>
            {describeWhen(when)}
          </button>
        )}
      </div>

      <details style={{ marginTop: 'var(--space-3)' }}>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-1)', color: 'var(--text-secondary)' }}>
          Рука и примечание
        </summary>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginTop: 'var(--space-3)' }}>
          <Field label="Рука">
            <select value={arm} onChange={(e) => setArm(e.target.value as typeof arm)}>
              <option value="">не указана</option>
              <option value="left">левая</option>
              <option value="right">правая</option>
            </select>
          </Field>
          <Field label="Примечание">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="например: после лекарства" />
          </Field>
        </div>
      </details>

      {/* Ошибка ввода — над кнопкой: она мешает отправке, её нужно прочитать первой. */}
      <Reveal open={error !== null}>
        <div style={{ paddingTop: 'var(--space-3)' }} role="alert">
          {error && <Banner tone="critical">{error}</Banner>}
        </div>
      </Reveal>

      <div className="row form-actions" style={{ marginTop: 'var(--space-4)' }}>
        <button className="btn btn--primary" type="submit">
          Добавить
        </button>
        <span className="muted" role="status" aria-live="polite">
          {saved ? 'Сохранено' : ''}
        </span>
      </div>

      {/* Медицинское предупреждение — под кнопкой: оно не должно сдвигать её вниз
          в тот момент, когда человек уже дописывает вторую цифру. */}
      <Reveal open={warning !== null}>
        <div style={{ paddingTop: 'var(--space-3)' }} role="status">
          {warning && (
            <Banner tone={warning.kind === 'crisis' ? 'critical' : warning.kind === 'severe' ? 'warning' : 'info'}>
              {warning.text}
            </Banner>
          )}
        </div>
      </Reveal>
    </form>
  )
}
