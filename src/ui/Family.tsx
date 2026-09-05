/**
 * Семья: обмен дневниками между телефонами без сервера.
 *
 * Устроено из двух половин, каждая из которых уже была по отдельности. Свой
 * дневник телефон пишет в файл — это обычная копия. Здесь добавляется вторая
 * половина: файлы других телефонов, которые приложение читает при каждом
 * открытии и сливает с местным.
 *
 * Экран нарочно говорит, чего обмен не делает. Он не мгновенный: между двумя
 * телефонами стоит облачный клиент. Он не работает, пока приложение закрыто:
 * там наш код не выполняется вовсе. Человек, ожидающий большего, решит, что
 * приложение сломалось, — а оно работает ровно как обещано.
 */

import type { BackupSource } from '../platform/ports'
import { describeBackupAge } from '../logic/backup'
import { useState } from 'react'
import { BackBar, Banner, Field } from './bits'
import { authUrl } from '../logic/yandex'
import type { FamilySyncStatus } from './useFamilySync'
import { describeMerge } from './useFamilySync'

/**
 * Подключение Яндекс.Диска в два шага.
 *
 * Ключ приложение получить само не может: секрета у него нет и быть не должно —
 * он лежал бы прямо в установленном приложении. Поэтому Яндекс показывает ключ
 * человеку, а тот его вставляет. Один раз примерно на год.
 */
function CloudConnect({ onConnect }: { onConnect: (pasted: string) => Promise<boolean> }) {
  const [вставлено, setВставлено] = useState('')
  const [идёт, setИдёт] = useState(false)

  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      <div className="muted">
        Общая папка семьи заводится сама. Приложение видит только её — остальной Диск ему недоступен.
      </div>
      <ol className="steps">
        <li>
          <a href={authUrl()} target="_blank" rel="noopener noreferrer">
            Откройте страницу Яндекса
          </a>{' '}
          и разрешите доступ.
        </li>
        <li>Скопируйте показанный ключ и вставьте сюда.</li>
      </ol>
      <Field label="Ключ доступа">
        <input
          value={вставлено}
          onChange={(event) => setВставлено(event.target.value)}
          placeholder="вставьте ключ"
          autoComplete="off"
        />
      </Field>
      <div className="row row--stack">
        <button
          className="btn btn--primary"
          disabled={идёт || вставлено.trim() === ''}
          onClick={() => {
            setИдёт(true)
            void onConnect(вставлено).then((ok) => {
              setИдёт(false)
              if (ok) setВставлено('')
            })
          }}
        >
          {идёт ? 'Проверяю…' : 'Подключить'}
        </button>
      </div>
    </div>
  )
}

