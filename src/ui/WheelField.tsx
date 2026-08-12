import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Барабан выбора значения — как в системном выборе времени.
 *
 * Для давления это удобнее клавиатуры: значения лежат в известном диапазоне,
 * прокрутка начинается от текущего значения, а не с нуля, и набирать ничего не
 * нужно. Клавиатура на телефоне при этом ещё и закрывает пол-экрана.
 *
 * Управляется тремя способами: прокруткой, колесом мыши и стрелками с
 * клавиатуры. Для скринридера это spinbutton с текущим значением.
 */

const ITEM = 40
const VISIBLE = 5
const HEIGHT = ITEM * VISIBLE

export function WheelField({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  start,
  step = 1,
  decimals = 0,
  ariaSuffix,
}: {
  label: string
  unit?: string
  /** Пустая строка означает «ещё не выбрано»: барабан встаёт на значение по умолчанию. */
  value: string
  onChange: React.Dispatch<React.SetStateAction<string>>
  min: number
  max: number
  /** Где стоит колесо, пока значение не выбрано. От min отсчитывать нельзя:
   *  для давления это 40, и до 120 пришлось бы крутить восемьдесят делений. */
  start: number
  step?: number
  decimals?: number
  /** Что дочитывать скринридеру после числа, например «мм рт. ст.». */
  ariaSuffix?: string
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Пока идёт наша собственная прокрутка, события scroll игнорируются. */
  const scrolling = useRef(false)
  const [focused, setFocused] = useState(false)

  const count = Math.round((max - min) / step) + 1
  const format = useCallback(
    (n: number) => (decimals > 0 ? n.toFixed(decimals).replace('.', ',') : String(Math.round(n))),
    [decimals],
  )
  const parse = (raw: string) => Number(raw.replace(',', '.'))
  const valueAt = useCallback((index: number) => min + index * step, [min, step])

  const current = parse(value)
  const chosen = Number.isFinite(current) && value !== ''
  const defaultIndex = Math.min(count - 1, Math.max(0, Math.round((start - min) / step)))
  const index = chosen ? Math.round((current - min) / step) : defaultIndex
  const safeIndex = Math.min(count - 1, Math.max(0, index))

  /**
   * Что мы сами отдали наружу последним. Без этого эффект позиционирования
   * возвращал колесо назад на каждое наше же изменение — прокрутка пружинила.
   */
  const emitted = useRef<string | null>(null)

  const scrollTo = useCallback((target: number, smooth: boolean) => {
    const node = listRef.current
    if (!node) return
    scrolling.current = true
    node.scrollTo({
      top: target * ITEM,
      behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto',
    })
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      scrolling.current = false
    }, 260)
  }, [])

  // Ставим барабан на текущее значение при появлении и когда его меняют снаружи.
  useLayoutEffect(() => {
    const node = listRef.current
    if (!node || scrolling.current) return
    // Значение пришло от нашей же прокрутки — трогать позицию нельзя.
    if (value === emitted.current) return
    const shown = Math.round(node.scrollTop / ITEM)
    if (shown !== safeIndex) scrollTo(safeIndex, false)
  }, [value, safeIndex, scrollTo])

  useEffect(() => () => clearTimeout(settleTimer.current), [])

  const onScroll = () => {
    if (scrolling.current) return
    clearTimeout(settleTimer.current)
    // Значение фиксируем после остановки: иначе оно дёргается на каждом кадре.
    settleTimer.current = setTimeout(() => {
      const node = listRef.current
      if (!node) return
      const landed = Math.min(count - 1, Math.max(0, Math.round(node.scrollTop / ITEM)))
      const next = format(valueAt(landed))
      emitted.current = next
      onChange((prev) => (prev === next ? prev : next))
    }, 120)
  }

  const nudge = (delta: number) => {
    const target = Math.min(count - 1, Math.max(0, safeIndex + delta))
    const next = format(valueAt(target))
    emitted.current = next
    onChange(next)
    scrollTo(target, true)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowUp: -1,
      ArrowDown: 1,
      PageUp: -10,
      PageDown: 10,
      Home: -count,
      End: count,
    }
    const delta = moves[event.key]
    if (delta === undefined) return
    event.preventDefault()
    nudge(delta)
  }

  /** Тап по значению подтверждает его. Нужен для случая, когда подсказка уже
   *  верна: без этого пришлось бы «покрутить туда-обратно», чтобы её принять. */
  const pick = (i: number) => {
    const next = format(valueAt(i))
    emitted.current = next
    onChange(next)
    if (i !== safeIndex) scrollTo(i, true)
  }

  const items = Array.from({ length: count }, (_, i) => valueAt(i))

  return (
    <div className="wheel">
      <div className="wheel__label">
        {label}
        {unit && <span className="wheel__unit">{unit}</span>}
      </div>
      <div className={focused ? 'wheel__box wheel__box--focused' : 'wheel__box'}>
        {/* Полоса выделения лежит под списком и не перехватывает касания. */}
        <div className="wheel__marker" aria-hidden="true" />
        <div
          ref={listRef}
          className="wheel__list"
          role="spinbutton"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={Number.isFinite(current) && value !== '' ? current : undefined}
          aria-valuetext={
            value === '' ? 'не выбрано' : `${format(current)}${ariaSuffix ? ` ${ariaSuffix}` : ''}`
          }
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ height: HEIGHT }}
        >
          <div className="wheel__pad" style={{ height: (HEIGHT - ITEM) / 2 }} />
          {items.map((item, i) => (
            <div
              key={item}
              className="wheel__item"
              style={{ height: ITEM }}
              aria-hidden="true"
              onClick={() => pick(i)}
              data-selected={i === safeIndex ? 'true' : undefined}
              data-pending={i === safeIndex && !chosen ? 'true' : undefined}
            >
              {format(item)}
            </div>
          ))}
          <div className="wheel__pad" style={{ height: (HEIGHT - ITEM) / 2 }} />
        </div>
      </div>
    </div>
  )
}
