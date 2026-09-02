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
import { BackBar, Banner } from './bits'
import type { FamilySyncStatus } from './useFamilySync'
import { describeMerge } from './useFamilySync'

export function FamilyScreen({
  family,
  target,
  onBack,
  onOpenBackup,
}: {
  family: FamilySyncStatus
  /** Свой файл копий: без него делиться нечем. */
  target: string | null
  onBack: () => void
  onOpenBackup: () => void
}) {
  return (
    <div className="stack">
      <BackBar onBack={onBack} />

      <div className="card">
        <div className="card__head">
          <h2>Семья</h2>
          <span className="muted">общий дневник на несколько телефонов</span>
        </div>

        {!family.supported ? (
          <Banner tone="info">
            <b>Здесь обмен не работает.</b>
            <div style={{ marginTop: 4 }}>
              Браузер разрешает читать чужой файл только сразу после выбора, а обмен должен идти сам. В приложении для
              Android он работает.
            </div>
          </Banner>
        ) : (
          <>
            {/* Пошагово, потому что порядок неочевиден: сначала общая папка,
                потом свой файл в ней, и только потом чужие. Без первых двух
                шагов «Добавить телефон» не к чему приложить. */}
            <ol className="steps">
              <li>
                На каждом телефоне заведите <b>одну общую папку в облаке</b> — например, в Яндекс.Диске или
                Облаке Mail.ru — и откройте к ней доступ всем своим.
              </li>
              <li>
                На каждом телефоне в «Копии дневника» нажмите <b>«Выбрать файл для автокопий»</b> и создайте файл
                в этой папке. Имя лучше своё: «дневник-отца», «дневник-жены».
              </li>
              <li>
                Дождитесь, пока облако разнесёт файлы по телефонам, и здесь нажмите <b>«Добавить телефон»</b>,
                указав файл другого человека.
              </li>
            </ol>
            <p className="muted">
              Дальше приложение читает эти файлы каждый раз, когда вы его открываете, и добавляет из них новое.
              Ваши записи уходят туда же — обычной копией.
            </p>

            {!target && (
              <Banner tone="warning">
                <b>Сначала выберите файл для своих копий.</b>
                <div style={{ marginTop: 4 }}>
                  Иначе делиться нечем: остальные телефоны будут читать пустоту.
                </div>
                <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                  <button className="btn" onClick={onOpenBackup}>
                    К копии дневника
                  </button>
                </div>
              </Banner>
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
                  {family.busy ? 'Читаю…' : 'Прочитать сейчас'}
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
