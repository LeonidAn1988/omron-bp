import { useEffect, useState } from 'react'
import type { Reading } from '../types'
import { readingId } from '../db/store'
import {
  downloadRecords,
  getKnownDevices,
  inspectDevice,
  isBluetoothEnabled,
  isWebBluetoothAvailable,
  pairDevice,
  pickDevice,
  type DeviceRecord,
} from '../ble/session'
import { BleLog, logToText, useBleLog } from './BleLog'
import { Banner } from './bits'
import { download } from '../logic/io'

const FULL_DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const DAY = 86_400_000

function toReading(record: DeviceRecord): Reading {
  const ts = record.date.getTime()
  return {
    id: readingId(record.user, ts),
    ts,
    sys: record.sys,
    dia: record.dia,
    bpm: record.bpm > 0 ? record.bpm : null,
    ihb: record.ihb,
    mov: record.mov,
    user: record.user,
    source: 'device',
  }
}

interface SyncOutcome {
  total: number
  added: number
  newestTs: number | null
  clockSkewMs: number | null
}

type Busy = null | 'download' | 'pair' | 'inspect'

export function Sync({
  pairingKey,
  onImport,
}: {
  pairingKey: string
  onImport: (readings: Reading[]) => Promise<number>
}) {
  const { lines, log, clear } = useBleLog()
  const [device, setDevice] = useState<BluetoothDevice | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [progress, setProgress] = useState(0)
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [radioOff, setRadioOff] = useState(false)

  const supported = isWebBluetoothAvailable()

  useEffect(() => {
    if (!supported) return
    isBluetoothEnabled().then((enabled) => setRadioOff(enabled === false))
    getKnownDevices().then((known) => {
      if (known.length === 1) setDevice(known[0])
    })
  }, [supported])

  async function ensureDevice(): Promise<BluetoothDevice> {
    if (device) return device
    const picked = await pickDevice(showAll)
    setDevice(picked)
    return picked
  }

  async function run(kind: Exclude<Busy, null>, action: (device: BluetoothDevice) => Promise<void>) {
    setBusy(kind)
    setError(null)
    setProgress(0)
    try {
      const target = await ensureDevice()
      await action(target)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      // Пользователь просто закрыл системный диалог выбора — это не ошибка.
      if (!/User cancelled|chooser|cancell?ed/i.test(message)) {
        setError(message)
        log('error', message)
      }
    } finally {
      setBusy(null)
    }
  }

  const handleDownload = () =>
    run('download', async (target) => {
      setOutcome(null)
      const { records } = await downloadRecords(target, pairingKey, log, (p) => setProgress(p.fraction))
      const readings = records.map(toReading)
      const added = await onImport(readings)
      const newestTs = readings.length ? Math.max(...readings.map((r) => r.ts)) : null
      setOutcome({
        total: readings.length,
        added,
        newestTs,
        clockSkewMs: newestTs === null ? null : Date.now() - newestTs,
      })
    })

  const handlePair = () =>
    run('pair', async (target) => {
      await pairDevice(target, pairingKey, log)
      setOutcome(null)
      setError(null)
      log('info', 'сопряжение завершено — теперь можно выгружать историю')
    })

  const handleInspect = () => run('inspect', (target) => inspectDevice(target, log))

  if (!supported) {
    return (
      <Banner tone="warning">
        <b>Web Bluetooth в этом браузере недоступен.</b>
        <div style={{ marginTop: 6 }}>
          Синхронизация с тонометром работает в Chrome или Edge на macOS, Windows, Linux и Android. В Safari и в любом
          браузере на iPhone и iPad Web Bluetooth не поддерживается — там остаются ручной ввод и импорт файла.
        </div>
      </Banner>
    )
  }

  const skewDays = outcome?.clockSkewMs != null ? Math.round(outcome.clockSkewMs / DAY) : 0

  return (
    <div className="stack">
      {radioOff && <Banner tone="warning">Bluetooth на компьютере выключен — включите его и обновите страницу.</Banner>}

      <div className="card">
        <div className="card__head">
          <h2>Выгрузка с тонометра</h2>
          {device && <span className="muted">{device.name ?? 'устройство выбрано'}</span>}
        </div>

        <div className="row">
          <button className="btn btn--primary" onClick={handleDownload} disabled={busy !== null}>
            {busy === 'download' ? 'Читаю память…' : 'Подключить и выгрузить'}
          </button>
          <button className="btn" onClick={handlePair} disabled={busy !== null}>
            {busy === 'pair' ? 'Сопрягаю…' : 'Сопряжение'}
          </button>
          {device && (
            <button className="btn btn--sm" onClick={() => setDevice(null)} disabled={busy !== null}>
              Выбрать другое устройство
            </button>
          )}
        </div>

        {busy === 'download' && (
          <div style={{ marginTop: 14 }}>
            <div className="progress">
              <div className="progress__bar" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              Читаю память прибора — {Math.round(progress * 100)}%. Не выключайте Bluetooth на тонометре.
            </div>
          </div>
        )}

        <ol className="steps" style={{ marginTop: 16 }}>
          <li>
            На тонометре нажмите кнопку Bluetooth — на экране замигает значок связи. Прибор ждёт подключения около
            минуты, потом гасит радио.
          </li>
          <li>
            Нажмите <b>«Подключить и выгрузить»</b> и выберите прибор в системном окне (обычно называется{' '}
            <kbd>BLESmart_…</kbd>).
          </li>
          <li>
            Если прибор ответил, что ключ не подходит — он ещё не сопряжён с этим приложением. Удерживайте кнопку
            Bluetooth около двух секунд, пока на экране не замигает <kbd>P</kbd>, и нажмите <b>«Сопряжение»</b>. Это
            делается один раз.
          </li>
        </ol>
      </div>

      {error && (
        <Banner tone="critical">
          <b>Не получилось</b>
          <div style={{ marginTop: 4 }}>{error}</div>
        </Banner>
      )}

      {outcome && (
        <Banner tone={outcome.added > 0 ? 'good' : 'info'}>
          <b>
            {outcome.added > 0
              ? `Добавлено новых измерений: ${outcome.added}`
              : 'Новых измерений нет — всё уже было в дневнике'}
          </b>
          <div style={{ marginTop: 4 }}>
            Прочитано из памяти прибора: {outcome.total}.
            {outcome.newestTs && <> Последнее — {FULL_DATE.format(outcome.newestTs)}.</>}
          </div>
        </Banner>
      )}

      {outcome?.clockSkewMs != null && Math.abs(outcome.clockSkewMs) > DAY && (
        <Banner tone="warning">
          <b>Часы тонометра, похоже, сбиты.</b>
          <div style={{ marginTop: 4 }}>
            Последнее измерение датировано {FULL_DATE.format(outcome.newestTs!)} — это на {Math.abs(skewDays)}{' '}
            {Math.abs(skewDays) === 1 ? 'день' : 'дней'} {skewDays > 0 ? 'раньше' : 'позже'} текущей даты. Даты
            измерений берутся из самого прибора, поэтому история приедет со сдвигом. Поправьте дату и время в
            настройках тонометра — приложение их намеренно не трогает.
          </div>
        </Banner>
      )}

      <div className="card">
        <div className="card__head">
          <h2>Журнал обмена</h2>
          <div className="row">
            <label className="badge">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} style={{ width: 'auto' }} />
              показывать все устройства
            </label>
            <label className="badge">
              <input type="checkbox" checked={showDebug} onChange={(e) => setShowDebug(e.target.checked)} style={{ width: 'auto' }} />
              подробно
            </label>
          </div>
        </div>

        <BleLog lines={lines} showDebug={showDebug} />

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn--sm" onClick={handleInspect} disabled={busy !== null}>
            Показать характеристики прибора
          </button>
          <button className="btn btn--sm" onClick={clear} disabled={lines.length === 0}>
            Очистить
          </button>
          <button
            className="btn btn--sm"
            onClick={() => download('omron-ble-log.txt', logToText(lines), 'text/plain')}
            disabled={lines.length === 0}
          >
            Сохранить журнал
          </button>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          Включите «подробно», если что-то идёт не так: в журнал попадут все пакеты обмена в шестнадцатеричном виде.
        </div>
      </div>
    </div>
  )
}
