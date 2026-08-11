import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Reading, Settings as SettingsData } from './types'
import {
  DEFAULT_SETTINGS,
  addNewReadings,
  clearReadings,
  deleteReading,
  getAllReadings,
  loadSettings,
  putReadings,
  saveSettings,
} from './db/store'
import { PERIODS, filterByPeriod, summarize, type PeriodKey } from './logic/stats'
import { DayPartChart, PulseChart, TrendChart } from './ui/Charts'
import { LatestAlert, SummaryTiles } from './ui/Summary'
import { Readings } from './ui/Readings'
import { Entry } from './ui/Entry'
import { Sync } from './ui/Sync'
import { Settings } from './ui/Settings'
import { Report } from './ui/Report'
import { Banner, Reveal } from './ui/bits'

/** Короткая подпись — для нижней навигации на телефоне, где на пункт приходится ~70px. */
const TABS = [
  { key: 'overview', label: 'Обзор', short: 'Обзор' },
  { key: 'readings', label: 'Измерения', short: 'Записи' },
  { key: 'sync', label: 'Синхронизация', short: 'Прибор' },
  { key: 'report', label: 'Отчёт для врача', short: 'Отчёт' },
  { key: 'settings', label: 'Настройки', short: 'Настройки' },
] as const

type TabKey = (typeof TABS)[number]['key']

