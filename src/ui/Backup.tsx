import { describeBackupAge, STALE_DAYS } from '../logic/backup'
import { plural } from '../logic/plural'
import { platform } from '../platform/ports'
import { Banner } from './bits'
import type { BackupStatus } from './useBackup'

/**
 * Где живут данные — словами, которые верны на этой платформе.
 *
 * В браузере дневник пропадает вместе с очисткой сайта и на iPhone сам собой
 * после недели без заходов. В установленном приложении ни того, ни другого не
 * бывает, зато он исчезает при «Очистить данные» в настройках Android и при
 * удалении приложения. Пугать не тем, что случится, — хуже, чем не пугать
 * вовсе: человек перестаёт верить предупреждениям.
 */
const isNative = () => platform().kind === 'native'

/**
 * Сохранность дневника: что защищает данные и что с этим делать.
 *
 * Формулировки нарочно без запугивания и без ложного спокойствия. Человек,
 * который ведёт дневник давления, не обязан разбираться в вытеснении хранилища
 * — ему нужно знать одно: копия есть или копии нет.
 */

export function DataSafety({ status }: { status: BackupStatus }) {
  const { supported, target, durable, lastAt, count, busy, failed } = status

  return (
    <div className="card">
      <div className="card__head">
        <h2>Сохранность данных</h2>
      </div>

      {failed && (
        <Banner tone="critical">
          <b>Копии перестали сохраняться</b>
          <div style={{ marginTop: 4 }}>
            Файл для копий удалён, перемещён или доступ к нему отозван. Выберите файл заново — иначе новые записи
            останутся {isNative() ? 'только внутри телефона' : 'только в браузере'}.
          </div>
        </Banner>
      )}

      <div className="stack" style={{ gap: 'var(--space-4)' }}>
        <div>
          <div className="tile__label">Резервная копия</div>
          <div style={{ marginTop: 4 }}>
            {lastAt === null ? (
              <b className="critical-text">копий ещё не было</b>
            ) : (
              <>
                Последняя — <b>{describeBackupAge(lastAt, Date.now())}</b>
                {status.warning === 'stale' && <span className="critical-text"> · с тех пор появились новые записи</span>}
              </>
            )}
          </div>
          {target && (
            <div className="muted" style={{ marginTop: 4 }}>
              Сохраняется само в файл <b>{target}</b> при каждом изменении. От потери самого устройства это спасёт,
              только если файл лежит в облачной папке.
            </div>
          )}
        </div>

        <div className="row">
          {status.canShare && (
            <button className="btn btn--primary" onClick={() => void status.shareNow()} disabled={busy || count === 0}>
              Отправить копию
            </button>
          )}
          <button
            className={status.canShare ? 'btn' : 'btn btn--primary'}
            onClick={() => void status.saveNow()}
            disabled={busy || count === 0}
          >
            Сохранить в файл
          </button>
          {supported &&
            (target ? (
              <button className="btn" onClick={() => void status.forgetTarget()} disabled={busy}>
                Отключить автокопии
              </button>
            ) : (
              <button className="btn" onClick={() => void status.chooseTarget()} disabled={busy}>
                Выбрать файл для автокопий
              </button>
            ))}
        </div>

        {!supported && (
          <p className="muted" style={{ margin: 0 }}>
            {isNative()
              ? 'Android не даёт приложению писать копию в выбранный вами файл без спроса, поэтому копию нужно отправлять кнопкой.'
              : 'Этот браузер не умеет дописывать файл сам, поэтому копию нужно сохранять кнопкой.'}{' '}
            Приложение напомнит, если с последней копии пройдёт больше {STALE_DAYS}{' '}
            {plural(STALE_DAYS, 'дня', 'дней', 'дней')} с новыми записями.
          </p>
        )}

        <div>
          <div className="tile__label">{isNative() ? 'Где лежат записи' : 'Хранилище браузера'}</div>
          <div style={{ marginTop: 4 }}>
            {isNative() ? (
              <>
                В памяти приложения. Система их не вытесняет.
                <span className="muted"> Но они исчезнут, если удалить приложение или очистить его данные.</span>
              </>
            ) : (
              <>
                {durable === null && 'Постоянное — данные не вытесняются.'}
                {durable === true && 'Постоянное: браузер не удалит данные сам.'}
                {durable === false && (
                  <>
                    Обычное: браузер вправе очистить его при нехватке места, а на iPhone — после недели без заходов.
                    <span className="muted"> Добавьте приложение на домашний экран, и защита включится.</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <Banner tone="info">
        <b>Копия — это обычный файл с вашими записями.</b>
        <div style={{ marginTop: 4 }}>
          Приложение никуда его не отправляет само. Чтобы данные пережили потерю телефона, копия должна оказаться за
          его пределами: «Отправить копию» открывает системный выбор — Облако Mail.ru, Google Диск, мессенджер, письмо
          себе. Восстановить дневник из файла можно ниже, в разделе «Данные».
        </div>
      </Banner>
    </div>
  )
}

const NUDGE_TITLE = {
  never: 'Дневник существует в одном экземпляре',
  behind: 'Новые записи ещё не в копии',
  stale: 'Резервная копия устарела',
} as const

/** Предупреждение на главном экране — там, где его увидят, а не в настройках. */
export function BackupNudge({
  status,
  onOpenSettings,
  onDismiss,
}: {
  status: BackupStatus
  onOpenSettings: () => void
  /** «Понятно»: убрать баннер на неделю. Сигнал останется точкой на кнопке. */
  onDismiss: () => void
}) {
  if (status.warning === null) return null

  const explain = {
    never: isNative()
      ? 'Записи есть только на этом телефоне. Если удалить приложение или потерять телефон, дневник пропадёт.'
      : 'Записи есть только в этом браузере. Если очистить его данные или потерять устройство, дневник пропадёт.',
    behind: `Вне копии ${status.behind} ${plural(status.behind, 'запись', 'записи', 'записей')}. Отправьте копию — это одно касание.`,
    stale: `С последней копии прошло больше ${STALE_DAYS} ${plural(STALE_DAYS, 'дня', 'дней', 'дней')}, и за это время появились новые записи.`,
  }[status.warning]

  return (
    <Banner tone="warning">
      <b>{NUDGE_TITLE[status.warning]}</b>
      <div style={{ marginTop: 4 }}>{explain}</div>
      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <button
          className="btn btn--primary"
          onClick={() => void (status.canShare ? status.shareNow() : status.saveNow())}
          disabled={status.busy}
        >
          {status.canShare ? 'Отправить копию' : 'Сохранить копию'}
        </button>
        <button className="btn" onClick={onOpenSettings}>
          Настроить
        </button>
        <button className="btn btn--sm" onClick={onDismiss}>
          Понятно
        </button>
      </div>
    </Banner>
  )
}
