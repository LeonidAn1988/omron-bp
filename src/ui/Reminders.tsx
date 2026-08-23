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

import { useCallback, useEffect, useState } from 'react'
import { HORIZON_DAYS, REPEAT_INTERVAL_MIN, REPEATS, reminderTimes } from '../logic/reminders'
import { platform } from '../platform/ports'
import type { ReminderHealth, ReminderPermission } from '../platform/ports'
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
  const [checking, setChecking] = useState<string | null>(null)
  const [batteryRestricted, setBatteryRestricted] = useState<boolean | null>(null)
  const [exact, setExact] = useState<boolean | null>(null)
  const [quiet, setQuiet] = useState<boolean | null>(null)
  const [health, setHealth] = useState<ReminderHealth | null>(null)

  const времена = reminderTimes(medicines)

  const обновить = useCallback(async () => {
    if (!supported) return
    setPermission(await port.permission())
    setBatteryRestricted(await port.isBatteryRestricted())
    setExact(await port.exactTiming())
    setQuiet(await port.isQuietModeOn())
    setHealth(await port.health(sound))
  }, [port, supported, sound])

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

  /**
   * Показать настоящее пробное напоминание, а не проиграть файл.
   *
   * Звук уведомления идёт своей громкостью, отдельной от музыки, и подчиняется
   * тихому режиму. Проиграв файл плеером, мы дали бы услышать не то, что
   * прозвучит в восемь утра, — и человек настроил бы громкость не ту.
   */
  function проверить(id: string) {
    setChecking(id)
    void port.preview(id).finally(() => window.setTimeout(() => setChecking(null), 2500))
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

      <label className="optrow__label">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => void включить(event.target.checked)}
        />
        <span className="optrow__title">
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
            <label className="optrow__label">
              <input
                type="checkbox"
                checked={repeat}
                onChange={(event) => onPatch({ remindersRepeat: event.target.checked })}
              />
              <span className="optrow__title">
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
              Пусть отличается от почты и сообщений — так понятно, что зовут к лекарствам. «Проверить» показывает
              настоящее напоминание: услышите ровно то, что прозвучит утром, и той же громкостью.
            </div>
          </div>

          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            {sounds.map((item) => (
              <div key={item.id} className="optrow">
                <label className="optrow__label">
                  <input
                    type="radio"
                    name="reminder-sound"
                    checked={sound === item.id}
                    onChange={() => {
                      onPatch({ reminderSound: item.id })
                      проверить(item.id)
                    }}
                  />
                  <span className="optrow__title">
                    {item.name}
                    <span className="fact__note">{item.hint}</span>
                  </span>
                </label>
                <button
                  className="btn btn--sm optrow__action"
                  onClick={() => проверить(item.id)}
                  aria-label={`Проверить звук «${item.name}»`}
                >
                  {checking === item.id ? 'Слушайте…' : 'Проверить'}
                </button>
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
              {health && health.scheduled > 0 && health.until
                ? `Сейчас в телефоне ${health.scheduled} напоминаний, последнее — ${new Intl.DateTimeFormat('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                  }).format(health.until)}. Список продлевается каждый раз, когда вы открываете приложение.`
                : `Напоминания расставляются на ${HORIZON_DAYS} дней вперёд и продлеваются каждый раз, когда вы открываете приложение.`}
            </div>
          </div>

          {health?.channelOff && (
            <Banner tone="critical">
              <b>Напоминания выключены в настройках телефона</b>
              <div style={{ marginTop: 4 }}>
                Уведомления этого приложения отключены — расписание стоит, но ни одно напоминание не появится.
              </div>
              <button
                className="btn btn--sm"
                style={{ marginTop: 'var(--space-3)' }}
                onClick={() => void port.openSoundSettings(sound)}
              >
                Включить уведомления
              </button>
            </Banner>
          )}

          {/*
            «Не беспокоить» делает напоминание беззвучным, а беззвучное
            напоминание о лекарстве равно отсутствующему. Проверено на живом
            телефоне: уведомление пришло вовремя и молча.
          */}
          {quiet === true && (
            <Banner tone="warning">
              <b>Сейчас включён режим «Не беспокоить»</b>
              <div style={{ marginTop: 4 }}>
                Напоминание придёт, но без звука — его легко не заметить. Разрешите этому приложению звучать и в тихом
                режиме: в открывшемся экране включите «Переопределить режим „Не беспокоить“».
              </div>
              <button
                className="btn btn--sm"
                style={{ marginTop: 'var(--space-3)' }}
                onClick={() => void port.openSoundSettings(sound)}
              >
                Открыть настройки уведомления
              </button>
            </Banner>
          )}

          {/*
            Точное время. Без разрешения система выдаёт будильник с окном,
            которое растёт со временем: измерено на HUAWEI — десять минут у
            ближайшего напоминания, двадцать две у следующего. Повторы через
            пятнадцать минут при таком разбросе слипаются.

            Спрашиваем здесь, а не в момент сохранения настроек: рядом видно
            зачем, и человек решает сам.
          */}
          {exact === false && (
            <Banner tone="warning">
              <b>Напоминания приходят не вовремя</b>
              <div style={{ marginTop: 4 }}>
                Телефон откладывает их на десять–двадцать минут, чтобы сэкономить батарею. Разрешите точное время — и
                напоминание придёт в тот час, который вы назначили.
              </div>
              <button
                className="btn btn--sm"
                style={{ marginTop: 'var(--space-3)' }}
                onClick={() => void port.requestExactTiming().then(setExact)}
              >
                Разрешить точное время
              </button>
            </Banner>
          )}
          {exact === true && (
            <div className="muted">Точное время разрешено — напоминание придёт минута в минуту.</div>
          )}

          {/*
            Главная причина молчащих напоминаний на Android — и проверено на
            живом телефоне, что причина настоящая: HUAWEI выгружает приложение,
            как только гаснет экран.

            Предупреждение показывается, только когда ограничение действительно
            стоит. Постоянно висящий тревожный блок перестают читать, и в тот
            день, когда он окажется правдой, его не заметят.
          */}
          {batteryRestricted !== false && (
            <Banner tone={batteryRestricted ? 'warning' : 'info'}>
              <b>{batteryRestricted ? 'Телефон может не дать напоминаниям прийти' : 'Если напоминания перестанут приходить'}</b>
              <div style={{ marginTop: 4 }}>
                Ради экономии батареи телефон «усыпляет» приложения, и тогда напоминание не приходит вовсе. Разрешите
                приложению работать без ограничений — это делается один раз.
              </div>
              <button
                className="btn btn--sm"
                style={{ marginTop: 'var(--space-3)' }}
                onClick={() => void port.openBatterySettings()}
              >
                Разрешить работу без ограничений
              </button>
              <div className="muted" style={{ marginTop: 'var(--space-2)' }}>
                На телефонах Huawei, Xiaomi и Samsung есть ещё свой список: настройки телефона → «Батарея» → «Запуск
                приложений». Там приложение тоже нужно разрешить — система об этом списке не сообщает.
              </div>
            </Banner>
          )}
        </div>
      </Reveal>
    </div>
  )
}