export function FamilyScreen({
  family,
  target,
  onChooseTarget,
  busy,
  onBack,
}: {
  family: FamilySyncStatus
  /** Свой файл копий: без него делиться нечем. */
  target: string | null
  /** Выбрать свой файл прямо здесь — раньше за этим отправляли на другой экран. */
  onChooseTarget: () => void
  busy: boolean
  onBack: () => void
}) {
  return (
    <div className="stack">
      <BackBar onBack={onBack} />

      <div className="card">
        <div className="card__head">
          <h2>Семья</h2>
          <span className="muted">общий дневник на несколько телефонов</span>
        </div>

        {/* Яндекс.Диск — короткий путь: подключил один раз, и приложение само
            видит дневники всех своих. Файлы вручную остаются запасным путём
            для тех, у кого другое облако. */}
        <div className="tile__label" style={{ marginBottom: 'var(--space-2)' }}>Яндекс.Диск</div>
        {family.cloud.connected ? (
          <>
            <div className="muted">
              Подключён. {family.cloud.canRead
                ? 'Дневники семьи читаются и отправляются сами.'
                : 'В браузере дневник только отправляется — чужие читает приложение на телефоне.'}
            </div>
            {family.cloud.files.length > 0 && (
              <ul className="pills" style={{ marginTop: 'var(--space-3)' }}>
                {family.cloud.files.map((файл) => (
                  <li className="pill" key={файл.name}>
                    <div className="pill__head">
                      <span className="pill__title">
                        <span className="pill__name">{файл.name.replace(/^дневник-?/, '').replace(/\.json$/, '') || 'мой дневник'}</span>
                      </span>
                    </div>
                    <div className="muted">
                      {файл.modified
                        ? `обновлён ${new Date(файл.modified).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
                        : 'дата неизвестна'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="row row--stack" style={{ marginTop: 'var(--space-3)' }}>
              <button className="btn btn--primary" onClick={() => void family.syncNow()} disabled={family.busy}>
                {family.busy ? 'Обмен идёт…' : 'Обменяться сейчас'}
              </button>
              <button className="btn btn--sm" onClick={family.cloud.disconnect}>
                Отключить Яндекс.Диск
              </button>
            </div>
          </>
        ) : (
          <CloudConnect onConnect={family.cloud.connect} />
        )}
        {family.cloud.error && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Banner tone="warning">{family.cloud.error}</Banner>
          </div>
        )}

        <div className="tile__label" style={{ margin: 'var(--space-5) 0 var(--space-2)' }}>
          Обмен файлами
        </div>
        {!family.supported ? (
          <Banner tone="info">
            <b>Обмен пока только в приложении для Android.</b>
            <div style={{ marginTop: 4 }}>В браузере он появится позже.</div>
          </Banner>
        ) : (
          <>
            {/* Пошагово, потому что порядок неочевиден: сначала общая папка,
                потом свой файл в ней, и только потом чужие. Без первых двух
                шагов «Добавить телефон» не к чему приложить. */}
            {/* Инструкция открыта, пока обмен не настроен, и сворачивается,
                когда он заработал: перечитывать её незачем. */}
            <details open={!target || family.sources.length === 0}>
              <summary>Как настроить</summary>
              <ol className="steps" style={{ marginTop: 'var(--space-3)' }}>
                <li>Заведите общую папку в облаке и откройте к ней доступ своим.</li>
                <li>Создайте в ней свой файл кнопкой ниже — на каждом телефоне свой.</li>
                <li>Когда облако разнесёт файлы, добавьте сюда файлы остальных.</li>
              </ol>
            </details>

            <div className="tile__label" style={{ margin: 'var(--space-5) 0 var(--space-2)' }}>
              Ваш файл
            </div>
            {target ? (
              <div className="muted">{target}</div>
            ) : (
              <>
                <div className="muted">Не выбран — остальные телефоны прочитают пустоту.</div>
                <div className="row row--stack" style={{ marginTop: 'var(--space-3)' }}>
                  <button className="btn btn--primary" onClick={onChooseTarget} disabled={busy}>
                    Выбрать свой файл
                  </button>
                </div>
              </>
            )}

            <div className="tile__label" style={{ margin: 'var(--space-5) 0 var(--space-2)' }}>
              Телефоны семьи
            </div>

            {family.sources.length === 0 ? (
              <div className="muted">Пока ни одного — см. три шага выше.</div>
            ) : (
              <ul className="pills">
                {family.sources.map((source: BackupSource) => (
                  <li className="pill" key={source.id}>
                    <div className="pill__head">
                      <span className="pill__title">
                        <span className="pill__name">{source.name}</span>
                      </span>
                    </div>
                    {/* Дата последней записи в файле: «облако не донесло» и
                        «человек ничего не вносил» снаружи неотличимы без неё. */}
                    <div className="muted">
                      {family.freshness[source.id]
                        ? `записи по ${new Date(family.freshness[source.id]!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
                        : 'записей пока нет'}
                    </div>
                    <div className="row" style={{ marginTop: 'var(--space-2)' }}>
                      <button className="btn btn--sm" onClick={() => void family.removeSource(source.id)}>
                        Отключить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="row row--stack" style={{ marginTop: 'var(--space-4)' }}>
              <button className="btn btn--primary" onClick={() => void family.addSource()} disabled={family.busy}>
                Добавить телефон
              </button>
              {family.sources.length > 0 && (
                <button className="btn" onClick={() => void family.syncNow()} disabled={family.busy}>
                  {family.busy ? 'Чтение…' : 'Прочитать сейчас'}
                </button>
              )}
            </div>

            {family.sources.length > 0 && (
              <div className="muted" style={{ marginTop: 'var(--space-4)' }}>
                Последний раз{' '}
                {family.lastAt === null ? 'ещё не читали' : describeBackupAge(family.lastAt, Date.now())} —{' '}
                {describeMerge(family.lastLog)}.
              </div>
            )}

            {family.unreadable.length > 0 && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <Banner tone="warning">
                  <b>Не удалось прочитать: {family.unreadable.join(', ')}.</b>
                  <div style={{ marginTop: 4 }}>
                    Файл могли переименовать, удалить или закрыть паролем. Добавьте его заново.
                  </div>
                </Banner>
              </div>
            )}

            {family.lastLog && family.lastLog.stockConflicts.length > 0 && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <Banner tone="warning">
                  <b>Остаток разошёлся: {family.lastLog.stockConflicts.join(', ')}.</b>
                  <div style={{ marginTop: 4 }}>
                    Два телефона посчитали упаковку по-разному. Пересчитайте и поправьте остаток руками.
                  </div>
                </Banner>
              </div>
            )}
          </>
        )}
      </div>

      {family.supported && (
        <div className="card">
          <details>
            <summary>Чего обмен не делает</summary>
            <div className="muted" style={{ marginTop: 'var(--space-3)' }}>
              Он не мгновенный: файл идёт от телефона к телефону через облако, и когда облако его перенесёт, решает
              оно. И он не идёт, пока приложение закрыто — обмен случается ровно тогда, когда вы его открываете.
              <div style={{ marginTop: 'var(--space-2)' }}>
                Удаление сильнее правки: если запись удалили на одном телефоне, она уйдёт и на остальных. Отметки
                приёма, наоборот, складываются — ни одна не пропадает.
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
