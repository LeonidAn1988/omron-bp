/**
 * Держит системные напоминания в согласии с аптечкой.
 *
 * Живёт рядом с данными, а не на экране настроек: расписание меняется в
 * аптечке, а настройки в это время закрыты. Если бы пересборкой занимался
 * раздел настроек, добавленный вечером препарат начал бы напоминать о себе
 * только после следующего захода в настройки — то есть никогда.
 *
 * Набор переписывается целиком при каждом изменении. Это дешевле и честнее,
 * чем вести разницу: снятое напоминание об отменённом препарате — не мелочь,
 * а ложная тревога у пожилого человека.
 */

import { useEffect, useRef } from 'react'
import { buildReminders } from '../logic/reminders'
import { platform } from '../platform/ports'
import type { Medicine } from '../types'

export function useReminders(medicines: Medicine[], enabled: boolean, sound: string, ready: boolean) {
  // Слепок последнего применённого состояния: React вызывает эффект и когда
  // ничего по сути не изменилось (новая ссылка на тот же список), а каждая
  // пересборка — это поход в системный планировщик.
  const applied = useRef<string | null>(null)

  useEffect(() => {
    // До загрузки аптечки список пуст не потому, что препаратов нет, а потому
    // что их ещё не прочитали. Пересборка в этот момент сняла бы все
    // напоминания — и вернула бы их только через мгновение, а при неудачном
    // стечении обстоятельств не вернула бы вовсе.
    if (!ready) return

    const reminders = platform().reminders
    if (!reminders.isSupported()) return

    const wanted = enabled ? buildReminders(medicines) : []
    const снимок = JSON.stringify([enabled, sound, wanted])
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
  }, [medicines, enabled, sound, ready])
}
