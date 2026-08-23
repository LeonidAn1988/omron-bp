/**
 * Из аптечки — в напоминания.
 *
 * Три решения, каждое из которых видно человеку.
 *
 * **Одно напоминание на время, а не на препарат.** В восемь утра человек
 * принимает четыре таблетки; четыре уведомления подряд он смахнёт не читая, а
 * пятое пропустит. Одно со списком читается за раз и совпадает с тем, как приём
 * происходит: подошёл к аптечке один раз.
 *
 * **Повтор до отметки, но с потолком.** Первое напоминание в назначенное время,
 * затем ещё три с интервалом. Дальше — молчание: бесконечный трезвон люди
 * отключают целиком, и тогда не работает ничего. Отмеченный приём повторов не
 * порождает вовсе.
 *
 * **Каждое напоминание привязано к конкретному дню и приёму.** Не «ежедневно в
 * 8:00», а «9 сентября, утренний приём, повтор второй». Иначе снять оставшиеся
 * повторы после отметки было бы нечем: у ежедневного повторяющегося
 * уведомления нет отдельного сегодняшнего экземпляра.
 *
 * Плата за это — горизонт: напоминания расставляются на две недели вперёд и
 * продлеваются при каждом запуске приложения. Приложение, которым пользуются
 * ради напоминаний, открывают чаще, но сказать об этом в интерфейсе честнее,
 * чем промолчать.
 */

import { dosesOn, normalizeTimes, parseTime, perTimeOf, startOfDay } from './medicines'
import type { Reminder } from '../platform/ports'
import type { Medicine } from '../types'

const МИНУТА = 60_000
const СУТКИ = 86_400_000

/** Сколько раз напомнить повторно, если отметки нет. */
export const REPEATS = 3
/** Через сколько минут повторять. */
export const REPEAT_INTERVAL_MIN = 15
/** На сколько дней вперёд расставляются напоминания. */
export const HORIZON_DAYS = 14

/**
 * Потолок на число напоминаний в системе.
 *
 * Android держит не больше пятисот ожидающих будильников на приложение и
 * лишние отбрасывает молча — причём неизвестно какие. При плотном расписании
 * потолок достижим: десять приёмов в день на четырнадцать дней с повторами это
 * пятьсот шестьдесят штук. Лучше сознательно укоротить горизонт, чем позволить
 * системе выбросить произвольную половину.
 */
export const MAX_REMINDERS = 450

const MEAL: Record<string, string> = {
  before: 'до еды',
  after: 'после еды',
}

/** Как назвать время суток, чтобы уведомление читалось без часов на экране. */
function partOfDay(minutes: number): string {
  if (minutes < 5 * 60) return 'Ночной приём'
  if (minutes < 12 * 60) return 'Утренний приём'
  if (minutes < 17 * 60) return 'Дневной приём'
  if (minutes < 22 * 60) return 'Вечерний приём'
  return 'Приём на ночь'
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
 * Короткая строка для свёрнутого уведомления.
 *
 * В свёрнутом виде Android показывает одну строку и обрезает остальное
 * многоточием: при двух препаратах человек видел первый и «…». Здесь названия
 * без дозировок — они умещаются, и сразу понятно, сколько всего ждёт.
 * Подробности с дозировками остаются в развёрнутом виде.
 */
export function shortBody(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} и ${names[1]}`
  return `${names[0]}, ${names[1]} и ещё ${names.length - 2}`
}

export const formatSlot = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/**
 * Идентификатор уведомления: система адресует их числами, и число обязано
 * однозначно восстанавливаться из «день + приём + номер повтора». Иначе снять
 * повторы после отметки нечем.
 *
 * Разрядность выбрана с запасом и укладывается в 32 бита: 2048 суток (пять с
 * половиной лет) × 128 приёмов × 8 повторов.
 */
export function reminderId(day: number, slotIndex: number, step: number): number {
  const сутки = Math.round(startOfDay(day) / СУТКИ) % 2048
  return сутки * 1024 + (slotIndex % 128) * 8 + (step % 8)
}

export interface ReminderOptions {
  /** Повторять, пока приём не отмечен. */
  repeat: boolean
  /** Насколько дней вперёд расставлять. */
  horizonDays?: number
}

/**
 * Собрать набор напоминаний.
 *
 * Препараты без расписания не попадают сюда вовсе: они принимаются по
 * потребности, и напоминать о них не о чем. Уже отмеченные приёмы пропускаются,
 * прошедшие моменты — тоже: система показала бы их немедленно, все скопом.
 */
export function buildReminders(
  medicines: Medicine[],
  now: number,
  options: ReminderOptions = { repeat: true },
): Reminder[] {
  const horizon = options.horizonDays ?? HORIZON_DAYS

  // Общий список времён приёма: по нему считается номер приёма, а он входит в
  // идентификатор. Список обязан зависеть только от расписания, иначе
  // идентификаторы поедут при любой правке аптечки.
  const времена = [
    ...new Set(
      medicines.flatMap((medicine) =>
        normalizeTimes(medicine.times ?? []).filter((time) => parseTime(time) !== null),
      ),
    ),
  ].sort()
  if (!времена.length) return []

  const набор: Reminder[] = []

  for (let сдвиг = 0; сдвиг < horizon; сдвиг++) {
    const день = startOfDay(now + сдвиг * СУТКИ)

    времена.forEach((time, slotIndex) => {
      const минуты = parseTime(time)!
      const момент = день + минуты * МИНУТА

      // Что из назначенного на этот приём ещё не отмечено. Отмеченное в списке
      // не показываем: человек уже принял, напоминать об этом — путать.
      const ждут = medicines.filter((medicine) => {
        if (!normalizeTimes(medicine.times ?? []).includes(time)) return false
        const slot = dosesOn(medicine, день, now).find((item) => item.time === time)
        return !slot || slot.takenAt === null
      })
      if (!ждут.length) return

      const поПорядку = [...ждут].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      const подробно = поПорядку.map(doseLine).join('\n')
      const коротко = shortBody(поПорядку.map((m) => m.name))
      const шагов = options.repeat ? REPEATS + 1 : 1

      for (let step = 0; step < шагов; step++) {
        const at = момент + step * REPEAT_INTERVAL_MIN * МИНУТА
        // Прошедшее не ставим: система вывалила бы всё разом при первом же
        // запуске приложения.
        if (at <= now) continue
        набор.push({
          id: reminderId(день, slotIndex, step),
          // Повтор говорит по-человечески, а не служебным «не отмечен»: слово
          // «отметить» — из устройства приложения, а человеку нужно про
          // таблетки.
          title: step === 0 ? `${partOfDay(минуты)} — ${time}` : `Не забудьте: приём в ${time}`,
          body: коротко,
          details: подробно,
          at,
          slot: time,
          day: день,
          step,
        })
      }
    })
  }

  // Ближайшие важнее дальних: сортируем по времени и обрезаем хвост.
  набор.sort((a, b) => a.at - b.at)
  return набор.length > MAX_REMINDERS ? набор.slice(0, MAX_REMINDERS) : набор
}

/** Ближайшие времена приёма — интерфейсу, чтобы показать, что именно расставлено. */
export function reminderTimes(medicines: Medicine[]): string[] {
  return [
    ...new Set(
      medicines.flatMap((medicine) =>
        normalizeTimes(medicine.times ?? []).filter((time) => parseTime(time) !== null),
      ),
    ),
  ].sort()
}
