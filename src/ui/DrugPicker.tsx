import { useEffect, useId, useRef, useState } from 'react'
import {
  describeDrug,
  filterByForm,
  makersOf,
  mergeBooks,
  searchHits,
  variantsOf,
  KIND_LABEL,
  type Drug,
  type DrugBook,
  type DrugVariant,
} from '../logic/drugs'

/**
 * Поле названия препарата с подсказкой из реестра.
 *
 * Справочник весит больше самого приложения, поэтому подгружается лениво —
 * только когда человек открыл форму препарата, и один раз за сеанс. Дальше его
 * держит кэш служебного работника, и офлайн он тоже доступен.
 *
 * Ручной ввод остаётся равноправным: в реестре 11 тысяч наименований, но в
 * домашней аптечке лежат и старые препараты, и привезённые из-за границы.
 * Подсказка помогает, а не запрещает.
 */

let cached: DrugBook | null = null
let loading: Promise<void> | null = null
/** Кому сообщить, когда доедет вторая половина справочника. */
const waiting = new Set<(book: DrugBook | null) => void>()

const fetchBook = (name: string): Promise<DrugBook | null> =>
  fetch(new URL(name, document.baseURI))
    .then((r) => (r.ok ? (r.json() as Promise<DrugBook>) : null))
    .catch(() => null)

/**
 * Справочник в два приёма: сначала лекарства, следом БАДы.
 *
 * Файлов два, потому что реестра два — лекарства ведёт Минздрав, добавки
 * санитарная служба, — а поиск обязан быть один, и человеку про ведомства
 * знать незачем.
 *
 * Ждать оба разом нельзя: вместе они под восемьсот килобайт, и на медленной
 * сети подсказка молчала бы всё это время. Поэтому лекарства показываются, как
 * только приехали, а добавки подмешиваются к ним следом. Если добавки не
 * доехали вовсе, поиск работает по лекарствам: половина справочника лучше
 * пустого поля.
 */
function loadBook(notify: (book: DrugBook | null) => void): () => void {
  // Подписываемся всегда, даже когда что-то уже есть: между приездом лекарств
  // и приездом добавок форму могли открыть заново, и без подписки такое поле
  // так и осталось бы без БАДов до перезагрузки страницы.
  waiting.add(notify)
  if (cached) notify(cached)

  const announce = () => waiting.forEach((listener) => listener(cached))
  if (!loading) {
    loading = fetchBook('drugs.json')
      .then((drugs) => {
        cached = drugs
        announce()
        return fetchBook('supplements.json')
      })
      .then((supplements) => {
        cached = cached ? mergeBooks(cached, supplements) : supplements
        announce()
      })
      .catch(() => {})
  }
  return () => {
    waiting.delete(notify)
  }
}

const FIELD_LABEL = { name: '', inn: 'по веществу', maker: 'по производителю' } as const

