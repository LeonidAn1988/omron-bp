import { useState } from 'react'
import type { IntakeTimes, Medicine } from '../types'
import { expiryToMonth, formatTime, monthToExpiry, normalizeTimes, parseTime } from '../logic/medicines'
import { formGroup as formGroupOf, FORM_GROUPS, type Drug, type DrugVariant } from '../logic/drugs'
import { NumberField } from './NumberField'
import { Field } from './bits'
import { DrugPicker, VariantPicker } from './DrugPicker'
import { substanceLabel } from './Medicines'

/**
 * Заведение и правка препарата.
 *
 * Вынесено из общего файла аптечки: форма живёт своей жизнью и по объёму равна
 * целому экрану, а рядом с ней в одном файле лежали список, приёмы и покупки.
 */

const MEALS: { key: Medicine['meal']; title: string }[] = [
  { key: undefined, title: 'Неважно' },
  { key: 'before', title: 'До еды' },
  { key: 'after', title: 'После еды' },
]

/**
 * Готовые времена: почти все схемы приёма укладываются в эти четыре.
 *
 * Часы приходят из настроек, а не зашиты сюда: у кого-то утро в шесть, а вечер
 * в семнадцать, и таким людям приходилось вводить время руками для каждого
 * препарата.
 */
type Presets = { time: string; title: string }[]

function presetsOf(times: IntakeTimes): Presets {
  return [
    { time: times.morning, title: 'Утром' },
    { time: times.day, title: 'Днём' },
    { time: times.evening, title: 'Вечером' },
    { time: times.night, title: 'На ночь' },
  ]
}

/**
 * Время приёма кнопками плюс поле для своего.
 *
 * Набирать время руками на телефоне пожилому человеку тяжело, а четыре готовых
 * значения покрывают почти все назначения. Своё время остаётся для остальных.
 */
