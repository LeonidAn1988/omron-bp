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
import { FamilyScreen } from './Family'
import { PHARMACIES, describePharmacies } from '../logic/pharmacies'
import { People, PersonScreen } from './People'
import type { BackupStatus } from './useBackup'
import type { FamilySyncStatus } from './useFamilySync'
import {
  DENSITIES,
  SECTIONS,
  SUBSCREEN_TITLE,
  TEXT_SCALES,
  THEMES,
  describeBackupRow,
  describeDisplay,
  describeFamily,
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
      <BackBar onBack={onBack} />

      <div className="card">
        <div className="card__head">
          <h2>Экран</h2>
        </div>

        {/* Размер текста первым: за ним сюда и приходят. В корне настроек он
            стоял отдельной карточкой, но там он единственный орган управления
            среди списка разделов — а место ему рядом с темой и плотностью. */}
        <div className="tile__label" style={{ marginBottom: 'var(--space-2)' }}>
          Размер текста
        </div>
        <div className="segmented segmented--fill segmented--stack" role="group" aria-label="Размер текста">
          {TEXT_SCALES.map(({ key, title }) => (
            <button key={key} aria-pressed={settings.textScale === key} onClick={() => onPatch({ textScale: key })}>
              {title}
            </button>
          ))}
        </div>
        <div className="sample">
          <div style={{ fontSize: 'var(--fs-3)', fontWeight: 600 }}>Утренний приём — 08:00</div>
          <div style={{ fontSize: 'var(--fs-2)', marginTop: 'var(--space-2)' }}>Периндоприл 5 мг, до еды</div>
        </div>

        <div className="tile__label" style={{ margin: 'var(--space-5) 0 var(--space-2)' }}>
          Тема
        </div>
        {/* Чипами, а не тремя равными долями: «Как в системе» в треть ширины не
            помещается и ломается пополам уже при обычном тексте. Чип переносится
            целиком и остаётся читаемым. */}
        <div className="segmented segmented--chips" role="group" aria-label="Тема оформления">
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
            {/* Тоже чипами: разделов до пяти, и «Приём лекарств» в равной доле
                не умещается. */}
            <div className="segmented segmented--chips" role="group" aria-label="Стартовый экран">
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

/**
 * Аптеки: где искать лекарства из списка покупок.
 *
 * Приложение никуда не ходит само — оно только собирает ссылку на поиск. Про
 * наличие и цену здесь ничего не обещается: у сетей нет открытых интерфейсов,
 * и знать остаток аптеки мы не можем.
 */
function PharmaciesScreen({ settings, onPatch, onBack }: Общее & { onBack: () => void }) {
  const выбраны = settings.pharmacies ?? []
  const переключить = (id: string, on: boolean) =>
    onPatch({ pharmacies: on ? [...выбраны, id] : выбраны.filter((item) => item !== id) })

  return (
    <div className="stack">
      <BackBar onBack={onBack} />

      <div className="card">
        <div className="card__head">
          <h2>Аптеки</h2>
          <span className="muted">где искать то, что заканчивается</span>
        </div>

        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          {PHARMACIES.map((item) => (
            <label className="optrow__label" key={item.id}>
              <input
                type="checkbox"
                checked={выбраны.includes(item.id)}
                onChange={(event) => переключить(item.id, event.target.checked)}
              />
              <span className="optrow__title">{item.name}</span>
            </label>
          ))}
        </div>

        <p className="muted" style={{ margin: 'var(--space-4) 0 0' }}>
          Кнопки выбранных аптек появятся у препарата и в списке покупок. Наличие и цену приложение не знает.
        </p>
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
      <BackBar onBack={onBack} />

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
  family,
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
  /** Семейный обмен: список телефонов и что принесло последнее чтение. */
  family: FamilySyncStatus
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
  if (screen === 'pharmacies') return <PharmaciesScreen settings={settings} onPatch={patch} onBack={onBack} />

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
        <BackBar onBack={onBack} />
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
        familyPhones={family.sources.length}
        onBack={onBack}
      />
    )
  }

  if (screen === 'family') {
    return (
      <FamilyScreen
        family={family}
        target={backup.target}
        busy={backup.busy}
        onChooseTarget={() => void backup.chooseTarget()}
        onBack={onBack}
      />
    )
  }

  if (screen === 'about') {
    return (
      <div className="stack">
        <BackBar onBack={onBack} />
        <About releases={releases} />
      </div>
    )
  }

  // ── корень ───────────────────────────────────────────────────────────────
  return (
    <div className="stack">
      <div className="card">
        <ul className="pills">
          <NavRow title={SUBSCREEN_TITLE.display} value={describeDisplay(settings)} onOpen={() => onOpen('display')} />
          <NavRow
            title={SUBSCREEN_TITLE.people}
            value={describePeople(settings.people, settings.intakeTimes)}
            onOpen={() => onOpen('people')}
          />
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
          <NavRow
            title={SUBSCREEN_TITLE.pharmacies}
            value={describePharmacies(settings.pharmacies ?? [])}
            onOpen={() => onOpen('pharmacies')}
          />
          <NavRow
            title={SUBSCREEN_TITLE.family}
            value={describeFamily(family.sources.length, family.supported, backup.target !== null, family.cloud.connected)}
            onOpen={() => onOpen('family')}
          />
          <NavRow title={SUBSCREEN_TITLE.about} value={releases[0]?.version} onOpen={() => onOpen('about')} />
        </ul>
      </div>
    </div>
  )
}
