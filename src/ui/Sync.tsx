import { useEffect, useRef, useState } from 'react'
import type { BpReading } from '../types'
import { readingId } from '../db/store'
import {
  downloadRecords,
  getKnownDevices,
  inspectDevice,
  isBluetoothEnabled,
  isWebBluetoothAvailable,
  pairDevice,
  pickDevice,
  PairingRequiredError,
  type DeviceRecord,
} from '../ble/session'
import { BleLog, logToText, useBleLog } from './BleLog'
import { Banner, Reveal } from './bits'
import { download } from '../logic/io'

const FULL_DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const DAY = 86_400_000

function toReading(record: DeviceRecord): BpReading {
  const ts = record.date.getTime()
  return {
    kind: 'bp',
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
  onGoManual,
}: {
  pairingKey: string
  onImport: (readings: BpReading[]) => Promise<number>
  onGoManual: () => void
}) {
  const { lines, log, clear } = useBleLog()
  const [device, setDevice] = useState<BluetoothDevice | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  /** До первого прочитанного блока длительность неизвестна — показываем «идёт», а не проценты. */
  const [connecting, setConnecting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsPairing, setNeedsPairing] = useState(false)
  const [paired, setPaired] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [radioOff, setRadioOff] = useState(false)

  const resultRef = useRef<HTMLDivElement>(null)
  const supported = isWebBluetoothAvailable()

  useEffect(() => {
    if (!supported) return
    isBluetoothEnabled().then((enabled) => setRadioOff(enabled === false))
    getKnownDevices().then((known) => {
      if (known.length === 1) setDevice(known[0])
    })
  }, [supported])

  // Итог появляется под кнопками, но на телефоне может оказаться ниже сгиба.
  useEffect(() => {
    if (!outcome && !error && !needsPairing && !paired) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    resultRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [outcome, error, needsPairing, paired])

  async function ensureDevice(): Promise<BluetoothDevice> {
    if (device) return device
    const picked = await pickDevice(showAll)
    setDevice(picked)
    return picked
  }

  async function run(kind: Exclude<Busy, null>, action: (device: BluetoothDevice) => Promise<void>) {
    setBusy(kind)
    setError(null)
    setNeedsPairing(false)
    setPaired(false)
    setProgress(0)
    setConnecting(kind === 'download')
    try {
      const target = await ensureDevice()
      await action(target)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      if (caught instanceof PairingRequiredError) {
        setNeedsPairing(true)
        log('warn', `прибор отклонил ключ, код статуса ${caught.statusCode}`)
      } else if (!/User cancelled|chooser|cancell?ed/i.test(message)) {
        // Закрытый пользователем системный диалог выбора — не ошибка, молчим.
        setError(message)
        log('error', message)
      }
    } finally {
      setBusy(null)
      setConnecting(false)
    }
  }

  const handleDownload = () =>
    run('download', async (target) => {
      setOutcome(null)
      const { records } = await downloadRecords(target, pairingKey, log, (p) => {
        setConnecting(false)
        setProgress(p.fraction)
      })
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
      setPaired(true)
      log('info', 'сопряжение завершено — теперь можно выгружать историю')
    })

  const handleInspect = () => run('inspect', (target) => inspectDevice(target, log))

  if (!supported) {
    return (
      <div className="stack">
        <Banner tone="warning">
          <b>Этот браузер не умеет подключаться к тонометру.</b>
          <div style={{ marginTop: 4 }}>
            Выгрузка по Bluetooth работает в Chrome и Edge на Android, macOS, Windows и Linux. В Safari и в любом
            браузере на iPhone и iPad такой возможности нет — это ограничение самой системы, а не приложения.
          </div>
        </Banner>

        <div className="card">
          <div className="card__head">
            <h2>Что можно делать здесь</h2>
          </div>
          <p style={{ margin: '0 0 var(--space-4)', color: 'var(--text-secondary)' }}>
            Дневник, графики и отчёт для врача работают полностью. Измерения можно вносить руками, а историю с
            тонометра — выгрузить на компьютере и перенести сюда файлом.
          </p>
          <div className="row">
            <button className="btn btn--primary" onClick={onGoManual}>
              Записать измерение
            </button>
          </div>
        </div>
      </div>
    )
  }

  const skewDays = outcome?.clockSkewMs != null ? Math.round(outcome.clockSkewMs / DAY) : 0
  const downloading = busy === 'download'

  return (
    <div className="stack">
      {radioOff && <Banner tone="warning">Bluetooth на этом устройстве выключен — включите его и обновите страницу.</Banner>}

      <div className="card">
        <div className="card__head">
          <h2>Выгрузка с тонометра</h2>
          {device && <span className="muted">{device.name ?? 'устройство выбрано'}</span>}
        </div>

        <div className="row">
          <button className="btn btn--primary" onClick={handleDownload} disabled={busy !== null} data-loading={downloading}>
            {downloading ? 'Читаю память…' : 'Подключить и выгрузить'}
          </button>
          <button className="btn" onClick={handlePair} disabled={busy !== null}>
            {busy === 'pair' ? 'Сопрягаю…' : 'Сопряжение'}
          </button>
          {device && (
            <button className="btn btn--sm" onClick={() => setDevice(null)} disabled={busy !== null}>
              Другое устройство
            </button>
          )}
        </div>

        {downloading && (
          <div style={{ marginTop: 'var(--space-4) ' }}>
            <div className={connecting ? 'progress progress--indeterminate' : 'progress'}>
              <div className="progress__bar" style={connecting ? undefined : { width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="muted" style={{ marginTop: 'var(--space-2)' }} role="status" aria-live="polite">
              {connecting
                ? 'Соединяюсь с прибором и проверяю ключ…'
                : progress >= 1
                  ? 'Прочитано. Записываю в дневник…'
                  : `Читаю память прибора — ${Math.round(progress * 100)}%. Не выключайте Bluetooth на тонометре.`}
            </div>
          </div>
        )}

        {/* Итог и ошибки — сразу под кнопками, до инструкции: иначе на телефоне
            результат оказывается за краем экрана и остаётся незамеченным. */}
        <div ref={resultRef} style={{ scrollMarginTop: 120 }}>
          <Reveal open={needsPairing}>
            <div style={{ paddingTop: 'var(--space-4)' }} role="alert">
              <Banner tone="info">
                <b>Нужно разовое сопряжение</b>
                <div style={{ marginTop: 4 }}>
                  Тонометр не принял ключ: он ещё не сопряжён с этим приложением, либо в нём остался ключ от Omron
                  Connect. Это делается один раз.
                </div>
                <ol className="steps" style={{ marginTop: 'var(--space-2)' }}>
                  <li>
                    Удерживайте кнопку Bluetooth на приборе около двух секунд, пока на экране не замигает <kbd>P</kbd>.
                  </li>
                  <li>Нажмите кнопку ниже и снова выберите прибор в системном окне.</li>
                </ol>
                <button className="btn btn--primary" onClick={handlePair} disabled={busy !== null} style={{ marginTop: 'var(--space-3)' }}>
                  {busy === 'pair' ? 'Сопрягаю…' : 'Сопрячь сейчас'}
                </button>
              </Banner>
            </div>
          </Reveal>

          <Reveal open={paired}>
            <div style={{ paddingTop: 'var(--space-4)' }} role="status">
              <Banner tone="good">
                <b>Прибор сопряжён</b>
                <div style={{ marginTop: 4 }}>
                  Больше это делать не придётся. Нажмите кнопку Bluetooth на тонометре ещё раз — коротко, без
                  удержания — и выгрузите историю.
                </div>
                <button className="btn btn--primary" onClick={handleDownload} disabled={busy !== null} style={{ marginTop: 'var(--space-3)' }}>
                  Подключить и выгрузить
                </button>
              </Banner>
            </div>
          </Reveal>

          <Reveal open={error !== null}>
            <div style={{ paddingTop: 'var(--space-4)' }} role="alert">
              {error && (
                <Banner tone="critical">
                  <b>Не получилось</b>
                  <div style={{ marginTop: 4 }}>{error}</div>
                </Banner>
              )}
            </div>
          </Reveal>

          <Reveal open={outcome !== null}>
            <div style={{ paddingTop: 'var(--space-4)' }} role="status">
              {outcome && (
                <Banner tone={outcome.added > 0 ? 'good' : 'info'}>
                  <b>
                    {outcome.added > 0
                      ? `Добавлено новых измерений: ${outcome.added}`
                      : 'Новых измерений нет — всё уже в дневнике'}
                  </b>
                  <div style={{ marginTop: 4 }}>
                    Прочитано из памяти прибора: {outcome.total}.
                    {outcome.newestTs && <> Последнее — {FULL_DATE.format(outcome.newestTs)}.</>}
                  </div>
                </Banner>
              )}
            </div>
          </Reveal>
        </div>

        <ol className="steps" style={{ marginTop: 'var(--space-5)' }}>
          <li>Нажмите кнопку Bluetooth на тонометре — замигает значок связи. Прибор ждёт около минуты.</li>
          <li>
            Нажмите <b>«Подключить и выгрузить»</b> и выберите прибор в системном окне — он называется{' '}
            <kbd>BLEsmart_…</kbd>
          </li>
        </ol>
      </div>

      {outcome?.clockSkewMs != null && Math.abs(outcome.clockSkewMs) > DAY && (
        <Banner tone="warning">
          <b>Часы тонометра сбиты</b>
          <div style={{ marginTop: 4 }}>
            Последнее измерение датировано {FULL_DATE.format(outcome.newestTs!)} — это на {Math.abs(skewDays)}{' '}
            {Math.abs(skewDays) === 1 ? 'день' : 'дней'} {skewDays > 0 ? 'раньше' : 'позже'} сегодняшней даты. Даты
            берутся из самого прибора, поэтому история приехала со сдвигом. Поправьте дату и время кнопками на
            тонометре — приложение их намеренно не трогает.
          </div>
        </Banner>
      )}

      <div className="card">
        <div className="card__head">
          <h2>Журнал обмена</h2>
          <div className="row">
            <label className="badge">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              показывать все устройства
            </label>
            <label className="badge">
              <input type="checkbox" checked={showDebug} onChange={(e) => setShowDebug(e.target.checked)} />
              подробно
            </label>
          </div>
        </div>

        <BleLog lines={lines} showDebug={showDebug} />

        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
          <button className="btn btn--sm" onClick={handleInspect} disabled={busy !== null}>
            Характеристики прибора
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
        <div className="muted" style={{ marginTop: 'var(--space-2)' }}>
          Включите «подробно», если что-то пойдёт не так: в журнал попадут все пакеты обмена.
        </div>
      </div>
    </div>
  )
}
