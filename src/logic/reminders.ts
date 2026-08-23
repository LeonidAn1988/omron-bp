/**
 * Из аптечки — в напоминания.
 *
 * Главное решение здесь: **одно напоминание на время, а не на препарат**. В
 * восемь утра человек принимает четыре таблетки; четыре отдельных уведомления
 * подряд он смахнёт не читая, а пятое пропустит. Одно уведомление со списком
 * читается за раз и соответствует тому, как приём происходит на самом деле —
 * подошёл к аптечке один раз.
 *
 * Идентификатор напоминания выводится из времени, а не из препарата, и это
 * следствие того же решения: система адресует уведомления числами, набор
 * переписывается целиком, а времён приёма у человека единицы.
 */

import type { Reminder } from '../platform/ports'
import type { Medicine } from '../types'

/** «08:00» → 480. Возвращает null, если время записано не так. */
export function minutesOfDay(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

const perTimeOf = (medicine: Medicine) =>
  medicine.perTime && medicine.perTime > 0 ? medicine.perTime : 1

/** Как назвать время суток, чтобы уведомление читалось без часов на экране. */
function partOfDay(minutes: number): string {
  if (minutes < 5 * 60) return 'Ночной приём'
  if (minutes < 12 * 60) return 'Утренний приём'
  if (minutes < 17 * 60) return 'Дневной приём'
  if (minutes < 22 * 60) return 'Вечерний приём'
  return 'Приём на ночь'
}

const MEAL: Record<string, string> = {
  before: 'до еды',
  after: 'после еды',
}

/** Строка одного препарата внутри уведомления: «Лозартан 50 мг — 2 шт., после еды». */
export function doseLine(medicine: Medicine): string {
  const count = perTimeOf(medicine)
  const голова = [medicine.name, medicine.dose].filter(Boolean).join(' ')
  const хвост = [count > 1 ? `${count} шт.` : '', medicine.meal ? MEAL[medicine.meal] ?? '' : '']
    .filter(Boolean)
    .join(', ')
  return хвост ? `${голова} — ${хвост}` : голова
}

/**
 * Собрать набор напоминаний из аптечки.
 *
 * Препараты без расписания (`times` пусто) не попадают сюда вовсе: они
 * принимаются по потребности, и напоминать о них не о чем.
 */
export function buildReminders(medicines: Medicine[]): Reminder[] {
  const поВремени = new Map<number, Medicine[]>()

  for (const medicine of medicines) {
    for (const time of medicine.times ?? []) {
      const minutes = minutesOfDay(time)
      if (minutes === null) continue
      const список = поВремени.get(minutes)
      if (список) {
        // Один и тот же препарат мог попасть в одно время дважды — правкой
        // расписания руками. Дублировать его в тексте незачем.
        if (!список.some((item) => item.id === medicine.id)) список.push(medicine)
      } else {
        поВремени.set(minutes, [medicine])
      }
    }
  }

  return [...поВремени.entries()]
    .sort(([a], [b]) => a - b)
    .map(([minutes, список]) => {
      const hour = Math.floor(minutes / 60)
      const minute = minutes % 60
      const строки = [...список]
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map(doseLine)
      return {
        // Время — само по себе устойчивый ключ: 08:00 → 800. Не зависит ни от
        // порядка препаратов, ни от их идентификаторов, поэтому правка аптечки
        // не плодит осиротевшие напоминания.
        id: hour * 100 + minute,
        title: `${partOfDay(minutes)} — ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        body: строки.join('\n'),
        hour,
        minute,
      }
    })
}

/** Сколько напоминаний получится — интерфейсу, чтобы обещать ровно столько. */
export const countReminders = (medicines: Medicine[]): number => buildReminders(medicines).length
