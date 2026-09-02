/**
 * Люди в дневнике: кого ведём и у кого какой прибор.
 *
 * Отдельная сущность появилась потому, что прежние «Пользователь 1» и
 * «Пользователь 2» — это две кнопки на корпусе тонометра, а не два человека в
 * семье. Людей может быть четверо, у ребёнка прибора нет вовсе, и лекарства у
 * него всё равно свои.
 *
 * Экран нарочно скучный. Человека заводят один раз и больше сюда не заходят,
 * поэтому здесь нет ни аватарок, ни цветов: имя, привязка к прибору, удаление.
 */

import { useState } from 'react'
import type { Medicine, Person, Settings as SettingsData } from '../types'
import { freeDeviceUsers, MAX_PEOPLE, newPersonId, ownerOf } from '../logic/people'
import { plural } from '../logic/plural'
import { Banner, Field } from './bits'

/** Память прибора у человека: своя, чужая занятая или никакой. */
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
        Память тонометра
      </div>
      <div className="segmented segmented--fill" role="group" aria-label={`Память тонометра, ${person.name}`}>
        <button aria-pressed={person.deviceUser === undefined} onClick={() => onChange(undefined)}>
          Нет
        </button>
        {([1, 2] as const).map((memory) => (
          <button
            key={memory}
            aria-pressed={person.deviceUser === memory}
            // Занятую другим память не отдаём: два человека на одной памяти —
            // это один дневник давления на двоих, где не разобрать, чьё
            // измерение, и разобрать потом уже нельзя.
            disabled={!свободные.includes(memory)}
            onClick={() => onChange(memory)}
          >
            {memory}
          </button>
        ))}
      </div>
    </div>
  )
}

export function People({
  settings,
  medicines,
  onChange,
}: {
  settings: SettingsData
  /** Нужны, чтобы сказать при удалении, что пропадёт вместе с человеком. */
  medicines: Medicine[]
  onChange: (next: Partial<SettingsData>) => void
}) {
  const [удаляем, setУдаляем] = useState<string | null>(null)
  const { people } = settings

  const заменить = (id: string, fields: Partial<Person>) =>
    onChange({ people: people.map((p) => (p.id === id ? { ...p, ...fields } : p)) })

  function добавить() {
    const id = newPersonId(Date.now())
    const свободная = freeDeviceUsers(people)[0]
    onChange({
      people: [...people, { id, name: '', deviceUser: свободная }],
      // Сразу переключаемся на нового: его заводят, чтобы им заняться, и
      // искать переключатель после этого — лишний шаг.
      activePerson: id,
    })
  }

  function удалить(id: string) {
    const остальные = people.filter((p) => p.id !== id)
    onChange({
      people: остальные,
      activePerson: settings.activePerson === id ? остальные[0].id : settings.activePerson,
    })
    setУдаляем(null)
  }

  return (
    <div className="card">
      <div className="card__head">
        <h2>Люди</h2>
        <span className="muted">чьи дела ведём в этом дневнике</span>
      </div>

      <div className="stack" style={{ gap: 'var(--space-5)' }}>
        {people.map((person, index) => {
          const его = medicines.filter((m) => ownerOf(m, people) === person.id)
          const последний = people.length === 1

          return (
            <div key={person.id} className={index > 0 ? 'card card--inset' : undefined}>
              <div className="stack" style={{ gap: 'var(--space-3)' }}>
                <Field label={index === 0 ? 'Имя' : 'Имя'}>
                  <input
                    value={person.name}
                    placeholder="как называть в дневнике"
                    onChange={(event) => заменить(person.id, { name: event.target.value })}
                  />
                </Field>

                <DeviceMemory
                  person={person}
                  people={people}
                  onChange={(next) => заменить(person.id, { deviceUser: next })}
                />

                {person.deviceUser === undefined && (
                  <div className="muted">
                    Дневник давления у этого человека будет пустым — прибор ведёт память только на двоих.
                    Лекарства и приём работают как у всех.
                  </div>
                )}

                {!последний &&
                  (удаляем === person.id ? (
                    <Banner tone="critical">
                      <b>Удалить {person.name || 'человека'}?</b>
                      <div style={{ marginTop: 4 }}>
                        {его.length > 0 ? (
                          <>
                            В аптечке останется {его.length}{' '}
                            {plural(его.length, 'препарат', 'препарата', 'препаратов')} без владельца — они
                            перейдут первому человеку в списке. Измерения давления не тронутся.
                          </>
                        ) : (
                          <>Записи не пропадут: у этого человека их нет.</>
                        )}
                      </div>
                      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                        {/* «Отмена» первой: опасное действие не должно
                            подставляться под палец там, где только что была
                            безобидная кнопка. */}
                        <button className="btn" onClick={() => setУдаляем(null)}>
                          Отмена
                        </button>
                        <button className="btn btn--danger" onClick={() => удалить(person.id)}>
                          Удалить
                        </button>
                      </div>
                    </Banner>
                  ) : (
                    <div className="row">
                      <button className="btn btn--sm" onClick={() => setУдаляем(person.id)}>
                        Удалить человека
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="row" style={{ marginTop: 'var(--space-4)' }}>
        <button className="btn" onClick={добавить} disabled={people.length >= MAX_PEOPLE}>
          Добавить человека
        </button>
      </div>
      {people.length >= MAX_PEOPLE && (
        <div className="muted" style={{ marginTop: 'var(--space-3)' }}>
          В одном дневнике помещается {MAX_PEOPLE} человек — столько различают напоминания.
        </div>
      )}

      {people.length === 1 && (
        <div className="muted" style={{ marginTop: 'var(--space-3)' }}>
          Пока человек один, переключателя нигде нет и приложение выглядит как прежде. Он появится, как только
          людей станет двое.
        </div>
      )}
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
}: {
  settings: SettingsData
  onChange: (next: Partial<SettingsData>) => void
}) {
  if (settings.people.length <= 1) return null

  return (
    <div className="personbar no-print">
      <div className="segmented segmented--fill segmented--chips" role="group" aria-label="Чей дневник">
        {settings.people.map((person, index) => (
          <button
            key={person.id}
            aria-pressed={settings.activePerson === person.id}
            onClick={() => onChange({ activePerson: person.id })}
          >
            {person.name || `Человек ${index + 1}`}
          </button>
        ))}
      </div>
    </div>
  )
}
