/**
 * Держит системные напоминания в согласии с аптечкой и слушает нажатия по ним.
 *
 * Живёт рядом с данными, а не на экране настроек: расписание правится в
 * аптечке, отметки о приёме ставятся на экране приёма, а настройки в это время
 * закрыты. Если бы пересборкой занимался раздел настроек, отмеченный приём
 * продолжал бы напоминать о себе до следующего захода в настройки.
 *
 * Набор переписывается целиком при каждом изменении. Это и есть механизм
 * «повторять, пока не отмечено»: сборщик просто не ставит напоминаний на уже
 * отмеченный приём, поэтому отметка снимает оставшиеся повторы сама.
 */

import { useEffect, useRef, useState } from 'react'
import { buildReminders } from '../logic/reminders'
import { platform } from '../platform/ports'
import type { Medicine } from '../types'

export interface RemindersInput {
  medicines: Medicine[]
  enabled: boolean
  sound: string
  /** Повторять, пока приём не отмечен. */
  repeat: boolean
  /** Данные загружены: до этого пустая аптечка ничего не значит. */
  ready: boolean
  /** Человек нажал на уведомление — ждёт экран, где ставится отметка. */
  onOpen: (day: number) => void
  /** Человек нажал «Принял» прямо в уведомлении. */
  onTaken: (day: number, slot: string) => void
}

export function useReminders({ medicines, enabled, sound, repeat, ready, onOpen, onTaken }: RemindersInput) {
  // Слепок последнего применённого состояния: React вызывает эффект и когда
  // ничего по сути не изменилось (новая ссылка на тот же список), а каждая
  // пересборка — это поход в системный планировщик.
  const applied = useRef<string | null>(null)

  /**
   * Горизонт напоминаний конечен, и время его подъедает. Пересобираем при
   * каждом возвращении к приложению — этого достаточно, потому что запас
   * измеряется неделями, а приложение открывают ради самих напоминаний.
   */
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const проснулись = () => {
      if (document.visibilityState === 'visible') setTick((n) => n + 1)
    }
    document.addEventListener('visibilitychange', проснулись)
    return () => document.removeEventListener('visibilitychange', проснулись)
  }, [])

  // Обработчики держим в ссылке: подписка на уведомления должна пережить
  // перерисовку, а не пересоздаваться на каждый новый замыкающий колбэк.
  const handlers = useRef({ onOpen, onTaken })
  handlers.current = { onOpen, onTaken }

  useEffect(() => {
    const reminders = platform().reminders
    if (!reminders.isSupported()) return
    return reminders.onAction((action) => {
      if (action.kind === 'taken') handlers.current.onTaken(action.day, action.slot)
      else handlers.current.onOpen(action.day)
    })
  }, [])

  useEffect(() => {
    // До загрузки аптечки список пуст не потому, что препаратов нет, а потому
    // что их ещё не прочитали. Пересборка в этот момент сняла бы все
    // напоминания — и вернула бы их только через мгновение, а при неудачном
    // стечении обстоятельств не вернула бы вовсе.
    if (!ready) return

    const reminders = platform().reminders
    if (!reminders.isSupported()) return

    const wanted = enabled ? buildReminders(medicines, Date.now(), { repeat }) : []
    // Из слепка исключены сами моменты показа: они сдвигаются с каждым
    // пересчётом, и сравнение по ним всегда давало бы «изменилось».
    const снимок = JSON.stringify([
      enabled,
      sound,
      repeat,
      // Смещение часового пояса — часть слепка. Иначе после перелёта или
      // перевода часов набор считался бы неизменным: состав препаратов тот же,
      // а моменты показа съехали на час и больше.
      new Date().getTimezoneOffset(),
      // Подробный текст обязан входить в слепок: смена дозировки не меняет ни
      // идентификатор, ни короткую строку с названиями, и без этого в
      // уведомлении осталась бы старая цифра.
      wanted.map((item) => [item.id, item.title, item.body, item.details]),
    ])
    if (applied.current === снимок) return

    let живо = true
    void (async () => {
      try {
        if (!wanted.length) {
          await reminders.cancelAll()
        } else {
          if ((await reminders.permission()) !== 'granted') return
          await reminders.schedule(wanted, sound)
        }
        if (живо) applied.current = снимок
      } catch {
        // Планировщик мог отказать — например, разрешение отозвали в настройках
        // телефона, пока приложение работало. Слепок не запоминаем, чтобы
        // следующая попытка была настоящей, а не пропущенной по совпадению.
      }
    })()

    return () => {
      живо = false
    }
  }, [medicines, enabled, sound, repeat, ready, tick])
}
