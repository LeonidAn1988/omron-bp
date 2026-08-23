/**
 * Раздел настроек: напоминания о приёме лекарств.
 *
 * Экран для пожилого человека, и от этого здесь всё. Одно решение на строку,
 * состояние названо словами, а не значком. Мелодию можно послушать до выбора —
 * иначе выбирать приходится по названию, а «Перелив» на слух не угадаешь.
 *
 * Отдельно проговорено энергосбережение. Huawei, Xiaomi и Samsung усыпляют
 * фоновые приложения, и напоминание просто не приходит — молча. Это самая
 * частая причина «уведомления не работают» на Android, и человек имеет право
 * узнать о ней от приложения, а не от форума.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { HORIZON_DAYS, REPEAT_INTERVAL_MIN, REPEATS, reminderTimes } from '../logic/reminders'
import { platform } from '../platform/ports'
import type { ReminderPermission } from '../platform/ports'
import type { Medicine } from '../types'
import { Banner, Reveal } from './bits'

export function Reminders({
  medicines,
  enabled,
  sound,
  repeat,
  onPatch,
}: {
  medicines: Medicine[]
  enabled: boolean
  sound: string
  repeat: boolean
  onPatch: (patch: { remindersOn?: boolean; reminderSound?: string; remindersRepeat?: boolean }) => void
}) {
  const port = platform().reminders
  const supported = port.isSupported()
  const sounds = port.sounds()

  const [permission, setPermission] = useState<ReminderPermission>('prompt')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)

  const времена = reminderTimes(medicines)

  const обновить = useCallback(async () => {
    if (!supported) return
    setPermission(await port.permission())
  }, [port, supported])

  useEffect(() => {
    void обновить()
  }, [обновить])

  // Разрешение могли выдать в настройках телефона, не закрывая приложение.
  // Без этой проверки раздел продолжал бы требовать разрешения, которое есть.
  useEffect(() => {
    if (!supported) return
    const слушать = () => {
      if (document.visibilityState === 'visible') void обновить()
    }
    document.addEventListener('visibilitychange', слушать)
    return () => document.removeEventListener('visibilitychange', слушать)
  }, [supported, обновить])

  useEffect(
    () => () => {
      audio.current?.pause()
    },
    [],
  )

  function послушать(id: string) {
    audio.current?.pause()
    if (id === 'system') return
    const звук = new Audio(`sounds/${id}.wav`)
    audio.current = звук
    setPlaying(id)
    звук.addEventListener('ended', () => setPlaying(null))
    звук.play().catch(() => setPlaying(null))
  }

  async function включить(next: boolean) {
    setError(null)
    if (!next) {
      onPatch({ remindersOn: false })
      return
    }
    setBusy(true)
    try {
      // Спрашивать разрешение можно только по нажатию — здесь это оно и есть.
      const ответ = permission === 'granted' ? permission : await port.requestPermission()
      setPermission(ответ)
      if (ответ !== 'granted') {
        setError('Телефон не дал разрешения показывать уведомления. Без него напоминания приходить не будут.')
        return
      }
      onPatch({ remindersOn: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  // ── в браузере напоминаний не существует ────────────────────────────────
  if (!supported) {
    return (
      <div className="card">
        <div className="card__head">
          <h2>Напоминания о приёме</h2>
        </div>
        <div className="muted">
          Браузер не умеет напоминать по расписанию: страница должна быть открыта, а ночью и при закрытой вкладке
          напоминание не придёт. Поэтому здесь расписание выгружается в календарь телефона — кнопка в аптечке.
          <div style={{ marginTop: 'var(--space-2)' }}>
            Настоящие напоминания со звуком есть в приложении для Android.
          </div>
        </div>
      </div>
    )
  }

  const действует = enabled && permission === 'granted' && времена.length > 0

  return (
    <div className="card">
      <div className="card__head">
        <h2>Напоминания о приёме</h2>
      </div>

      <label className="badge" style={{ whiteSpace: 'normal' }}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => void включить(event.target.checked)}
        />
        <span style={{ fontSize: 'var(--fs-2)', color: 'var(--text-primary)' }}>
          Напоминать принять лекарства
          <span className="fact__note">
            {времена.length
              ? `по расписанию из аптечки — ${времена.join(', ')}`
              : 'ни у одного препарата пока не указано время приёма'}
          </span>
        </span>
      </label>

      {/* Расписания нет — напоминать не о чем, и это надо сказать прямо,
          а не оставлять человека с включённым переключателем и тишиной. */}
      <Reveal open={enabled && времена.length === 0}>
        <div style={{ paddingTop: 'var(--space-4)' }}>
          <Banner tone="info">
            <b>Напоминать пока не о чем</b>
            <div style={{ marginTop: 4 }}>
              Откройте аптечку, выберите препарат и укажите часы приёма — например 08:00 и 20:00. Напоминания появятся
              сами.
            </div>
          </Banner>
        </div>
      </Reveal>

      {/* Разрешение могли отозвать в настройках телефона уже после включения.
          Молчать об этом нельзя: переключатель стоит в положении «напоминать»,
          а напоминания не приходят — и человек об этом узнаёт по пропущенной
          таблетке. */}
      <Reveal open={enabled && permission !== 'granted' && !error}>
        <div style={{ paddingTop: 'var(--space-4)' }}>
          <Banner tone="warning">
            <b>Напоминания выключены телефоном</b>
            <div style={{ marginTop: 4 }}>
              Разрешение показывать уведомления отозвано в настройках, и напоминания приходить не будут.
            </div>
            <button
              className="btn btn--sm"
              style={{ marginTop: 'var(--space-3)' }}
              onClick={() => void port.openBatterySettings()}
            >
              Открыть настройки приложения
            </button>
          </Banner>
        </div>
      </Reveal>

      <Reveal open={!!error}>
        <div style={{ paddingTop: 'var(--space-4)' }}>
          <Banner tone="warning">
            <b>Не получилось включить</b>
            <div style={{ marginTop: 4 }}>{error}</div>
            <button
              className="btn btn--sm"
              style={{ marginTop: 'var(--space-3)' }}
              onClick={() => void port.openBatterySettings()}
            >
              Открыть настройки приложения
            </button>
          </Banner>
        </div>
      </Reveal>

      <Reveal open={действует}>
        <div className="stack" style={{ paddingTop: 'var(--space-5)', gap: 'var(--space-4)' }}>
          <div>
            <label className="badge" style={{ whiteSpace: 'normal' }}>
              <input
                type="checkbox"
                checked={repeat}
                onChange={(event) => onPatch({ remindersRepeat: event.target.checked })}
              />
              <span style={{ fontSize: 'var(--fs-2)', color: 'var(--text-primary)' }}>
                Повторять, пока не отмечу приём
                <span className="fact__note">
                  ещё {REPEATS} раза каждые {REPEAT_INTERVAL_MIN} минут, потом приложение замолчит
                </span>
              </span>
            </label>
            <div className="muted" style={{ marginTop: 'var(--space-2)' }}>
              В самом уведомлении есть кнопки «Принял» и «Отложить» — отмечать можно, не открывая приложение. Отметка
              снимает оставшиеся повторы этого приёма.
            </div>
          </div>

          <div>
            <div style={{ fontSize: 'var(--fs-2)', fontWeight: 600 }}>Мелодия</div>
            <div className="muted" style={{ marginTop: 2 }}>
              Пусть отличается от почты и сообщений — так понятно, что зовут к лекарствам.
            </div>
          </div>

          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {sounds.map((item) => (
              <div
                key={item.id}
                className="row"
                style={{ gap: 'var(--space-3)', alignItems: 'center', minHeight: 'var(--tap)' }}
              >
                <label className="badge" style={{ whiteSpace: 'normal', flex: 1 }}>
                  <input
                    type="radio"
                    name="reminder-sound"
                    checked={sound === item.id}
                    onChange={() => {
                      onPatch({ reminderSound: item.id })
                      послушать(item.id)
                    }}
                  />
                  <span style={{ fontSize: 'var(--fs-2)', color: 'var(--text-primary)' }}>
                    {item.name}
                    <span className="fact__note">{item.hint}</span>
                  </span>
                </label>
                {item.id !== 'system' && (
                  <button
                    className="btn btn--sm"
                    onClick={() => послушать(item.id)}
                    aria-label={`Прослушать «${item.name}»`}
                  >
                    {playing === item.id ? 'Звучит…' : 'Послушать'}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div>
            <button className="btn btn--sm" onClick={() => void port.openSoundSettings(sound)}>
              Громкость и вибрация
            </button>
            <div className="muted" style={{ marginTop: 'var(--space-2)' }}>
              Ими распоряжается сам телефон — кнопка открывает нужный его экран.
            </div>
            <div className="muted" style={{ marginTop: 'var(--space-2)' }}>
              Напоминания расставлены на {HORIZON_DAYS} дней вперёд и продлеваются каждый раз, когда вы открываете
              приложение.
            </div>
          </div>

          {/* Главная причина молчащих напоминаний на Android. Пишем до того,
              как человек столкнётся, а не в ответ на жалобу. */}
          <Banner tone="info">
            <b>Если напоминания перестанут приходить</b>
            <div style={{ marginTop: 4 }}>
              Телефон умеет «усыплять» приложения ради экономии батареи, и тогда напоминание не приходит вовсе. Откройте
              настройки приложения, найдите «Батарея» и разрешите работу в фоне.
            </div>
            <button
              className="btn btn--sm"
              style={{ marginTop: 'var(--space-3)' }}
              onClick={() => void port.openBatterySettings()}
            >
              Открыть настройки приложения
            </button>
          </Banner>
        </div>
      </Reveal>
    </div>
  )
}
