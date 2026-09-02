/**
 * Настройки в два уровня.
 *
 * До 0.8.0 это был один свиток из одиннадцати одинаковых карточек — восемь
 * экранов на телефоне и почти тринадцать при «Очень крупном» тексте, в порядке,
 * сложившемся по истории разработки: первым шло то, что убирает разделы из
 * нижней строки, последним — то, за чем сюда приходят.
 *
 * Теперь корень отвечает на вопрос «что здесь вообще есть»: единственный орган
 * управления — размер текста, ради которого сюда и приходит пожилой человек, —
 * и шесть строк со значениями, чтобы не открывать подэкран ради проверки.
 * Измерено: один экран обычным текстом и полтора при «Очень крупном» вместо
 * восьми и почти тринадцати. Самый длинный подэкран — копия дневника, два
 * экрана вместо десяти.
 *
 * Правила, общие для разных подэкранов, живут в `logic/settings.ts`: они
 * проверяются тестами без браузера, и разойтись двум их копиям негде.
 */

import type { Measurement, Medicine, Settings as SettingsData } from '../types'
import { Reminders } from './Reminders'
import type { ImportResult } from '../logic/io'
import { platform } from '../platform/ports'
import { activePersonOf, glucoseTargetsOf, targetsOf } from '../logic/people'
import { BackBar, NavRow, Reveal, Field } from './bits'
import { About } from './About'
import { parseChangelog } from '../logic/changelog'
import changelogSource from '../../CHANGELOG.md?raw'
import { BackupScreen } from './BackupScreen'
import { People, PersonScreen } from './People'
import type { BackupStatus } from './useBackup'
import {
  DENSITIES,
  SECTIONS,
  SUBSCREEN_TITLE,
  TEXT_SCALES,
  THEMES,
  describeBackupRow,
  describeDisplay,
  describePeople,
  describeReminders,
  describeSections,
  describeTargets,
  lockedSection,
  setGlucoseTargets,
  setTargets,
  setTrackGlucose,
  toggleSection,
  visibleSections,
  type Subscreen,
} from '../logic/settings'

/** История читается один раз: файл в бандле, и меняться в работе ему негде. */
const releases = parseChangelog(changelogSource)

type Общее = {
  settings: SettingsData
  onPatch: (fields: Partial<SettingsData>) => void
}

/**
 * Экран: тема, плотность и — в самом низу, свёрнутым — то, что меняет саму
 * навигацию. Спрятано не ради красоты: это единственное в настройках, чем
 * можно «сломать» приложение до неузнаваемости, убрав разделы снизу.
 */