function TimePicker({
  times,
  presets,
  onChange,
}: {
  times: string[]
  presets: Presets
  onChange: (next: string[]) => void
}) {
  const [custom, setCustom] = useState('')

  const toggle = (time: string) =>
    onChange(normalizeTimes(times.includes(time) ? times.filter((t) => t !== time) : [...times, time]))

  const addCustom = () => {
    if (parseTime(custom) === null) return
    onChange(normalizeTimes([...times, formatTime(parseTime(custom)!)]))
    setCustom('')
  }

  const extra = times.filter((t) => !presets.some((p) => p.time === t))

  return (
    <>
      <div className="chips">
        {presets.map(({ time, title }) => (
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
export function MedicineForm({
  medicine,
  intakeTimes,
  onSave,
  onCancel,
}: {
  medicine?: Medicine
  /** Часы стандартных приёмов из настроек. */
  intakeTimes: IntakeTimes
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
  const [maker, setMaker] = useState(medicine?.maker ?? '')
  /** БАД или гомеопатия — из справочника. Обычное лекарство пометки не несёт. */
  const [kind, setKind] = useState<Medicine['kind']>(medicine?.kind)
  const [packSize, setPackSize] = useState(medicine?.packSize ? String(medicine.packSize) : '')
  const [packs, setPacks] = useState<number[]>([])
  /** Группа формы сужает поиск: человек держит коробку и знает, таблетки это или мазь. */
  const [group, setGroup] = useState('')
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
        maker: maker.trim() || undefined,
        kind,
        packSize: Number(packSize) > 0 ? Number(packSize) : undefined,
        left: numberOrNull(left),
        perDay: numberOrNull(perDay),
        expires: month ? monthToExpiry(month) : null,
        note: note.trim() || undefined,
        autoDeduct: autoDeduct || undefined,
        times: times.length > 0 ? times : undefined,
        perTime: times.length > 0 ? Number(perTime) || 1 : undefined,
        meal: times.length > 0 ? meal : undefined,
        /*
         * Дата подтверждения остатка сбрасывается только когда остаток и
         * правда правили.
         *
         * Раньше она ставилась при любом сохранении: поправил название — и
         * расчётный расход обнулился, а показанный остаток подскочил вверх.
         * Это тот же дефект, что чинился в отметке приёма, только с другой
         * стороны.
         */
        leftAt: numberOrNull(left) === (medicine?.left ?? null) ? medicine?.leftAt : Date.now(),
        taken: medicine?.taken,
        /*
         * День заведения переносится, а не теряется.
         *
         * Форма собирает препарат заново из полей, и всё, что она не назвала
         * явно, при сохранении пропадает. `since` не назывался — и правка
         * названия стирала дату заведения. Следом возвращались пропуски за то
         * время, когда препарата ещё не было: ровно то, что чинилось
         * отдельно.
         */
        since: medicine?.since,
      })
    } catch (caught) {
      // Без этого отказ уходил в никуда: форма оставалась открытой со всеми
      // полями, ошибка не показывалась, и человек либо жал ещё раз, либо
      // уходил в уверенности, что препарат заведён. Хранилище отказывает
      // редко, но именно поэтому такой отказ и нельзя оставлять беззвучным.
      setError(
        'Не удалось сохранить: телефон отказал в записи. Проверьте, есть ли свободное место, и повторите. ' +
          (caught instanceof Error ? caught.message : ''),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 'var(--space-4)' }}>
      {/* Группа формы спрашивается до поиска: в реестре 2289 написаний формы,
          и без сужения «капли» найдутся вперемешку с ампулами и таблетками. */}
      <div>
        <div className="tile__label" style={{ marginBottom: 'var(--space-2)' }}>
          Что это
        </div>
        <div className="chips" role="group" aria-label="Форма выпуска">
          {FORM_GROUPS.map((item) => (
            <button
              key={item.key}
              type="button"
              className="chip"
              aria-pressed={group === item.key}
              onClick={() => setGroup(group === item.key ? '' : item.key)}
            >
              {item.title}
            </button>
          ))}
        </div>
      </div>

      <DrugPicker
        group={group}
        value={name}
        onChange={(next) => {
          setName(next)
          // Правка названия руками отвязывает карточку от реестра: подставленные
          // вещество и форма могли относиться к другому препарату.
          setInn('')
          setForm('')
          setMaker('')
          setKind(undefined)
          setVariants([])
          setPacks([])
        }}
        onPick={(drug: Drug, picked: DrugVariant[], drugMakers: string[]) => {
          setName(drug.n)
          setInn(drug.i ?? '')
          setVariants(picked)
          setMaker(drugMakers[0] ?? '')
          setKind(drug.k)
          // Форма одна — выбирать не из чего, ставим молча. Заодно подставляем
          // единственную дозировку: спрашивать про выбор из одного незачем.
          // При выбранной группе подставляем форму из неё: человек уже сказал,
          // что ищет мазь, спрашивать его о том же второй раз незачем.
          const inGroup = group ? picked.filter((v) => formGroupOf(v.form) === group) : picked
          const only = inGroup.length === 1 ? inGroup[0] : picked.length === 1 ? picked[0] : null
          setForm(only?.form ?? '')
          setPacks(only?.packs ?? [])
          if (only?.doses.length === 1) setDose(only.doses[0])
        }}
      />

      {inn && inn.toLowerCase() !== name.trim().toLowerCase() && (
        <div className="muted" style={{ marginTop: 'calc(-1 * var(--space-2))' }}>
          {substanceLabel(kind)}: <b>{inn}</b>
        </div>
      )}

      <VariantPicker
        variants={variants}
        form={form}
        dose={dose}
        onForm={(next) => {
          setForm(next)
          // Дозировка от прежней формы к новой не относится: «5 %» у геля и
          // «200 мг» у капсул — разные величины. Упаковки тоже свои.
          setDose('')
          setPacks(variants.find((v) => v.form === next)?.packs ?? [])
        }}
        onDose={setDose}
      />

      <Field label="Дозировка, как на упаковке">
        <input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="50 мг" />
      </Field>

      {form && <div className="muted" style={{ marginTop: 'calc(-1 * var(--space-2))' }}>Форма: {form}</div>}

      <div>
        <div className="tile__label" style={{ marginBottom: 'var(--space-2)' }}>
          Сколько в упаковке
        </div>
        {packs.length > 0 && (
          <div className="chips" role="group" aria-label="Размеры упаковки из реестра">
            {packs.map((size) => (
              <button
                key={size}
                type="button"
                className="chip"
                aria-pressed={Number(packSize) === size}
                onClick={() => setPackSize(String(size))}
              >
                {size} шт.
              </button>
            ))}
          </div>
        )}
        <div style={{ maxWidth: 170, marginTop: packs.length > 0 ? 'var(--space-3)' : 0 }}>
          <NumberField
            label="Штук в пачке"
            value={packSize}
            onChange={setPackSize}
            min={1}
            max={500}
            start={30}
            size="compact"
          />
        </div>
        <p className="muted" style={{ margin: 'var(--space-2) 0 0' }}>
          Нужно кнопке «Купил упаковку» и списку покупок: в аптеке спрашивают пачками, а не таблетками.
        </p>
      </div>

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
        <TimePicker times={times} presets={presetsOf(intakeTimes)} onChange={setTimes} />
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
