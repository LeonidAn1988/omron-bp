import { useId, useRef } from 'react'

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
  /**
   * Человек уже правит это число сам — больше не вмешиваемся.
   *
   * До первой набранной цифры поле показывает прежнее значение или
   * подсказанное приложением, и открывают его, чтобы назвать другое число, а
   * не дописать к этому: курсор в конце давал «028» вместо 28 и «3060» вместо
   * 60 — обе жалобы про одно. Поэтому до первого ввода касание выделяет всё.
   * После — не трогаем: человек ставит курсор туда, куда хотел.
   */
  const тронуто = useRef(false)

  /**
   * Выделить целиком — отложенно.
   *
   * По касанию браузер ставит курсор уже после `focus` и схлопывает выделение,
   * сделанное до этого; автофокус так не делает. Через таймер покрываются оба
   * случая. Своё выделение человека не трогаем.
   */
  const выделить = (поле: HTMLInputElement) => {
    if (тронуто.current) return
    setTimeout(() => {
      if (document.activeElement === поле && поле.selectionStart === поле.selectionEnd) поле.select()
    }, 0)
  }

  /**
   * Подвинуть поле в видимую часть, когда его закрыла клавиатура.
   *
   * Проверено на Mate 60 Pro: карточка препарата, открытая из «Заканчивается»,
   * сразу ставит курсор в остаток — клавиатура выезжает и накрывает и само
   * поле, и нижнюю панель. Человек печатает вслепую. Сам браузер сюда не
   * вмешивается: к моменту фокуса поле ещё было видно, а после клавиатуры он
   * уже ничего не пересчитывает.
   *
   * Дважды: сразу и через треть секунды. Клавиатура выезжает не мгновенно, и
   * первый вызов считает высоту, которой через мгновение не будет.
   */
  const показать = (поле: HTMLInputElement) => {
    const подвинуть = () => {
      if (document.activeElement !== поле) return
      const r = поле.getBoundingClientRect()
      // Снизу мешает не только клавиатура. Панель вкладок закреплена поверх
      // содержимого, и поле, формально попавшее в окно, всё равно оказывалось
      // под ней: по высоте окна выходило «видно», а на экране — нет.
      const окно = window.visualViewport?.height ?? window.innerHeight
      const панель = document.querySelector('.tabs')?.getBoundingClientRect().top
      const низ = панель !== undefined && панель > 0 && панель < окно ? панель : окно
      if (r.top < 0 || r.bottom > низ) поле.scrollIntoView({ block: 'center' })
    }
    setTimeout(подвинуть, 0)
    setTimeout(подвинуть, 350)
  }

  const parsed = Number(value.replace(',', '.'))
  const known = Number.isFinite(parsed) && value.trim() !== ''

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
          onChange={(e) => {
            тронуто.current = true
            onChange(вычистить(e.target.value))
          }}
          onFocus={(e) => {
            выделить(e.currentTarget)
            показать(e.currentTarget)
          }}
          onClick={(e) => {
            выделить(e.currentTarget)
            // И по касанию тоже: WebView поднимает клавиатуру не на автофокусе,
            // а на первом касании, и накрывает поле уже после него.
            показать(e.currentTarget)
          }}
          onBlur={() => (тронуто.current = false)}
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
