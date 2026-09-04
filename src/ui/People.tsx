/**
 * Люди в дневнике: кого ведём и у кого какая кнопка на приборе.
 *
 * Отдельная сущность появилась потому, что прежние «Пользователь 1» и
 * «Пользователь 2» — это две кнопки на корпусе тонометра, а не два человека в
 * семье. Людей может быть четверо, у ребёнка прибора нет вовсе, и лекарства у
 * него всё равно свои.
 *
 * Список и человек — два экрана, а не одна длинная карточка: у каждого есть имя,
 * кнопка прибора, часы приёма и удаление, и вчетвером это было четыре
 * одинаковых блока подряд, в которых легко удалить не того.
 */

import { useState } from 'react'
import type { IntakeSlot, Medicine, Person, Settings as SettingsData } from '../types'
import { freeDeviceUsers, intakeSlotsOf, MAX_PEOPLE, newPersonId, newSlotId, ownerOf, setIntakeSlots } from '../logic/people'
import { describePerson } from '../logic/settings'
import { plural } from '../logic/plural'
import { BackBar, Banner, Field, NavRow } from './bits'

/** Кнопка пользователя на приборе: своя, чужая занятая или никакой. */
function DeviceMemory({
  person,
  people,
  onChange,
}: {
  person: Person
  people: Person[]
  onChange: (next: 1 | 2 | undefined) => void
}) {
  const свободные = freeDeviceUsers(people, person.id)

  return (
    <div>
      <div className="tile__label" style={{ marginBottom: 'var(--space-2)' }}>
        Кнопка пользователя на тонометре
      </div>
      <div className="segmented segmented--fill" role="group" aria-label={`Кнопка на тонометре, ${person.name}`}>
        <button aria-pressed={person.deviceUser === undefined} onClick={() => onChange(undefined)}>
          Нет
        </button>
        {([1, 2] as const).map((memory) => (
          <button
            key={memory}
            aria-pressed={person.deviceUser === memory}
            // Занятую другим кнопку не отдаём: два человека на одной памяти —
            // это один дневник давления на двоих, где не разобрать, чьё
            // измерение, и разобрать потом уже нельзя.
            disabled={!свободные.includes(memory)}
            onClick={() => onChange(memory)}
          >
            {memory}
          </button>
        ))}
      </div>
      <div className="muted" style={{ marginTop: 'var(--space-2)' }}>
        {person.deviceUser === undefined
          ? 'Дневник давления будет пустым — прибор помнит только двоих. Лекарства и приём работают как у всех.'
          : 'На корпусе прибора две кнопки с цифрами: измерение ложится тому, чья кнопка нажата.'}
      </div>
    </div>
  )
}

