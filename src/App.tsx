import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isBp, isGlucose, type Measurement, type Settings as SettingsData } from './types'
import {
  DEFAULT_SETTINGS,
  addNewMeasurements,
  clearMeasurements,
  deleteMeasurement,
  getAllMeasurements,
  loadSettings,
  putMeasurements,
  saveSettings,
} from './db/store'
import { PERIODS, filterByPeriod, summarize, summarizeGlucose, type PeriodKey } from './logic/stats'
import type { GlucoseTargets } from './logic/classify'
import { DayPartChart, GlucoseChart, PulseChart, TrendChart } from './ui/Charts'
import { LatestAlert, SummaryTiles } from './ui/Summary'
import { GlucoseEntry, GlucoseList, GlucoseTiles } from './ui/Glucose'
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
type DiaryKey = 'bp' | 'glucose'

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
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [tab, setTab] = useState<TabKey>('overview')
  const [diary, setDiary] = useState<DiaryKey>('bp')
  const [ready, setReady] = useState(false)
  const [undo, setUndo] = useState<Measurement | null>(null)
  const undoTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    Promise.all([getAllMeasurements(), loadSettings()]).then(([stored, loaded]) => {
      setMeasurements(stored)
      // Дневник сахара включается сам, если данные по нему уже есть.
      setSettings(loaded.trackGlucose || stored.some(isGlucose) ? { ...loaded, trackGlucose: true } : loaded)
      setReady(true)
    })
    return () => window.clearTimeout(undoTimer.current)
  }, [])

  const refresh = useCallback(async () => setMeasurements(await getAllMeasurements()), [])

  const handleAdd = useCallback(
    async (item: Measurement) => {
      await putMeasurements([item])
      await refresh()
    },
    [refresh],
  )

  const handleImport = useCallback(
    async (incoming: Measurement[]) => {
      const added = await addNewMeasurements(incoming)
      await refresh()
      return added.length
    },
    [refresh],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      const victim = measurements.find((m) => m.id === id) ?? null
      await deleteMeasurement(id)
      await refresh()
      setUndo(victim)
      window.clearTimeout(undoTimer.current)
      undoTimer.current = window.setTimeout(() => setUndo(null), 8000)
    },
    [measurements, refresh],
  )

  const handleUndo = useCallback(async () => {
    if (!undo) return
    await putMeasurements([undo])
    await refresh()
    setUndo(null)
  }, [undo, refresh])

  const handleClearAll = useCallback(async () => {
    await clearMeasurements()
    await refresh()
    setUndo(null)
  }, [refresh])

  const updateSettings = useCallback((next: SettingsData) => {
    setSettings(next)
    void saveSettings(next)
  }, [])

  const glucoseTargets: GlucoseTargets = useMemo(
    () => ({
      fastingMax: settings.glucoseFastingMax,
      postMealMax: settings.glucosePostMealMax,
      low: settings.glucoseLow,
    }),
    [settings.glucoseFastingMax, settings.glucosePostMealMax, settings.glucoseLow],
  )

  const mine = useMemo(() => measurements.filter((m) => m.user === settings.activeUser), [measurements, settings.activeUser])
  const bpAll = useMemo(() => mine.filter(isBp), [mine])
  const glucoseAll = useMemo(() => mine.filter(isGlucose), [mine])

  const bpScoped = useMemo(() => filterByPeriod(bpAll, period), [bpAll, period])
  const glucoseScoped = useMemo(() => filterByPeriod(glucoseAll, period), [glucoseAll, period])

  const summary = useMemo(
    () => summarize(bpScoped, settings.targetSys, settings.targetDia),
    [bpScoped, settings.targetSys, settings.targetDia],
  )
  const glucoseSummary = useMemo(() => summarizeGlucose(glucoseScoped, glucoseTargets), [glucoseScoped, glucoseTargets])

  const latestBp = bpAll.length ? bpAll[bpAll.length - 1] : null
  const hasSecondUser = useMemo(() => measurements.some((m) => m.user !== 1), [measurements])
  const showGlucose = settings.trackGlucose || glucoseAll.length > 0
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? ''
  const patientName = settings.userNames[settings.activeUser] ?? `Пользователь ${settings.activeUser}`

  if (!ready) {
    return (
      <div className="app" style={{ padding: 40, color: 'var(--text-muted)' }}>
        Загрузка…
      </div>
    )
  }

  const undoBanner = (
    <Reveal open={undo !== null}>
      <div className="no-print" style={{ paddingBottom: 'var(--space-3)' }}>
        <Banner tone="info">
          <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
            <span>Запись удалена.</span>
            <button className="btn" onClick={handleUndo}>
              Вернуть
            </button>
          </div>
        </Banner>
      </div>
    </Reveal>
  )

  const diaryPicker = showGlucose && (
    <div className="segmented no-print" role="group" aria-label="Дневник">
      <button aria-pressed={diary === 'bp'} onClick={() => setDiary('bp')}>
        Давление
      </button>
      <button aria-pressed={diary === 'glucose'} onClick={() => setDiary('glucose')}>
        Сахар
      </button>
    </div>
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__title">
          <h1>Дневник здоровья</h1>
          <span className="topbar__sub">давление и сахар</span>
        </div>
      </header>

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
          <LatestAlert latest={latestBp} />

          {measurements.length === 0 ? (
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

              {summary && (
                <>
                  <SummaryTiles summary={summary} targetSys={settings.targetSys} targetDia={settings.targetDia} />

                  <div className="card">
                    <div className="card__head">
                      <h2>Динамика давления</h2>
                      <span className="muted">точки — измерения, линия — среднее за 7 дней</span>
                    </div>
                    <TrendChart readings={bpScoped} targetSys={settings.targetSys} targetDia={settings.targetDia} />
                  </div>

                  <div className="grid grid--two">
                    <div className="card">
                      <div className="card__head">
                        <h2>По времени суток</h2>
                      </div>
                      <DayPartChart readings={bpScoped} />
                    </div>
                    <div className="card">
                      <div className="card__head">
                        <h2>Пульс</h2>
                        <span className="muted">ударов в минуту</span>
                      </div>
                      <PulseChart readings={bpScoped} />
                    </div>
                  </div>
                </>
              )}

              {glucoseSummary && (
                <>
                  <GlucoseTiles summary={glucoseSummary} targets={glucoseTargets} />
                  <div className="card">
                    <div className="card__head">
                      <h2>Динамика сахара</h2>
                      <span className="muted">ммоль/л, линия — среднее за 7 дней</span>
                    </div>
                    <GlucoseChart readings={glucoseScoped} targets={glucoseTargets} />
                  </div>
                </>
              )}

              {!summary && !glucoseSummary && (
                <Banner tone="info">
                  За выбранный период записей нет. Возьмите период пошире — например, «Всё время».
                </Banner>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'readings' && (
        <div className="stack">
          {diaryPicker && <div className="row">{diaryPicker}</div>}

          {diary === 'bp' || !showGlucose ? (
            <>
              <Entry user={settings.activeUser} onAdd={handleAdd} />
              {undoBanner}
              <div className="card">
                <div className="card__head">
                  <h2>История давления</h2>
                  <span className="muted">
                    {bpScoped.length} из {bpAll.length}
                  </span>
                </div>
                <div className="row no-print" style={{ marginBottom: 'var(--space-3)' }}>
                  <PeriodPicker value={period} onChange={setPeriod} />
                </div>
                <Readings readings={bpScoped} onDelete={handleDelete} />
              </div>
            </>
          ) : (
            <>
              <GlucoseEntry user={settings.activeUser} targets={glucoseTargets} onAdd={handleAdd} />
              {undoBanner}
              <div className="card">
                <div className="card__head">
                  <h2>История сахара</h2>
                  <span className="muted">
                    {glucoseScoped.length} из {glucoseAll.length}
                  </span>
                </div>
                <div className="row no-print" style={{ marginBottom: 'var(--space-3)' }}>
                  <PeriodPicker value={period} onChange={setPeriod} />
                </div>
                <GlucoseList readings={glucoseScoped} targets={glucoseTargets} onDelete={handleDelete} />
              </div>
            </>
          )}

          {!showGlucose && (
            <div className="card no-print">
              <div className="card__head">
                <h2>Ведёте ещё и сахар?</h2>
              </div>
              <p style={{ margin: '0 0 var(--space-4)', color: 'var(--text-secondary)' }}>
                Дневник глюкозы живёт рядом с дневником давления: те же графики, тот же отчёт для врача, общая шкала
                времени. Включается одной кнопкой и так же выключается.
              </p>
              <button
                className="btn btn--primary"
                onClick={() => {
                  updateSettings({ ...settings, trackGlucose: true })
                  setDiary('glucose')
                }}
              >
                Включить дневник сахара
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'sync' && <Sync pairingKey={settings.pairingKey} onImport={handleImport} onGoManual={() => setTab('readings')} />}

      {tab === 'report' && (
        <Report
          readings={bpScoped}
          summary={summary}
          glucoseReadings={glucoseScoped}
          glucoseSummary={glucoseSummary}
          glucoseTargets={glucoseTargets}
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
          measurements={measurements}
          onImport={handleImport}
          onClearAll={handleClearAll}
          showUserPicker={hasSecondUser}
        />
      )}
    </div>
  )
}
