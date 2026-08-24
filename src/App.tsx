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
import { MedicineNudge } from './ui/Medicines'
import { Intake } from './ui/Intake'
import { Cabinet } from './ui/Cabinet'
import { Entry } from './ui/Entry'
import { Sync } from './ui/Sync'
import {
  countAlerts,
  dosesOn,
  markTakenAt,
  normalizeTimes,
  parseTime,
  pendingToday,
  startOfDay,
} from './logic/medicines'
import type { ImportResult } from './logic/io'
import { applyTheme } from './ui/theme'
import { useBackup } from './ui/useBackup'
import { useReminders } from './ui/useReminders'
import { BackupNudge } from './ui/Backup'
import { Settings } from './ui/Settings'
import { Report } from './ui/Report'
import { Banner, Reveal } from './ui/bits'

/**
 * Разделы нижней навигации.
 *
 * Раньше давление, сахар и лекарства прятались за сегментированным
 * переключателем внутри «Записей» — до нужного дневника было два касания.
 * Теперь каждый живёт своим пунктом. `section` связывает пункт с настройкой
 * видимости: у одного пользователя все три дневника, у другого только лекарства.
 *
 * Короткая подпись — для нижней строки на телефоне, где на пункт приходится
 * около 70px. Значков без подписей здесь нет намеренно: пожилые их не узнают.
 */
const TABS = [
  { key: 'overview', label: 'Обзор', short: 'Обзор', section: 'overview' },
  { key: 'bp', label: 'Давление', short: 'Давление', section: 'bp' },
  { key: 'glucose', label: 'Сахар', short: 'Сахар', section: 'glucose' },
  { key: 'intake', label: 'Приём лекарств', short: 'Приём', section: 'intake' },
  { key: 'cabinet', label: 'Аптечка', short: 'Аптечка', section: 'cabinet' },
] as const

/** Разделы вне нижней строки: к ним обращаются редко, значок в шапке достаточен. */
const TOOLS = [
  { key: 'sync', label: 'Прибор' },
  { key: 'report', label: 'Отчёт' },
  { key: 'settings', label: 'Настройки' },
] as const

