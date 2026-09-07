import { useId } from 'react'

/**
 * Поле для числа с шагом.
 *
 * Клавиатура быстрее при первом вводе, кнопки — при исправлении: «ошибся на
 * единицу» решается одним касанием вместо выделения и перенабора. Поэтому здесь
 * есть и то и другое, а не что-то одно.
 *
 * Десятичный разделитель принимается любой: на русской раскладке набирают запятую.
 */
/**
 * Убрать ведущие нули: «028» — это 28, а не «ноль двадцать восемь».
 *
 * Режем только перед цифрой, иначе пропадёт «0» в «0,5» и сам одиночный ноль,
 * который человек, может быть, как раз и вводит.
 */
function вычистить(raw: string): string {
  return raw.replace(/^(\s*)0+(?=\d)/, '$1')
}

export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
  start,
  step = 1,
  decimals = 0,
  unit,
  size = 'large',
  inputRef,
  required,
  autoFocus,
}: {
  label: string
  value: string
  /**
   * Сигнатура как у setState — это не косметика. Шаг обязан считаться от
   * последнего значения, а не от того, что пришло в пропе: при быстрых
   * повторных нажатиях React не успевает перерисовать, и пять касаний «+»
   * давали +1 вместо +5.
   */
  onChange: React.Dispatch<React.SetStateAction<string>>
  placeholder?: string
  min: number
  max: number
  /** С чего начинать шаг на пустом поле. Середина диапазона тут не годится:
   *  для давления это дало бы 170 — тревожную цифру на ровном месте. */
  start: number
  step?: number
  decimals?: number
  unit?: string
  size?: 'large' | 'compact'
  inputRef?: React.Ref<HTMLInputElement>
  required?: boolean
  autoFocus?: boolean
}) {
  const id = useId()
  const parsed = Number(value.replace(',', '.'))
  const known = Number.isFinite(parsed) && value.trim() !== ''
  /** Ноль — «пусто», а не число: дописывать к нему нечего. */
  const пустышка = value.trim() === '0' || value.trim() === '0,0' || value.trim() === '0.0'

  const nudge = (direction: 1 | -1) => {
    onChange((prev) => {
      const previous = Number(prev.replace(',', '.'))
      // С пустого поля первое касание ставит типичное значение, а не шагает от него.
      if (!Number.isFinite(previous) || prev.trim() === '') {
        return decimals > 0 ? start.toFixed(decimals).replace('.', ',') : String(start)
      }
      const next = Math.min(max, Math.max(min, previous + direction * step))
      return decimals > 0 ? next.toFixed(decimals).replace('.', ',') : String(Math.round(next))
    })
  }

  return (
    <div className={`numfield numfield--${size}`}>
      <label className="numfield__label" htmlFor={id}>
        {label}
        {unit && <span className="numfield__unit">{unit}</span>}
      </label>
      <div className="numfield__control">
        <button
          type="button"
          className="numfield__step"
          onClick={() => nudge(-1)}
          disabled={known && parsed <= min}
          aria-label={`${label}: уменьшить`}
        >
          −
        </button>
        <input
          id={id}
          ref={inputRef}
          className="numfield__input"
          inputMode={decimals > 0 ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(вычистить(e.target.value))}
          onFocus={(e) => {
            // Поле остатка почти всегда открывают на нуле: коробка кончилась, и
            // человек вводит новое число. Курсор вставал в конец, «28» давало
            // «028». Ноль выделяем — первая же цифра его затирает. У обычного
            // числа выделять нельзя: там как раз правят одну цифру.
            if (пустышка) e.currentTarget.select()
          }}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          aria-describedby={unit ? `${id}-unit` : undefined}
        />
        <button
          type="button"
          className="numfield__step"
          onClick={() => nudge(1)}
          disabled={known && parsed >= max}
          aria-label={`${label}: увеличить`}
        >
          +
        </button>
      </div>
    </div>
  )
}
