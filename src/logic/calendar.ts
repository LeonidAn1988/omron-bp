import type { Medicine } from '../types'
import { normalizeTimes, parseTime, perTimeOf } from './medicines'

/**
 * Расписание приёма для системного календаря телефона.
 *
 * Планировщика уведомлений в вебе нет: Notification Triggers свёрнут, Web Push
 * требует сервера, а фоновая синхронизация время не гарантирует. Единственный
 * способ достучаться до заблокированного экрана из статического приложения —
 * отдать расписание календарю, у которого будильники есть штатно. Поэтому в
 * интерфейсе так и написано: напомнит календарь телефона, а не дневник.
 *
 * Формат iCalendar (RFC 5545). Файл собирается вручную, без библиотек: нужных
 * возможностей здесь три — повтор, будильник и складывание длинных строк.
 */

/**
 * Время без часового пояса — так и задумано.
 *
 * «Плавающее» время календарь понимает как местное. Для приёма лекарств это
 * единственно верно: при переезде или в поездке таблетку принимают в восемь
 * утра по местному времени, а не в пересчёте от Москвы.
 */
function stampLocal(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

/** Отметка о создании файла обязана быть в UTC — это про сам файл, не про событие. */
function stampUtc(ts: number): string {
  return new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** В тексте iCalendar запятая, точка с запятой и обратная косая — служебные. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Складывание длинных строк.
 *
 * Считать надо байты, а не символы: кириллица в UTF-8 занимает два байта, и по
 * символам строка «влезает», а по спецификации уже нет. Календари при этом
 * ведут себя по-разному, вплоть до отказа открыть файл.
 */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line

  const parts: string[] = []
  let chunk = ''
  let size = 0
  let limit = 75

  for (const char of line) {
    const width = new TextEncoder().encode(char).length
    if (size + width > limit) {
      parts.push(chunk)
      chunk = char
      size = width
      // Продолжение строки начинается с пробела, и он тоже занимает место.
      limit = 74
    } else {
      chunk += char
      size += width
    }
  }
  parts.push(chunk)
  return parts.join('\r\n ')
}

const MEAL_LABEL: Record<NonNullable<Medicine['meal']>, string> = {
  before: 'до еды',
  after: 'после еды',
  any: '',
}

/** Подпись события: что именно принять. */
export function doseTitle(medicine: Medicine): string {
  const count = perTimeOf(medicine)
  return [medicine.name, medicine.dose].filter(Boolean).join(' ') + (count > 1 ? ` — ${count} шт.` : '')
}

function doseDetails(medicine: Medicine): string {
  return [
    medicine.inn && medicine.inn.toLowerCase() !== medicine.name.toLowerCase() ? medicine.inn : '',
    medicine.meal ? MEAL_LABEL[medicine.meal] : '',
    medicine.note ?? '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Начало ряда: сегодня, если время ещё не прошло, иначе завтра. */
function firstOccurrence(time: string, now: number): number {
  const minutes = parseTime(time)!
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const today = start.getTime() + minutes * 60_000
  return today > now ? today : today + 24 * 60 * 60 * 1000
}

export interface CalendarOptions {
  /** За сколько минут до приёма звонить будильнику. Ноль — ровно в срок. */
  alarmBefore?: number
}

/**
 * Собирает файл расписания. Одно событие на каждое время приёма каждого
 * препарата, повтор ежедневный, будильник внутри события.
 */
export function buildCalendar(items: Medicine[], now: number, options: CalendarOptions = {}): string {
  const alarm = options.alarmBefore ?? 0
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Дневник здоровья//Аптечка//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  for (const medicine of items) {
    const times = normalizeTimes(medicine.times ?? [])
    for (const time of times) {
      const start = firstOccurrence(time, now)
      const details = doseDetails(medicine)
      lines.push(
        'BEGIN:VEVENT',
        // Идентификатор устойчивый: повторная выгрузка обновит событие, а не
        // заведёт второе рядом. Домен латиницей: спецификация ждёт здесь адрес
        // почтового вида, и на кириллице часть календарей спотыкается.
        `UID:${medicine.id}-${time.replace(':', '')}@omron-bp.local`,
        `DTSTAMP:${stampUtc(now)}`,
        `DTSTART:${stampLocal(start)}`,
        'DURATION:PT15M',
        'RRULE:FREQ=DAILY',
        `SUMMARY:${escapeText(doseTitle(medicine))}`,
      )
      if (details) lines.push(`DESCRIPTION:${escapeText(details)}`)
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `TRIGGER:-PT${alarm}M`,
        `DESCRIPTION:${escapeText(doseTitle(medicine))}`,
        'END:VALARM',
        'END:VEVENT',
      )
    }
  }

  lines.push('END:VCALENDAR')
  // Перевод строки в iCalendar — именно CRLF, часть календарей иначе не читает.
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/** Сколько событий уедет в календарь — показываем до выгрузки, чтобы не было сюрприза. */
export function countCalendarEvents(items: Medicine[]): number {
  return items.reduce((sum, m) => sum + normalizeTimes(m.times ?? []).length, 0)
}