type TabKey = (typeof TABS)[number]['key'] | (typeof TOOLS)[number]['key']

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
  /** Растёт при повторном нажатии на активную вкладку — сигнал разделу вернуться в начало. */
  const [rootSignal, setRootSignal] = useState(0)
  /** Стартовый экран из настроек применяется один раз, после загрузки данных. */
  const started = useRef(false)
  /** Приложение открылось нажатием по напоминанию — стартовый экран не навязываем. */
  const openedByReminder = useRef(false)
  /** День из напоминания: экран приёма обязан открыться именно на нём. */
  const [reminderDay, setReminderDay] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  /** Хранилище не ответило. Молчать нельзя: экран «Загрузка…» висел бы вечно. */
  const [storageFailed, setStorageFailed] = useState(false)
  const [undo, setUndo] = useState<Measurement | null>(null)
  // ReturnType, а не number: в браузере таймер это число, в Node — объект.
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    /**
     * Хранилище может не ответить вовсе: другая вкладка держит обновление схемы,
     * браузер вытеснил базу, приватный режим запретил её. Запрос при этом не
     * падает, а просто молчит — без срока приложение остаётся на «Загрузка…»
     * навсегда, и человек думает, что потерял все записи.
     */
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('хранилище не ответило')), 8000),
    )

    Promise.race([
      Promise.all([getAllMeasurements(), loadSettings(), getAllMedicines()]),
      timeout,
    ]).then(([stored, loaded, pills]) => {
      setMeasurements(stored)
      setMedicines(pills)
      // Дневник сахара включается сам, если данные по нему уже есть.
      setSettings(loaded.trackGlucose || stored.some(isGlucose) ? { ...loaded, trackGlucose: true } : loaded)
      // Стартовый экран применяется один раз при загрузке: дальше человек
      // переключается сам, и возвращать его к «своему» экрану было бы навязчиво.
      //
      // Нажатие по уведомлению — тоже «дальше»: приложение при этом запускается
      // с нуля, и система отдаёт событие раньше, чем дочитывается база. Без
      // этой оговорки человек, нажавший на напоминание, попадал не на экран
      // приёма, а на «Обзор» — и не понимал, куда делась таблетка.
      if (!started.current) {
        started.current = true
        if (loaded.startTab && !openedByReminder.current) setTab(loaded.startTab as TabKey)
      }
      setReady(true)
    }).catch(() => setStorageFailed(true))
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
      // День заведения проставляется здесь и только здесь — в единственном
      // месте, где препарат появляется в аптечке. Без него расписание
      // распространилось бы на всё прошлое, и свежий препарат показал бы
      // пропуски за два месяца назад.
      await putMedicine(item.id ? item : { ...item, id: newMedicineId(), since: Date.now() })
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

  // Напоминания живут здесь, а не на экране настроек: расписание правится в
  // аптечке, и пересобирать набор надо в тот же момент, а не при следующем
  // заходе в настройки.
  /**
   * «Принял» нажато прямо в уведомлении.
   *
   * Отмечаются все препараты этого приёма, у которых отметки ещё нет: в
   * уведомлении они перечислены вместе, и человек, нажимая одну кнопку, имеет
   * в виду именно их. Отметка ставится на **назначенное** время, а не на
   * текущее, — иначе повтор в 8:45 записался бы отдельным приёмом.
   */
  const handleReminderTaken = useCallback(
    async (day: number, slot: string) => {
      const minutes = parseTime(slot)
      if (minutes === null) return
      // День приводим к местной полуночи заново. Уведомление несёт момент,
      // посчитанный в том поясе, где оно ставилось; после перелёта или перевода
      // часов простое сложение дало бы время из другого дня, и отметка легла бы
      // не на тот приём.
      const planned = startOfDay(day) + minutes * 60_000
      const now = Date.now()

      // Аптечка читается из хранилища, а не берётся из состояния экрана.
      //
      // Это не перестраховка. Нажатие «Принял» на заблокированном экране
      // запускает приложение с нуля, и система отдаёт удержанное событие
      // раньше, чем успевает прочитаться база: в состоянии в этот момент
      // пустой список, цикл не делает ни одного оборота, отметка не ставится,
      // а следом приходят три повтора «приём не отмечен». То есть главный
      // сценарий, ради которого кнопка и делалась, молча не работал.
      const cabinet = await getAllMedicines()

      for (const medicine of cabinet) {
        if (!normalizeTimes(medicine.times ?? []).includes(slot)) continue
        const dose = dosesOn(medicine, day, now).find((item) => item.time === slot)
        if (dose && dose.takenAt !== null) continue
        await putMedicine(markTakenAt(medicine, planned, now))
      }
      await refreshMedicines()
      setTab('intake')
    },
    [refreshMedicines],
  )

  useReminders({
    medicines,
    enabled: settings.remindersOn,
    sound: settings.reminderSound,
    repeat: settings.remindersRepeat,
    ready,
    onOpen: (day) => {
      openedByReminder.current = true
      setReminderDay(startOfDay(day))
      setTab('intake')
    },
    onTaken: (day, slot) => {
      openedByReminder.current = true
      setReminderDay(startOfDay(day))
      void handleReminderTaken(day, slot)
    },
  })

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
  const showGlucose = (settings.trackGlucose || glucoseAll.length > 0) && settings.sections.glucose

  /**
   * Видимые разделы нижней строки.
   *
   * Состав меняется только прямым действием в настройках — исчезающие и
   * появляющиеся вкладки сбивают с толку сильнее, чем лишний пункт. Скрыть
   * можно любой раздел, включая обзор: он собран из сводок давления и сахара и
   * при выключенных дневниках пуст.
   *
   * Пустым список стать не должен — настройки не отдают последний раздел. Но
   * файл резервной копии приходит снаружи, и если в нём выключено всё, лучше
   * показать обзор, чем приложение без единой вкладки.
   */
  const shownTabs = TABS.filter((item) =>
    item.section === 'glucose' ? showGlucose : settings.sections[item.section],
  )
  const visibleTabs = shownTabs.length > 0 ? shownTabs : TABS.filter((item) => item.key === 'overview')

  /**
   * Если раздел спрятали прямо из-под ног, уходим на первый оставшийся.
   *
   * Без этого человек остаётся на экране, которого больше нет в навигации:
   * содержимое видно, а вернуться некуда — ни одна вкладка не подсвечена.
   * То же при стартовом экране, указывающем на скрытый раздел.
   */
  const tabExists = visibleTabs.some((item) => item.key === tab) || TOOLS.some((item) => item.key === tab)
  const fallbackTab = visibleTabs[0].key
  useEffect(() => {
    if (!tabExists) setTab(fallbackTab)
  }, [tabExists, fallbackTab])
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? ''
  const patientName = settings.userNames[settings.activeUser] ?? `Пользователь ${settings.activeUser}`

  if (storageFailed) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="topbar__title">
            <h1>Дневник здоровья</h1>
          </div>
        </header>
        <div className="card">
          <div className="card__head">
            <h2>Не удалось открыть хранилище</h2>
          </div>
          <p style={{ margin: '0 0 var(--space-4)' }}>
            Браузер не отдал сохранённые записи. Чаще всего это значит, что дневник открыт ещё в одной вкладке и она
            держит базу — закройте лишние вкладки и попробуйте снова.
          </p>
          <p className="muted" style={{ margin: '0 0 var(--space-4)' }}>
            Записи при этом никуда не делись. Если повторится и после перезапуска браузера — восстановите дневник из
            резервной копии: приложение читает её обычным файлом.
          </p>
          <button className="btn btn--primary" onClick={() => window.location.reload()}>
            Попробовать снова
          </button>
        </div>
      </div>
    )
  }

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

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__title">
          <h1>Дневник здоровья</h1>
          <span className="topbar__sub">давление, сахар и лекарства</span>
        </div>

        {/* Прибор, отчёт и настройки — редкие разделы. В нижней строке они
            вытеснили бы ежедневные, а прятать ежедневное нельзя. Подпись у
            каждого обязательна: значок без слова пожилой человек не узнаёт. */}
        <nav className="tools no-print" aria-label="Служебные разделы">
          {TOOLS.map((item) => (
            <button
              key={item.key}
              className="tool"
              aria-current={tab === item.key ? 'page' : undefined}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <nav
        className="tabs"
        aria-label="Разделы дневника"
        style={{ ['--tab-count' as string]: visibleTabs.length }}
      >
        {visibleTabs.map((item) => (
          <button
            key={item.key}
            className="tab"
            aria-current={tab === item.key ? 'page' : undefined}
            aria-label={item.label}
            onClick={() => {
              // Повторное нажатие по своей же вкладке возвращает раздел в
              // начало: из карточки препарата — к списку, из формы — назад. Так
              // ведут себя нижние панели в iOS и Android, и человек, зашедший
              // вглубь, жмёт именно сюда. Без этого вкладка подсвечена, а экран
              // всё тот же, и выход приходится искать.
              if (item.key === tab) setRootSignal((value) => value + 1)
              setTab(item.key)
            }}
          >
            <span className="tab__full">{item.label}</span>
            <span className="tab__short">{item.short}</span>
            {item.key === 'intake' && medicineMark && <span className="tab__mark" aria-hidden="true" />}
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
            onOpen={() => setTab('cabinet')}
          />

          {measurements.length === 0 ? (
            <Banner tone="info">
              <b>Дневник пока пуст.</b>
              <div style={{ marginTop: 4 }}>
                Откройте «Прибор», чтобы выгрузить историю прямо из тонометра, либо внесите измерение вручную во
                вкладке «Давление».
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

      {tab === 'bp' && (
        <div className="stack">
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

          {!showGlucose && settings.sections.glucose && (
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
                  setTab('glucose')
                }}
              >
                Включить дневник сахара
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'glucose' && (
        <div className="stack">
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
            <GlucoseList
              readings={glucoseScoped}
              targets={glucoseTargets}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          </div>
        </div>
      )}

      {tab === 'intake' && (
        <Intake medicines={medicines} onSave={handleSaveMedicine} toRoot={rootSignal} openDay={reminderDay} />
      )}

      {tab === 'cabinet' && (
        <>
          {undoBanner}
          <Cabinet
            medicines={medicines}
            onSave={handleSaveMedicine}
            onDelete={handleDeleteMedicine}
            toRoot={rootSignal}
          />
        </>
      )}

      {tab === 'sync' && (
        <Sync
          pairingKey={settings.pairingKey}
          onImport={handleImport}
          onImportGlucose={handleImport}
          onGoManual={() => setTab('bp')}
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
          medicines={medicines}
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
