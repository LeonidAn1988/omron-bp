import { useEffect, useRef } from 'react'
import { FunnelIcon } from './icons'

/**
 * Фильтр одной кнопкой: воронка, выбранное значение, лист со списком.
 *
 * Раньше на месте фильтра стоял ряд кнопок — по кнопке на человека и по кнопке
 * на срок запаса. Ряд честно показывал все варианты сразу, но рос вместе с
 * семьёй: четыре имени с «Все» не помещаются в строку ни при каком размере
 * текста, а в аптечке таких рядов было два подряд, и на маленьком экране они
 * съедали место, ради которого человек сюда и пришёл.
 *
 * Кнопка занимает одну строку при любом числе вариантов. Выбранное значение
 * остаётся на экране прямым текстом — это условие, а не украшение: на
 * «Давлении» и «Приёме» та же кнопка отвечает на вопрос «кому я это сейчас
 * записываю», и спрятать ответ под безымянный значок значит однажды записать
 * чужое давление.
 *
 * Список — модальный лист снизу. Не выпадающее меню: выпадающее обрезается
 * прокручиваемым предком, и его строки приходится делать мелкими. Лист берёт
 * ширину экрана, строки в нём по 44 пикселя, и системный `<dialog>` сам даёт
 * Esc, возврат фокуса и затемнение позади.
 */
export function FilterButton({
  label,
  selected,
  options,
  onPick,
}: {
  /** Заголовок листа и подпись кнопки для чтения с экрана: «Чей дневник». */
  label: string
  /** Что выбрано — по ключу, а не по подписи: двух Саш в семье не запретишь. */
  selected: string
  /** `apart` отделяет вариант чертой: он не из того же ряда, что соседи. */
  options: { id: string; title: string; hint?: string; apart?: boolean }[]
  onPick: (id: string) => void
}) {
  const лист = useRef<HTMLDialogElement>(null)

  // Приложение ведёт свою историю экранов, и аппаратная «Назад» на телефоне
  // может снять экран из-под открытого листа. Тогда лист закрываем сами —
  // иначе он повиснет над разделом, к которому уже не относится.
  useEffect(() => {
    const el = лист.current
    if (!el) return
    const закрыть = () => el.close()
    window.addEventListener('popstate', закрыть)
    return () => window.removeEventListener('popstate', закрыть)
  }, [])

  const выбран = options.find((item) => item.id === selected) ?? options[0]
  const value = выбран?.title ?? ''

  return (
    <>
      {/* На кнопке — только выбранное. Подпись группы ушла в `aria-label` и в
          заголовок листа: «Что показывать: Все сроки» в одну строку на 360 px
          при крупном тексте не помещается, а значение помещается всегда. */}
      <button
        type="button"
        className="filterbtn"
        aria-haspopup="dialog"
        aria-label={`${label}: ${value}`}
        onClick={() => лист.current?.showModal()}
      >
        <FunnelIcon />
        <span className="filterbtn__value">{value}</span>
      </button>

      <dialog
        ref={лист}
        className="sheet"
        aria-label={label}
        // Клик мимо списка — по самому `<dialog>`, а не по его содержимому:
        // затемнение и есть элемент, лист внутри перехватывает своё.
        onClick={(event) => {
          if (event.target === лист.current) лист.current?.close()
        }}
      >
        <div className="sheet__body">
          <p className="sheet__title">{label}</p>
          <div className="sheet__list">
            {options.map((item) => (
              <button
                key={item.id}
                type="button"
                className="sheet__row"
                data-apart={item.apart ? '' : undefined}
                aria-pressed={item.id === выбран?.id}
                onClick={() => {
                  onPick(item.id)
                  лист.current?.close()
                }}
              >
                <span className="sheet__mark" aria-hidden="true">
                  {item.id === выбран?.id ? '✓' : ''}
                </span>
                <span className="sheet__name">
                  {item.title}
                  {item.hint && <span className="sheet__hint">{item.hint}</span>}
                </span>
              </button>
            ))}
          </div>
          <button type="button" className="btn sheet__close" onClick={() => лист.current?.close()}>
            Закрыть
          </button>
        </div>
      </dialog>
    </>
  )
}
