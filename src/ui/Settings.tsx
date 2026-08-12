import { useRef, useState } from 'react'
import type { Measurement, Settings as SettingsData, ThemeChoice } from '../types'
import { DEFAULT_PAIRING_KEY } from '../ble/session'
import { download, parseImportFile, toCsv, toJson } from '../logic/io'
import { Banner, Field } from './bits'

const today = () => new Date().toISOString().slice(0, 10)

const THEMES: { key: ThemeChoice; title: string }[] = [
  { key: 'auto', title: 'Как в системе' },
  { key: 'light', title: 'Светлая' },
  { key: 'dark', title: 'Тёмная' },
]

export function Settings({
  settings,
  onChange,
  measurements,
  onImport,
  onClearAll,
  showUserPicker,
}: {
  settings: SettingsData
  onChange: (next: SettingsData) => void
  measurements: Measurement[]
  onImport: (measurements: Measurement[]) => Promise<number>
  onClearAll: () => Promise<void>
  showUserPicker: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ tone: 'good' | 'critical'; text: string } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const patch = (fields: Partial<SettingsData>) => onChange({ ...settings, ...fields })

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const { measurements: parsed, skipped } = parseImportFile(file.name, await file.text())
      const added = await onImport(parsed)
      setMessage({
        tone: 'good',
        text:
          `Разобрано записей: ${parsed.length}, добавлено новых: ${added}.` +
          (skipped ? ` Пропущено нечитаемых строк: ${skipped}.` : ''),
      })
    } catch (error) {
      setMessage({ tone: 'critical', text: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="card__head">
          <h2>Оформление</h2>
        </div>

        <div className="tile__label" style={{ marginBottom: 'var(--space-2)' }}>
          Тема
        </div>
        <div className="segmented segmented--fill" role="group" aria-label="Тема оформления">
          {THEMES.map(({ key, title }) => (
            <button key={key} aria-pressed={settings.theme === key} onClick={() => patch({ theme: key })}>
              {title}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
          «Как в системе» — приложение темнеет вместе с телефоном или компьютером.
        </p>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Пользователи и цели</h2>
        </div>

        {/* Переключатель уехал из шапки сюда: прибор помнит двух человек, но
            переключаются между ними от силы раз в жизни — в постоянной навигации
            он занимал место каждый день ради этого одного случая. */}
        {showUserPicker && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div className="tile__label" style={{ marginBottom: 'var(--space-2)' }}>
              Чей дневник показывать
            </div>
            <div className="segmented" role="group" aria-label="Пользователь прибора">
              {[1, 2].map((user) => (
                <button
                  key={user}
                  aria-pressed={settings.activeUser === user}
                  onClick={() => patch({ activeUser: user })}
                >
                  {settings.userNames[user] ?? `Пользователь ${user}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid--two">
          <Field label="Имя пользователя 1 на приборе">
            <input
              value={settings.userNames[1] ?? ''}
              onChange={(e) => patch({ userNames: { ...settings.userNames, 1: e.target.value } })}
            />
          </Field>
          <Field label="Имя пользователя 2 на приборе">
            <input
              value={settings.userNames[2] ?? ''}
              onChange={(e) => patch({ userNames: { ...settings.userNames, 2: e.target.value } })}
            />
          </Field>
          <Field label="Целевое верхнее давление">
            <input
              inputMode="numeric"
              value={settings.targetSys}
              onChange={(e) => patch({ targetSys: Number(e.target.value) || 135 })}
            />
          </Field>
          <Field label="Целевое нижнее давление">
            <input
              inputMode="numeric"
              value={settings.targetDia}
              onChange={(e) => patch({ targetDia: Number(e.target.value) || 85 })}
            />
          </Field>
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          По умолчанию стоит 135/85 — общепринятый порог для измерений дома. Он ниже привычного 140/90, потому что тот
          относится к измерениям в кабинете врача. Если врач назначил вам индивидуальную цель, поставьте её.
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Дневник сахара</h2>
          <label className="badge">
            <input
              type="checkbox"
              checked={settings.trackGlucose}
              onChange={(e) => patch({ trackGlucose: e.target.checked })}
            />
            вести
          </label>
        </div>

        {settings.trackGlucose ? (
          <>
            <div className="grid grid--two">
              <Field label="Норма натощак и до еды, ммоль/л">
                <input
                  inputMode="decimal"
                  value={settings.glucoseFastingMax}
                  onChange={(e) => patch({ glucoseFastingMax: Number(e.target.value.replace(',', '.')) || 7 })}
                />
              </Field>
              <Field label="Норма через 2 часа после еды, ммоль/л">
                <input
                  inputMode="decimal"
                  value={settings.glucosePostMealMax}
                  onChange={(e) => patch({ glucosePostMealMax: Number(e.target.value.replace(',', '.')) || 10 })}
                />
              </Field>
              <Field label="Порог низкого сахара, ммоль/л">
                <input
                  inputMode="decimal"
                  value={settings.glucoseLow}
                  onChange={(e) => patch({ glucoseLow: Number(e.target.value.replace(',', '.')) || 3.9 })}
                />
              </Field>
            </div>
            <div className="muted" style={{ marginTop: 10 }}>
              Значения по умолчанию — общие ориентиры. Цели при диабете назначает врач индивидуально, и они могут
              отличаться; поставьте те, что назвал ваш.
            </div>
          </>
        ) : (
          <div className="muted">
            Выключен. Включите, если ведёте ещё и уровень глюкозы — он появится рядом с давлением и попадёт в отчёт для
            врача. Уже внесённые замеры при выключении не удаляются.
          </div>
        )}
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Данные</h2>
          <span className="muted">всего записей: {measurements.length}</span>
        </div>

        <div className="row">
          <button className="btn" onClick={() => download(`dnevnik-${today()}.csv`, toCsv(measurements), 'text/csv')} disabled={!measurements.length}>
            Экспорт CSV
          </button>
          <button className="btn" onClick={() => download(`dnevnik-${today()}.json`, toJson(measurements), 'application/json')} disabled={!measurements.length}>
            Резервная копия JSON
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Импорт из файла
          </button>
          <input ref={fileRef} type="file" accept=".csv,.json,.tsv,text/csv,application/json" onChange={handleFile} hidden />
        </div>

        <div className="muted" style={{ marginTop: 10 }}>
          Импорт понимает CSV с русскими или английскими заголовками, а также <kbd>ubpm.json</kbd> и{' '}
          <kbd>user1.csv</kbd> от omblepy. Совпадающие измерения не задваиваются.
        </div>

        {message && (
          <div style={{ marginTop: 12 }}>
            <Banner tone={message.tone}>{message.text}</Banner>
          </div>
        )}

        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }} />

        {confirmClear ? (
          <div className="row">
            <span style={{ fontSize: '0.875rem' }}>Удалить все измерения без возможности восстановления?</span>
            <button
              className="btn btn--danger btn--sm"
              onClick={async () => {
                await onClearAll()
                setConfirmClear(false)
                setMessage({ tone: 'good', text: 'Все измерения удалены.' })
              }}
            >
              Да, удалить всё
            </button>
            <button className="btn btn--sm" onClick={() => setConfirmClear(false)}>
              Отмена
            </button>
          </div>
        ) : (
          <button className="btn btn--danger btn--sm" onClick={() => setConfirmClear(true)} disabled={!measurements.length}>
            Очистить базу
          </button>
        )}
        <div className="muted" style={{ marginTop: 10 }}>
          Данные хранятся только в этом браузере и никуда не отправляются. Очистка истории браузера или режим инкогнито
          их удалят — держите резервную копию.
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Ключ сопряжения</h2>
        </div>
        <Field label="16 байт в шестнадцатеричном виде">
          <input
            value={settings.pairingKey}
            spellCheck={false}
            onChange={(e) => patch({ pairingKey: e.target.value.trim() })}
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
          />
        </Field>
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="btn btn--sm"
            onClick={() => patch({ pairingKey: DEFAULT_PAIRING_KEY })}
            disabled={settings.pairingKey === DEFAULT_PAIRING_KEY}
          >
            Вернуть значение по умолчанию
          </button>
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          Этот ключ приложение предъявляет прибору, чтобы тот открыл доступ к памяти. Значение по умолчанию совпадает с
          ключом omblepy — благодаря этому прибор, сопряжённый через терминал, сразу работает и здесь. Менять ключ
          нужно только если вы сопрягали прибор с собственным значением.
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>О приложении</h2>
        </div>
        <div style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          <p style={{ marginTop: 0 }}>
            Дневник артериального давления для Omron RS7 Intelli IT (модель HEM-6232T). Читает историю измерений прямо
            из памяти прибора по Bluetooth, без приложения Omron Connect и без передачи данных на чужие серверы.
          </p>
          <p>
            Выгрузка работает только на чтение: единственная запись в прибор за всё время — разовый ключ сопряжения.
            Часы тонометра приложение не переставляет.
          </p>
          <p style={{ marginBottom: 0 }}>
            Разбор протокола основан на открытом проекте{' '}
            <a href="https://github.com/userx14/omblepy" target="_blank" rel="noreferrer">
              omblepy
            </a>{' '}
            (лицензия MIT). Приложение не является медицинским изделием и не ставит диагноз — решения о лечении
            принимает врач.
          </p>
        </div>
      </div>
    </div>
  )
}