/** Экран одного человека: имя, кнопка прибора, часы приёма, удаление. */
export function PersonScreen({
  person,
  settings,
  medicines,
  onChange,
  onBack,
}: {
  person: Person
  settings: SettingsData
  /** Нужны, чтобы сказать при удалении, что станет с его коробками. */
  medicines: Medicine[]
  onChange: (next: Partial<SettingsData>) => void
  onBack: () => void
}) {
  const [удаляем, setУдаляем] = useState(false)
  const { people } = settings
  const его = medicines.filter((m) => ownerOf(m, people) === person.id)
  const последний = people.length === 1

  const заменить = (fields: Partial<Person>) =>
    onChange({ people: people.map((p) => (p.id === person.id ? { ...p, ...fields } : p)) })

  const приёмы = intakeSlotsOf(person, settings)
  const заменитьПриём = (index: number, fields: Partial<IntakeSlot>) =>
    onChange(setIntakeSlots(settings, person.id, приёмы.map((slot, i) => (i === index ? { ...slot, ...fields } : slot))))
  const добавитьПриём = () => {
    const now = Date.now()
    // Время новой кнопки — через три часа после последней: подставлять полночь
    // значит заставить человека крутить барабан от нуля.
    const последняя = приёмы[приёмы.length - 1]?.time ?? '08:00'
    const [ч, м] = последняя.split(':').map(Number)
    const дальше = `${String((ч + 3) % 24).padStart(2, '0')}:${String(м || 0).padStart(2, '0')}`
    onChange(setIntakeSlots(settings, person.id, [...приёмы, { id: newSlotId(now), title: `В ${дальше}`, time: дальше }]))
  }

  return (
    <div className="stack">
      <BackBar onBack={onBack} />

      <div className="card">
        <div className="card__head">
          <h2>{person.name.trim() || 'Человек'}</h2>
        </div>

        <div className="stack" style={{ gap: 'var(--space-5)' }}>
          <div>
            <Field label="Имя">
              <input
                value={person.name}
                placeholder="как называть в дневнике"
                onChange={(event) => заменить({ name: event.target.value })}
              />
            </Field>
            <div className="muted" style={{ marginTop: 'var(--space-2)' }}>
              Попадёт в отчёт для врача.
            </div>
          </div>

          <DeviceMemory person={person} people={people} onChange={(next) => заменить({ deviceUser: next })} />

          <div>
            <div className="tile__label" style={{ marginBottom: 'var(--space-2)' }}>
              Кнопки приёма
            </div>
            <div className="muted" style={{ marginBottom: 'var(--space-3)' }}>
              Это готовые кнопки в форме препарата: нажал — и время подставилось. Их может быть сколько нужно.
            </div>

            <div className="stack" style={{ gap: 'var(--space-4)' }}>
              {приёмы.map((slot, index) => (
                <div className="slotrow" key={slot.id}>
                  <Field label="Название">
                    <input
                      value={slot.title}
                      placeholder="Утром"
                      onChange={(e) => заменитьПриём(index, { title: e.target.value })}
                    />
                  </Field>
                  <Field label="Время">
                    <input
                      type="time"
                      value={slot.time}
                      onChange={(e) => заменитьПриём(index, { time: e.target.value || slot.time })}
                    />
                  </Field>
                  <button
                    className="btn btn--sm"
                    // Последнюю не убираем: без кнопок форма препарата теряет
                    // быстрый ввод времени вовсе, а вернуть их будет негде.
                    disabled={приёмы.length <= 1}
                    onClick={() => onChange(setIntakeSlots(settings, person.id, приёмы.filter((_, i) => i !== index)))}
                  >
                    Убрать
                  </button>
                </div>
              ))}
            </div>

            <div className="row" style={{ marginTop: 'var(--space-4)' }}>
              <button className="btn" onClick={добавитьПриём}>
                Добавить кнопку
              </button>
            </div>

            <div className="muted" style={{ marginTop: 'var(--space-3)' }}>
              Заведённые препараты не меняются: у них своё время, и переписывать его за человека нельзя.
            </div>
          </div>
        </div>
      </div>

      {!последний && (
        <div className="card">
          {удаляем ? (
            <Banner tone="critical">
              <b>Удалить {person.name.trim() || 'человека'}?</b>
              <div style={{ marginTop: 4 }}>
                {его.length > 0 ? (
                  <>
                    В аптечке останется {его.length}{' '}
                    {plural(его.length, 'препарат', 'препарата', 'препаратов')} без владельца — они перейдут первому
                    человеку в списке. Измерения давления не тронутся.
                  </>
                ) : (
                  <>Записи не пропадут: у этого человека их нет.</>
                )}
              </div>
              <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                {/* «Отмена» первой: опасное действие не должно подставляться
                    под палец там, где только что была безобидная кнопка. */}
                <button className="btn" onClick={() => setУдаляем(false)}>
                  Отмена
                </button>
                <button
                  className="btn btn--danger"
                  onClick={() => {
                    const остальные = people.filter((p) => p.id !== person.id)
                    onChange({
                      people: остальные,
                      activePerson: settings.activePerson === person.id ? остальные[0].id : settings.activePerson,
                    })
                    onBack()
                  }}
                >
                  Удалить
                </button>
              </div>
            </Banner>
          ) : (
            <div className="row">
              <button className="btn btn--danger" onClick={() => setУдаляем(true)}>
                Удалить человека
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Список людей. */
export function People({
  settings,
  onChange,
  onOpenPerson,
  onBack,
}: {
  settings: SettingsData
  onChange: (next: Partial<SettingsData>) => void
  onOpenPerson: (id: string) => void
  onBack: () => void
}) {
  const { people } = settings

  function добавить() {
    const id = newPersonId(Date.now())
    const свободная = freeDeviceUsers(people)[0]
    onChange({
      people: [...people, { id, name: '', deviceUser: свободная }],
      // Сразу переключаемся на нового: его заводят, чтобы им заняться, и
      // искать переключатель после этого — лишний шаг.
      activePerson: id,
    })
    onOpenPerson(id)
  }

  return (
    <div className="stack">
      <BackBar onBack={onBack} />

      <div className="card">
        <div className="card__head">
          <h2>Пользователи</h2>
          <span className="muted">настройки и часы приёма</span>
        </div>

        <ul className="pills">
          {people.map((person, index) => (
            <NavRow
              key={person.id}
              title={person.name.trim() || `Человек ${index + 1}`}
              value={describePerson(person, settings.intakeTimes)}
              onOpen={() => onOpenPerson(person.id)}
            />
          ))}
        </ul>

        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          <button className="btn" onClick={добавить} disabled={people.length >= MAX_PEOPLE}>
            Добавить человека
          </button>
        </div>
        {people.length >= MAX_PEOPLE ? (
          <div className="muted" style={{ marginTop: 'var(--space-3)' }}>
            В одном дневнике помещается {MAX_PEOPLE} человек — столько различают напоминания.
          </div>
        ) : (
          people.length === 1 && (
            <div className="muted" style={{ marginTop: 'var(--space-3)' }}>
              Пока человек один, переключателя нигде нет. Он появится, как только людей станет двое.
            </div>
          )
        )}
      </div>
    </div>
  )
}

/**
 * Переключатель человека.
 *
 * Показывается, только когда людей больше одного. У того, кто ведёт дневник на
 * себя, лишнего элемента на экране не появляется — а таких большинство.
 */
export function PersonSwitch({
  settings,
  onChange,
  extra,
}: {
  settings: SettingsData
  onChange: (next: Partial<SettingsData>) => void
  /**
   * Лишний выбор рядом с людьми — «Вся семья» в аптечке.
   *
   * Он живёт здесь, а не отдельной полосой внутри экрана. Отдельная полоса уже
   * была и оказалась дефектом: на «Аптечке» стояли два одинаковых ряда имён,
   * верхний ничего не менял, а нижний молча уводил в пустой экран. Вопрос
   * «чей это список» на экране один, и ряд кнопок к нему тоже должен быть один.
   */
  extra?: { title: string; active: boolean; onPick: (active: boolean) => void }
}) {
  if (settings.people.length <= 1) return null

  return (
    <div className="personbar no-print">
      <div className="segmented segmented--fill segmented--chips" role="group" aria-label="Чей дневник">
        {settings.people.map((person, index) => (
          <button
            key={person.id}
            aria-pressed={!extra?.active && settings.activePerson === person.id}
            onClick={() => {
              onChange({ activePerson: person.id })
              // Выбрали человека — «вся семья» больше не выбрана: иначе нажатая
              // кнопка не совпадала бы с тем, что показано.
              extra?.onPick(false)
            }}
          >
            {person.name || `Человек ${index + 1}`}
          </button>
        ))}
        {extra && (
          <button aria-pressed={extra.active} onClick={() => extra.onPick(true)}>
            {extra.title}
          </button>
        )}
      </div>
    </div>
  )
}
