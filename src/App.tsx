import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isBp, isGlucose, type Measurement, type Medicine, type Settings as SettingsData } from './types'
import {
  DEFAULT_SETTINGS,
  addNewMeasurements,
  clearMeasurements,
  deleteMeasurement,
  getAllMeasurements,
  getAllMedicines,
  loadSettings,
  deleteMedicine,
  newMedicineId,
  putMeasurements,
  putMedicine,
  saveSettings,
} from './db/store'
import { PERIODS, filterByPeriod, summarize, summarizeGlucose, type PeriodKey } from './logic/stats'
import type { GlucoseTargets } from './logic/classify'
import { DayPartChart, GlucoseChart, PulseChart, TrendChart } from './ui/Charts'
import { LatestAlert, SummaryTiles } from './ui/Summary'
import { GlucoseEntry, GlucoseList, GlucoseTiles } from './ui/Glucose'
import { Readings } from './ui/Readings'
import { Medicines, MedicineNudge } from './ui/Medicines'
import { Entry } from './ui/Entry'
import { Sync } from './ui/Sync'
import { countAlerts, pendingToday } from './logic/medicines'
import type { ImportResult } from './logic/io'
import { applyTheme } from './ui/theme'
import { useBackup } from './ui/useBackup'
import { BackupNudge } from './ui/Backup'
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
type DiaryKey = 'bp' | 'glucose' | 'meds'

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
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [settings, setSettings] = useState<SettingsData>(DEFAULT_SETTINGS)
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [tab, setTab] = useState<TabKey>('overview')
  const [diary, setDiary] = useState<DiaryKey>('bp')
  const [ready, setReady] = useState(false)
  const [undo, setUndo] = useState<Measurement | null>(null)
  // ReturnType, а не number: в браузере таймер это число, в Node — объект.
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    Promise.all([getAllMeasurements(), loadSettings(), getAllMedicines()]).then(([stored, loaded, pills]) => {
      setMeasurements(stored)
      setMedicines(pills)
      // Дневник сахара включается сам, если данные по нему уже есть.
      setSettings(loaded.trackGlucose || stored.some(isGlucose) ? { ...loaded, trackGlucose: true } : loaded)
      setReady(true)
    })
    return () => clearTimeout(undoTimer.current)
  }, [])

  // Тему ставит и скрипт в index.html — до первой отрисовки. Здесь она
  // приводится в соответствие с настройками: они главный источник истины.
  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  const refresh = useCallback(async () => setMeasurements(await getAllMeasurements()), [])
  const refreshMedicines = useCallback(async () => setMedicines(await getAllMedicines()), [])

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
      clearTimeout(undoTimer.current)
      undoTimer.current = setTimeout(() => setUndo(null), 8000)
    },
    [measurements, refresh],
  )

  /**
   * Правка записи. Идентификатор не меняется даже при правке времени — и это
   * важно: повторная выгрузка с прибора пропускает записи, чьи идентификаторы
   * уже есть, поэтому исправление переживёт следующую синхронизацию.
   */
  const handleUpdate = useCallback(
    async (next: Measurement) => {
      await putMeasurements([next])
      await refresh()
    },
    [refresh],
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

  /** Настройки читаются из ссылки: восстановление не должно пересоздаваться при каждой правке. */
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  /**
   * Восстановление из резервной копии. В отличие от импорта измерений, здесь
   * возвращается всё, что человек вводил руками: дневник, аптечка, настройки.
   *
   * Слияние только добавляющее. Копия — снимок прошлого, и перезаписывать ею
   * то, что уже есть на этом устройстве, значит откатывать более свежие правки.
   */
  const handleRestore = useCallback(
    async (incoming: ImportResult) => {
      const added = await addNewMeasurements(incoming.measurements)

      const known = new Set((await getAllMedicines()).map((m) => m.id))
      const freshMedicines = incoming.medicines.filter((m) => !known.has(m.id))
      for (const item of freshMedicines) await putMedicine(item)

      let settingsRestored = false
      if (incoming.settings) {
        // Тема не переносится: на телефоне и на компьютере она своя, и подменять
        // её чужим выбором — сюрприз, которого никто не просил.
        const { theme: _theme, ...rest } = incoming.settings
        updateSettings({ ...settingsRef.current, ...rest })
        settingsRestored = true
      }

      await refresh()
      await refreshMedicines()
      return { added: added.length, medicines: freshMedicines.length, settingsRestored }
    },
    [refresh, refreshMedicines, updateSettings],
  )

  const handleSaveMedicine = useCallback(
    async (item: Medicine) => {
      await putMedicine(item.id ? item : { ...item, id: newMedicineId() })
      await refreshMedicines()
    },
    [refreshMedicines],
  )

  const handleDeleteMedicine = useCallback(
    async (id: string) => {
      await deleteMedicine(id)
      await refreshMedicines()
    },
    [refreshMedicines],
  )

  /** Сколько препаратов требуют внимания — для плашки на обзоре. */
  const medicineAlerts = useMemo(() => countAlerts(medicines, Date.now()), [medicines])

  /**
   * Пометка на переключателе значит «есть на что посмотреть»: либо приём не
   * отмечен, либо что-то кончается. Считать там нечего, важен сам факт.
   */
  const medicineMark = useMemo(
    () => medicineAlerts > 0 || pendingToday(medicines.filter((m) => !m.autoDeduct), Date.now()) > 0,
    [medicines, medicineAlerts],
  )

  const backup = useBackup(measurements, medicines, settings, updateSettings, ready)

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

  /**
   * Переключатель дневников. Аптечка живёт здесь, а не отдельной вкладкой:
   * шестой пункт в нижней навигации сузил бы каждый до нечитаемого, а по смыслу
   * это тот же раздел «что я вношу руками».
   */
  const diaryPicker = (
    <div className="segmented segmented--fill no-print" role="group" aria-label="Дневник">
      <button aria-pressed={diary === 'bp'} onClick={() => setDiary('bp')}>
        Давление
      </button>
      {showGlucose && (
        <button aria-pressed={diary === 'glucose'} onClick={() => setDiary('glucose')}>
          Сахар
        </button>
      )}
      <button aria-pressed={diary === 'meds'} onClick={() => setDiary('meds')}>
        Аптечка
        {medicineMark && <span className="segmented__mark" aria-hidden="true" />}
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

          {/* Предупреждение о копии стоит здесь, а не в настройках: до настроек
              человек не дойдёт, а потеря дневника необратима. */}
          <BackupNudge status={backup} onOpenSettings={() => setTab('settings')} />

          <MedicineNudge
            count={medicineAlerts}
            onOpen={() => {
              setDiary('meds')
              setTab('readings')
            }}
          />

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
          <div className="row">{diaryPicker}</div>

          {diary === 'meds' ? (
            <Medicines medicines={medicines} onSave={handleSaveMedicine} onDelete={handleDeleteMedicine} />
          ) : diary === 'bp' || !showGlucose ? (
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
                <Readings readings={bpScoped} onDelete={handleDelete} onUpdate={handleUpdate} />
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
                <GlucoseList readings={glucoseScoped} targets={glucoseTargets} onDelete={handleDelete} onUpdate={handleUpdate} />
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

      {tab === 'sync' && (
        <Sync
          pairingKey={settings.pairingKey}
          onImport={handleImport}
          onImportGlucose={handleImport}
          onGoManual={() => setTab('readings')}
          showGlucose={showGlucose}
        />
      )}

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
          medicines={medicines}
          onPeriodChange={setPeriod}
        />
      )}

      {tab === 'settings' && (
        <Settings
          settings={settings}
          onChange={updateSettings}
          measurements={measurements}
          onRestore={handleRestore}
          onClearAll={handleClearAll}
          showUserPicker={hasSecondUser}
          backup={backup}
        />
      )}
    </div>
  )
}