export function DrugPicker({
  value,
  group,
  onChange,
  onPick,
}: {
  value: string
  /** Группа формы: сужает поиск до таблеток, капель, мазей и так далее. */
  group?: string
  onChange: (next: string) => void
  /**
   * Выбор из справочника. Варианты отдаём уже с названиями форм: словарь форм
   * живёт здесь, и форме препарата про его устройство знать незачем.
   */
  onPick: (drug: Drug, variants: DrugVariant[], makers: string[]) => void
}) {
  const [book, setBook] = useState<DrugBook | null>(cached)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [touched, setTouched] = useState(false)
  const listId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Отписка возвращена самим loadBook: без неё пришедшие следом добавки
  // дёргали бы состояние уже размонтированного поля.
  useEffect(() => loadBook(setBook), [])

  // Клик мимо закрывает подсказку. Без этого на телефоне она перекрывает
  // соседние поля и остаётся висеть.
  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const pool = book ? filterByForm(book.items, book.forms, group ?? '') : []
  const hits = book && touched ? searchHits(pool, value, book.makers ?? []) : []
  const found = hits.map((hit) => hit.drug)
  const visible = open && found.length > 0

  /**
   * Высота списка считается по месту, а не задаётся в стилях.
   *
   * Нижняя навигация прилипшая, и фиксированные 300px залезали под неё —
   * последняя подсказка оказывалась недосягаемой. Свободное место меряем до
   * верха навигации; если его совсем мало, сначала подтягиваем поле вверх.
   */
  useEffect(() => {
    if (!visible) return
    let timer: ReturnType<typeof setTimeout>

    /**
     * Нижняя граница списка. Навигация прилипшая только на телефоне; на широком
     * экране она уезжает вверх, и отсчёт от неё схлопывал список до минимума —
     * на десктопе помещалось полтора пункта при полном экране свободного места.
     */
    const floorOf = (bottom: number) => {
      const nav = document.querySelector('nav.tabs')
      const navTop = nav?.getBoundingClientRect().top ?? Infinity
      return navTop > bottom ? Math.min(navTop, window.innerHeight) : window.innerHeight
    }

    const fit = () => {
      const box = boxRef.current?.getBoundingClientRect()
      const list = listRef.current
      if (!box || !list) return
      list.style.maxHeight = `${Math.max(140, Math.round(floorOf(box.bottom) - box.bottom - 12))}px`
    }

    const box = boxRef.current?.getBoundingClientRect()
    const floor = box ? floorOf(box.bottom) : window.innerHeight
    if (box && floor - box.bottom < 220) {
      boxRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      // Пересчитываем после прокрутки: до неё свободное место другое.
      timer = setTimeout(fit, 420)
    } else {
      fit()
    }

    return () => clearTimeout(timer)
  }, [visible, found.length])

  const choose = (drug: Drug) => {
    onPick(drug, variantsOf(drug, book?.forms ?? []), makersOf(drug, book?.makers ?? []))
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!visible) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((prev) => (prev + step + found.length) % found.length)
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault()
      choose(found[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div className="suggest" ref={boxRef}>
      <label className="field">
        <span>Название</span>
        <input
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            setTouched(true)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Лозартан"
          autoFocus
          autoComplete="off"
          // Автозамена молча правит название препарата, и человек этого не
          // замечает — частая жалоба в отзывах на приложения этого класса.
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        />
      </label>

      {visible && (
        <ul className="suggest__list" id={listId} ref={listRef} role="listbox" aria-label="Препараты из реестра">
          {hits.map(({ drug, field }, i) => (
            <li key={drug.n} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                className="suggest__item"
                data-active={i === active ? 'true' : undefined}
                // mousedown, а не click: клик приходит после blur, и список
                // успевает закрыться раньше, чем выбор доедет.
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(drug)
                }}
                onTouchStart={() => choose(drug)}
              >
                <span className="suggest__name">
                  {drug.n}
                  {/* Вид стоит у самого названия, а не в подписи: человек
                      выбирает строку по названию и мимо подписи проскакивает. */}
                  {drug.k && <span className="suggest__kind">{KIND_LABEL[drug.k]}</span>}
                </span>
                {describeDrug(drug, book?.forms ?? [], group ?? '') && (
                  <span className="suggest__meta">
                    {describeDrug(drug, book?.forms ?? [], group ?? '')}
                    {/* Говорим, по какому полю нашлось: иначе непонятно, почему
                        по запросу «ибупрофен» выпал «Нурофен». */}
                    {field !== 'name' && <span className="suggest__why"> · найдено {FIELD_LABEL[field]}</span>}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {book && touched && value.trim().length >= 2 && found.length === 0 && (
        <div className="muted" style={{ marginTop: 'var(--space-1)' }}>
          В реестре не нашлось — впишите название с упаковки, так тоже правильно.
        </div>
      )}
    </div>
  )
}

/**
 * Форма выпуска и дозировка кнопками.
 *
 * Набирать «12,5 мг» руками на телефоне мучительно, а угадывать, в каких формах
 * бывает препарат, — тем более. Форма спрашивается первой, потому что дозировки
 * у форм разные: у геля «5 %», у капсул «200 мг», и общий список был бы смесью,
 * из которой можно выбрать несуществующую пару.
 *
 * Когда форма одна, выбирать не из чего — её ставят молча, и человек видит
 * сразу дозировки.
 */
export function VariantPicker({
  variants,
  form,
  dose,
  onForm,
  onDose,
}: {
  variants: DrugVariant[]
  form: string
  dose: string
  onForm: (form: string) => void
  onDose: (dose: string) => void
}) {
  if (variants.length === 0) return null

  const chosen = variants.find((v) => v.form === form)
  const doses = chosen?.doses ?? (variants.length === 1 ? variants[0].doses : [])

  return (
    <>
      {variants.length > 1 && (
        <div>
          <div className="tile__label" style={{ marginBottom: 'var(--space-2)' }}>
            Форма выпуска
          </div>
          <div className="chips" role="group" aria-label="Формы выпуска из реестра">
            {variants.map((variant) => (
              <button
                key={variant.form}
                type="button"
                className="chip"
                aria-pressed={variant.form === form}
                onClick={() => onForm(variant.form)}
              >
                {variant.form}
              </button>
            ))}
          </div>
        </div>
      )}

      {doses.length > 0 && (
        <div className="chips" role="group" aria-label="Дозировки из реестра">
          {doses.map((item) => (
            <button
              key={item}
              type="button"
              className="chip"
              aria-pressed={dose.trim() === item}
              onClick={() => onDose(item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
