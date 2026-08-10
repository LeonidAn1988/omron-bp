import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { Banner } from './ui/bits'

const TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'readings', label: 'Измерения' },
  { key: 'sync', label: 'Синхронизация' },
  { key: 'report', label: 'Отчёт для врача' },
  { key: 'settings', label: 'Настройки' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function App() {
  const [readings, setReadings] = useState<Reading[]>([])
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [tab, setTab] = useState<TabKey>('overview')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    Promise.all([getAllReadings(), loadSettings()]).then(([stored, loaded]) => {
      setReadings(stored)
      setSettings(loaded)
      setReady(true)
    })
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
      await deleteReading(id)
      await refresh()
    },
    [refresh],
  )

  const handleClearAll = useCallback(async () => {
    await clearReadings()
    await refresh()
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

  // Второго пользователя показываем, только если он реально есть в данных.
  const hasSecondUser = useMemo(() => readings.some((r) => r.user !== 1), [readings])
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? ''
  const patientName = settings.userNames[settings.activeUser] ?? `Пользователь ${settings.activeUser}`

  if (!ready) return <div className="app" style={{ padding: 40, color: 'var(--text-muted)' }}>Загрузка…</div>

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__title">
          <h1>Дневник давления</h1>
          <span className="topbar__sub">Omron RS7 Intelli IT</span>
        </div>

        {hasSecondUser && (
          <div className="segmented" role="group" aria-label="Пользователь прибора">
            {[1, 2].map((user) => (
              <button
                key={user}
                aria-pressed={settings.activeUser === user}
                onClick={() => updateSettings({ ...settings, activeUser: user })}
              >
                {settings.userNames[user] ?? `Пользователь ${user}`}
              </button>
            ))}
          </div>
        )}

        <div className="segmented" role="group" aria-label="Период">
          {PERIODS.map((item) => (
            <button key={item.key} aria-pressed={period === item.key} onClick={() => setPeriod(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item.key} className="tab" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)}>
            {item.label}
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
                Откройте «Синхронизацию», чтобы выгрузить историю прямо из тонометра, либо внесите измерения вручную во
                вкладке «Измерения».
              </div>
            </Banner>
          ) : !summary ? (
            <Banner tone="info">
              За выбранный период измерений нет. Попробуйте период пошире — например, «Всё время».
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
                    <span className="muted">уд/мин</span>
                  </div>
                  <PulseChart readings={scoped} />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'readings' && (
        <div className="stack">
          <Entry user={settings.activeUser} onAdd={handleAdd} />
          <div className="card">
            <div className="card__head">
              <h2>История</h2>
              <span className="muted">
                {periodLabel.toLowerCase()} · {scoped.length} из {userReadings.length}
              </span>
            </div>
            <Readings readings={scoped} onDelete={handleDelete} />
          </div>
        </div>
      )}

      {tab === 'sync' && <Sync pairingKey={settings.pairingKey} onImport={handleImport} />}

      {tab === 'report' && (
        <Report
          readings={scoped}
          summary={summary}
          patient={patientName}
          periodLabel={periodLabel}
          targetSys={settings.targetSys}
          targetDia={settings.targetDia}
        />
      )}

      {tab === 'settings' && (
        <Settings
          settings={settings}
          onChange={updateSettings}
          readings={readings}
          onImport={handleImport}
          onClearAll={handleClearAll}
        />
      )}
    </div>
  )
}