/** Период фильтрует данные, поэтому живёт рядом с ними, а не в общей шапке. */
function PeriodPicker({ value, onChange }: { value: PeriodKey; onChange: (next: PeriodKey) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Период">
      {PERIODS.map((item) => (
        <button key={item.key} aria-pressed={value === item.key} onClick={() => onChange(item.key)}>
          {item.label}
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const [readings, setReadings] = useState<Reading[]>([])
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [tab, setTab] = useState<TabKey>('overview')
  const [ready, setReady] = useState(false)
  /** Последняя удалённая запись — чтобы удаление можно было отменить. */
  const [undo, setUndo] = useState<Reading | null>(null)
  const undoTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    Promise.all([getAllReadings(), loadSettings()]).then(([stored, loaded]) => {
      setReadings(stored)
      setSettings(loaded)
      setReady(true)
    })
    return () => window.clearTimeout(undoTimer.current)
  }, [])

  const refresh = useCallback(async () => setReadings(await getAllReadings()), [])

  const handleAdd = useCallback(
    async (reading: Reading) => {
      await putReadings([reading])
      await refresh()
    },
    [refresh],
  )

  const handleImport = useCallback(
    async (incoming: Reading[]) => {
      const added = await addNewReadings(incoming)
      await refresh()
      return added.length
    },
    [refresh],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      const victim = readings.find((r) => r.id === id) ?? null
      await deleteReading(id)
      await refresh()
      setUndo(victim)
      window.clearTimeout(undoTimer.current)
      undoTimer.current = window.setTimeout(() => setUndo(null), 8000)
    },
    [readings, refresh],
  )

  const handleUndo = useCallback(async () => {
    if (!undo) return
    // Идентификатор детерминирован, поэтому возврат не создаёт дубля.
    await putReadings([undo])
    await refresh()
    setUndo(null)
  }, [undo, refresh])

  const handleClearAll = useCallback(async () => {
    await clearReadings()
    await refresh()
    setUndo(null)
  }, [refresh])

  const updateSettings = useCallback((next: SettingsData) => {
    setSettings(next)
    void saveSettings(next)
  }, [])

  const userReadings = useMemo(() => readings.filter((r) => r.user === settings.activeUser), [readings, settings.activeUser])
  const scoped = useMemo(() => filterByPeriod(userReadings, period), [userReadings, period])
  const summary = useMemo(
    () => summarize(scoped, settings.targetSys, settings.targetDia),
    [scoped, settings.targetSys, settings.targetDia],
  )
  const latest = userReadings.length ? userReadings[userReadings.length - 1] : null

  const hasSecondUser = useMemo(() => readings.some((r) => r.user !== 1), [readings])
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? ''
  const patientName = settings.userNames[settings.activeUser] ?? `Пользователь ${settings.activeUser}`

  if (!ready) {
    return (
      <div className="app" style={{ padding: 40, color: 'var(--text-muted)' }}>
        Загрузка…
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__title">
          <h1>Дневник давления</h1>
          <span className="topbar__sub">Omron RS7 Intelli IT</span>
        </div>
      </header>

      {/* Обычная навигация, а не ARIA-паттерн вкладок: полный tablist требует
          tabpanel, aria-controls и управления стрелками — недостроенный он
          путает скринридер сильнее, чем его отсутствие. */}
      <nav className="tabs" aria-label="Разделы дневника">
        {TABS.map((item) => (
          <button
            key={item.key}
            className="tab"
            aria-current={tab === item.key ? 'page' : undefined}
            aria-label={item.label}
            onClick={() => setTab(item.key)}
          >
            <span className="tab__full">{item.label}</span>
            <span className="tab__short">{item.short}</span>
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="stack">
          <LatestAlert latest={latest} />

          {readings.length === 0 ? (
            <Banner tone="info">
              <b>Дневник пока пуст.</b>
              <div style={{ marginTop: 4 }}>
                Откройте «Прибор», чтобы выгрузить историю прямо из тонометра, либо внесите измерение вручную во
                вкладке «Записи».
              </div>
            </Banner>
          ) : (
            <>
              <div className="row no-print">
                <PeriodPicker value={period} onChange={setPeriod} />
              </div>

              {!summary ? (
                <Banner tone="info">
                  За выбранный период измерений нет. Возьмите период пошире — например, «Всё время».
                </Banner>
              ) : (
                <>
                  <SummaryTiles summary={summary} targetSys={settings.targetSys} targetDia={settings.targetDia} />

                  <div className="card">
                    <div className="card__head">
                      <h2>Динамика давления</h2>
                      <span className="muted">точки — измерения, линия — среднее за 7 дней</span>
                    </div>
                    <TrendChart readings={scoped} targetSys={settings.targetSys} targetDia={settings.targetDia} />
                  </div>

                  <div className="grid grid--two">
                    <div className="card">
                      <div className="card__head">
                        <h2>По времени суток</h2>
                      </div>
                      <DayPartChart readings={scoped} />
                    </div>
                    <div className="card">
                      <div className="card__head">
                        <h2>Пульс</h2>
                        <span className="muted">ударов в минуту</span>
                      </div>
                      <PulseChart readings={scoped} />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'readings' && (
        <div className="stack">
          <Entry user={settings.activeUser} onAdd={handleAdd} />

          <Reveal open={undo !== null}>
            <div className="no-print" style={{ paddingBottom: 'var(--space-3)' }}>
              <Banner tone="info">
                <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
                  <span>Измерение удалено.</span>
                  <button className="btn" onClick={handleUndo}>
                    Вернуть
                  </button>
                </div>
              </Banner>
            </div>
          </Reveal>

          <div className="card">
            <div className="card__head">
              <h2>История</h2>
              <span className="muted">
                {scoped.length} из {userReadings.length}
              </span>
            </div>
            <div className="row no-print" style={{ marginBottom: 'var(--space-3)' }}>
              <PeriodPicker value={period} onChange={setPeriod} />
            </div>
            <Readings readings={scoped} onDelete={handleDelete} />
          </div>
        </div>
      )}

      {tab === 'sync' && <Sync pairingKey={settings.pairingKey} onImport={handleImport} onGoManual={() => setTab('readings')} />}

      {tab === 'report' && (
        <Report
          readings={scoped}
          summary={summary}
          patient={patientName}
          periodLabel={periodLabel}
          targetSys={settings.targetSys}
          targetDia={settings.targetDia}
          period={period}
          onPeriodChange={setPeriod}
        />
      )}

      {tab === 'settings' && (
        <Settings
          settings={settings}
          onChange={updateSettings}
          readings={readings}
          onImport={handleImport}
          onClearAll={handleClearAll}
          showUserPicker={hasSecondUser}
        />
      )}
    </div>
  )
}
