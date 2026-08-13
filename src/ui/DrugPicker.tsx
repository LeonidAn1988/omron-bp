import { useEffect, useId, useRef, useState } from 'react'
import { describeDrug, searchDrugs, type Drug, type DrugBook } from '../logic/drugs'

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
let loading: Promise<DrugBook | null> | null = null

async function loadBook(): Promise<DrugBook | null> {
  if (cached) return cached
  if (!loading) {
    loading = fetch(new URL('drugs.json', document.baseURI))
      .then((r) => (r.ok ? (r.json() as Promise<DrugBook>) : null))
      .then((book) => {
        cached = book
        return book
      })
      .catch(() => null)
  }
  return loading
}

export function DrugPicker({
  value,
  onChange,
  onPick,
}: {
  value: string
  onChange: (next: string) => void
  /** Выбор из справочника: кроме названия отдаём международное наименование, форму и дозировки. */
  onPick: (drug: Drug) => void
}) {
  const [book, setBook] = useState<DrugBook | null>(cached)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [touched, setTouched] = useState(false)
  const listId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    let alive = true
    void loadBook().then((loaded) => {
      if (alive) setBook(loaded)
    })
    return () => {
      alive = false
    }
  }, [])

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

  const found = book && touched ? searchDrugs(book.items, value) : []
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

    const fit = () => {
      const box = boxRef.current?.getBoundingClientRect()
      const list = listRef.current
      if (!box || !list) return
      const nav = document.querySelector('nav.tabs')
      const floor = nav ? nav.getBoundingClientRect().top : window.innerHeight
      list.style.maxHeight = `${Math.max(140, Math.round(floor - box.bottom - 12))}px`
    }

    const box = boxRef.current?.getBoundingClientRect()
    const nav = document.querySelector('nav.tabs')
    const floor = nav ? nav.getBoundingClientRect().top : window.innerHeight
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
    onPick(drug)
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
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        />
      </label>

      {visible && (
        <ul className="suggest__list" id={listId} ref={listRef} role="listbox" aria-label="Препараты из реестра">
          {found.map((drug, i) => (
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
                <span className="suggest__name">{drug.n}</span>
                {describeDrug(drug) && <span className="suggest__meta">{describeDrug(drug)}</span>}
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

/** Дозировки препарата кнопками: набирать «12,5 мг» руками на телефоне мучительно. */
export function DoseChips({ doses, value, onPick }: { doses: string[]; value: string; onPick: (dose: string) => void }) {
  if (doses.length === 0) return null
  return (
    <div className="chips" role="group" aria-label="Дозировки из реестра">
      {doses.map((dose) => (
        <button
          key={dose}
          type="button"
          className="chip"
          aria-pressed={value.trim() === dose}
          onClick={() => onPick(dose)}
        >
          {dose}
        </button>
      ))}
    </div>
  )
}
