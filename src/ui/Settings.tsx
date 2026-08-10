import { useRef, useState } from 'react'
import type { Reading, Settings as SettingsData } from '../types'
import { DEFAULT_PAIRING_KEY } from '../ble/session'
import { download, parseImportFile, toCsv, toJson } from '../logic/io'
import { Banner, Field } from './bits'

const today = () => new Date().toISOString().slice(0, 10)

export function Settings({
  settings,
  onChange,
  readings,
  onImport,
  onClearAll,
}: {
  settings: SettingsData
  onChange: (next: SettingsData) => void
  readings: Reading[]
  onImport: (readings: Reading[]) => Promise<number>
  onClearAll: () => Promise<void>
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
      const { readings: parsed, skipped } = parseImportFile(file.name, await file.text())
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
          <h2>Пользователи и цели</h2>
        </div>
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
          <h2>Данные</h2>
          <span className="muted">всего измерений: {readings.length}</span>
        </div>

        <div className="row">
          <button className="btn" onClick={() => download(`davlenie-${today()}.csv`, toCsv(readings), 'text/csv')} disabled={!readings.length}>
            Экспорт CSV
          </button>
          <button className="btn" onClick={() => download(`davlenie-${today()}.json`, toJson(readings), 'application/json')} disabled={!readings.length}>
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
          <button className="btn btn--danger btn--sm" onClick={() => setConfirmClear(true)} disabled={!readings.length}>
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
