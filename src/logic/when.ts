/**
 * Дата и время для полей ввода и подписей — одно место вместо трёх копий.
 *
 * Жили в Entry, Glucose и EditRow порознь, с разными сигнатурами и одинаковым
 * телом. Расхождение случилось бы при первой же правке одной из копий.
 */

const TIME_FMT = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })
const DATE_FMT = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })

/** Значение для `input[type=datetime-local]` — он работает в местном времени без зоны. */
export function toLocalInput(value: Date | number): string {
  const d = value instanceof Date ? value : new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** «сегодня, 10:30» или «3 сентября, 10:30» — подпись кнопки выбора времени. */
export function describeWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'выбрать время'
  const sameDay = date.toDateString() === new Date().toDateString()
  return `${sameDay ? 'сегодня' : DATE_FMT.format(date)}, ${TIME_FMT.format(date)}`
}