function DisplayScreen({ settings, onPatch, onBack }: Общее & { onBack: () => void }) {
  const видимые = visibleSections(settings)
  const заперт = lockedSection(settings)

  return (
    <div className="stack">
      <BackBar label="К настройкам" onBack={onBack} />

      <div className="card">
        <div className="card__head">
          <h2>Экран</h2>
        </div>

        <div className="tile__label" style={{ marginBottom: 'var(--space-2)' }}>
          Тема
        </div>
        <div className="segmented segmented--fill" role="group" aria-label="Тема оформления">
          {THEMES.map(({ key, title }) => (
            <button key={key} aria-pressed={settings.theme === key} onClick={() => onPatch({ theme: key })}>
              {title}
            </button>
          ))}
        </div>

        <div className="tile__label" style={{ margin: 'var(--space-5) 0 var(--space-2)' }}>
          Плотность
        </div>
        <div className="segmented segmented--fill" role="group" aria-label="Плотность вёрстки">
          {DENSITIES.map(({ key, title }) => (
            <button key={key} aria-pressed={settings.density === key} onClick={() => onPatch({ density: key })}>
              {title}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 'var(--space-3)', marginBottom: 0 }}>
          Плотность меняет расстояния между блоками. Кнопки при этом не уменьшаются.
        </p>
      </div>

      <div className="card">
        <details>
          <summary>Что показывать внизу — {describeSections(settings)}</summary>

          <div className="stack" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            {SECTIONS.map((item) => (
              <label className="optrow__label" key={item.key}>
                <input
                  type="checkbox"
                  checked={settings.sections[item.key]}
                  disabled={заперт === item.key}
                  onChange={(event) => onPatch(toggleSection(settings, item.key, event.target.checked))}
                />
                <span className="optrow__title">
                  {item.title}
                  <span className="fact__note">
                    {заперт === item.key ? 'последний раздел — скрыть его нельзя' : item.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="muted" style={{ margin: 'var(--space-4) 0 0' }}>
            Записи скрытого раздела остаются на месте. Сахар включается на «Нормах».
          </p>

          <div style={{ marginTop: 'var(--space-5)' }}>
            <div className="tile__label" style={{ marginBottom: 'var(--space-2)' }}>
              С чего открывать приложение
            </div>
            <div className="segmented segmented--fill segmented--stack" role="group" aria-label="Стартовый экран">
              {видимые.map((key) => (
                <button key={key} aria-pressed={settings.startTab === key} onClick={() => onPatch({ startTab: key })}>
                  {SECTIONS.find((item) => item.key === key)?.title ?? 'Сахар'}
                </button>
              ))}
            </div>
          </div>
        </details>
      </div>
    </div>
  )
}

/** Нормы: целевое давление и дневник сахара с порогами — у каждого свои. */
function TargetsScreen({ settings, onPatch, onBack }: Общее & { onBack: () => void }) {
  const кто = activePersonOf(settings)
  const цель = targetsOf(кто, settings)
  const сахар = glucoseTargetsOf(кто, settings)
  const семья = settings.people.length > 1

  return (
    <div className="stack">
      <BackBar label="К настройкам" onBack={onBack} />

      <div className="card">
        <div className="card__head">
          <h2>Целевое давление</h2>
          {семья && <span className="muted">{кто?.name.trim() || 'выбранный человек'}</span>}
        </div>

        <div className="grid grid--two">
          <Field label="Верхнее">
            <input
              inputMode="numeric"
              value={цель.sys}
              onChange={(e) => onPatch(setTargets(settings, кто?.id ?? null, { ...цель, sys: Number(e.target.value) || 135 }))}
            />
          </Field>
          <Field label="Нижнее">
            <input
              inputMode="numeric"
              value={цель.dia}
              onChange={(e) => onPatch(setTargets(settings, кто?.id ?? null, { ...цель, dia: Number(e.target.value) || 85 }))}
            />
          </Field>
        </div>
        <div className="muted" style={{ marginTop: 'var(--space-3)' }}>
          135/85 — порог для измерений дома, он ниже кабинетного 140/90. Врач мог назначить другой.
          {семья && ' У каждого человека цель своя.'}
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Дневник сахара</h2>
        </div>

        <label className="optrow__label">
          <input
            type="checkbox"
            checked={settings.trackGlucose}
            onChange={(e) => onPatch(setTrackGlucose(settings, e.target.checked))}
          />
          <span className="optrow__title">
            Вести дневник сахара
            <span className="fact__note">появится рядом с давлением и в отчёте врачу</span>
          </span>
        </label>

        <Reveal open={settings.trackGlucose}>
          <div className="grid grid--two" style={{ marginTop: 'var(--space-4)' }}>
            <Field label="Норма натощак, ммоль/л">
              <input
                inputMode="decimal"
                value={сахар.fastingMax}
                onChange={(e) =>
                  onPatch(
                    setGlucoseTargets(settings, кто?.id ?? null, {
                      ...сахар,
                      fastingMax: Number(e.target.value.replace(',', '.')) || 7,
                    }),
                  )
                }
              />
            </Field>
            <Field label="Через 2 часа после еды">
              <input
                inputMode="decimal"
                value={сахар.postMealMax}
                onChange={(e) =>
                  onPatch(
                    setGlucoseTargets(settings, кто?.id ?? null, {
                      ...сахар,
                      postMealMax: Number(e.target.value.replace(',', '.')) || 10,
                    }),
                  )
                }
              />
            </Field>
            <Field label="Порог низкого сахара">
              <input
                inputMode="decimal"
                value={сахар.low}
                onChange={(e) =>
                  onPatch(
                    setGlucoseTargets(settings, кто?.id ?? null, {
                      ...сахар,
                      low: Number(e.target.value.replace(',', '.')) || 3.9,
                    }),
                  )
                }
              />
            </Field>
          </div>
          <div className="muted" style={{ marginTop: 'var(--space-3)' }}>
            Значения по умолчанию — общие ориентиры. При диабете цели назначает врач.
          </div>
        </Reveal>
      </div>
    </div>
  )
}

export function Settings({
  settings,
  onChange,
  measurements,
  medicines,
  onRestore,
  onClearAll,
  backup,
  screen,
  person,
  onOpen,
  onOpenPerson,
  onBack,
}: {
  settings: SettingsData
  onChange: (next: SettingsData) => void
  medicines: Medicine[]
  measurements: Measurement[]
  onRestore: (incoming: ImportResult) => Promise<{ added: number; medicines: number; settingsRestored: boolean }>
  onClearAll: () => Promise<void>
  backup: BackupStatus
  /**
   * Какой подэкран открыт. Приходит снаружи, из стека экранов приложения: на
   * подэкран ведут и глубокие ссылки с «Обзора», где эти настройки ещё не
   * отрисованы, и аппаратная «Назад», о которой знает только приложение.
   */
  screen: Subscreen | null
  /** Человек, чей экран открыт внутри «Людей». */
  person: string | null
  onOpen: (screen: Subscreen) => void
  onOpenPerson: (id: string) => void
  onBack: () => void
}) {
  const patch = (fields: Partial<SettingsData>) => onChange({ ...settings, ...fields })
  const напоминанияЕсть = platform().reminders.isSupported()

  if (screen === 'display') return <DisplayScreen settings={settings} onPatch={patch} onBack={onBack} />
  if (screen === 'targets') return <TargetsScreen settings={settings} onPatch={patch} onBack={onBack} />

  if (screen === 'people') {
    const открытый = settings.people.find((p) => p.id === person)
    if (открытый) {
      return (
        <PersonScreen
          person={открытый}
          settings={settings}
          medicines={medicines}
          onChange={patch}
          onBack={onBack}
        />
      )
    }
    return <People settings={settings} onChange={patch} onOpenPerson={onOpenPerson} onBack={onBack} />
  }

  if (screen === 'reminders') {
    return (
      <div className="stack">
        <BackBar label="К настройкам" onBack={onBack} />
        <Reminders
          medicines={medicines}
          enabled={settings.remindersOn}
          sound={settings.reminderSound}
          repeat={settings.remindersRepeat}
          onPatch={patch}
        />
      </div>
    )
  }

  if (screen === 'backup') {
    return (
      <BackupScreen
        settings={settings}
        onPatch={patch}
        measurements={measurements}
        onRestore={onRestore}
        onClearAll={onClearAll}
        backup={backup}
        onBack={onBack}
      />
    )
  }

  if (screen === 'about') {
    return (
      <div className="stack">
        <BackBar label="К настройкам" onBack={onBack} />
        <About releases={releases} />
      </div>
    )
  }

  // ── корень ───────────────────────────────────────────────────────────────
  return (
    <div className="stack">
      {/* Размер текста — единственная настройка, за которой приходят каждый
          раз, и единственная, которую нельзя прятать за строкой списка: её
          выбирают именно тогда, когда мелкий текст плохо читается. */}
      <div className="card">
        <div className="card__head">
          <h2>Размер текста</h2>
        </div>
        <div className="segmented segmented--fill segmented--stack" role="group" aria-label="Размер текста">
          {TEXT_SCALES.map(({ key, title }) => (
            <button key={key} aria-pressed={settings.textScale === key} onClick={() => patch({ textScale: key })}>
              {title}
            </button>
          ))}
        </div>
        {/* Образец меняется вместе с настройкой: выбирать размер вслепую, а
            потом искать, где посмотреть результат, — лишний шаг там, где он не
            нужен. Подписи под образцом нет: он и так стоит под переключателем,
            а при «Очень крупном» каждая лишняя строка — это четверть экрана. */}
        <div className="sample">
          <div style={{ fontSize: 'var(--fs-3)', fontWeight: 600 }}>Утренний приём — 08:00</div>
          <div style={{ fontSize: 'var(--fs-2)', marginTop: 'var(--space-2)' }}>Периндоприл 5 мг, до еды</div>
        </div>
      </div>

      <div className="card">
        <ul className="pills">
          <NavRow title={SUBSCREEN_TITLE.display} value={describeDisplay(settings)} onOpen={() => onOpen('display')} />
          <NavRow title={SUBSCREEN_TITLE.people} value={describePeople(settings.people)} onOpen={() => onOpen('people')} />
          <NavRow title={SUBSCREEN_TITLE.targets} value={describeTargets(settings, activePersonOf(settings))} onOpen={() => onOpen('targets')} />
          {/* В браузере настоящих напоминаний нет вовсе, и строки тоже. */}
          {напоминанияЕсть && (
            <NavRow
              title={SUBSCREEN_TITLE.reminders}
              value={describeReminders(settings)}
              onOpen={() => onOpen('reminders')}
            />
          )}
          <NavRow
            title={SUBSCREEN_TITLE.backup}
            value={describeBackupRow(backup.lastAt, Date.now())}
            onOpen={() => onOpen('backup')}
          />
          <NavRow title={SUBSCREEN_TITLE.about} value={releases[0]?.version} onOpen={() => onOpen('about')} />
        </ul>
      </div>
    </div>
  )
}
