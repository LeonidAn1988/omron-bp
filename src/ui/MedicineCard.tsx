import { useState } from 'react'
import type { Medicine } from '../types'
import {
  addPack,
  displayAlert,
  effectiveLeft,
  isEstimated,
  perDayOf,
  runsOutAt,
  setLeft,
  supplyDays,
} from '../logic/medicines'
import { instructionUrl } from '../logic/drugs'
import { pharmacyLinks, searchEngineUrl } from '../logic/pharmacies'
import { plural } from '../logic/plural'
import { NumberField } from './NumberField'
import { Banner, BackBar } from './bits'
import { PencilIcon, TrashIcon } from './icons'
import { alertText, ALERT_TONE, KindTag, monthYear, substanceLabel, Supply } from './Medicines'

/**
 * Экран одного препарата.
 *
 * Отдельный экран, а не раскрытие в списке. Подробностей у препарата на десяток
 * полей — это заведомо больше, чем помещается в строку списка, а две цели
 * нажатия в одной карточке (открыть и раскрыть) дают промахи, особенно у
 * пожилых. На своём экране влезают и крупный шрифт, и полноразмерные кнопки.
 */

function Row({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="detail__row">
      <dt>{label}</dt>
      <dd>
        {empty ? <span className="fact__empty">не указано</span> : value}
        {note && <span className="fact__note">{note}</span>}
      </dd>
    </div>
  )
}

export function MedicineCard({
  medicine,
  onBack,
  onSave,
  onDelete,
  onEdit,
  owner,
  pharmacies = [],
}: {
  medicine: Medicine
  onBack: () => void
  onSave: (item: Medicine) => Promise<void>
  onDelete: () => void
  onEdit: () => void
  /** Чья коробка. Пусто — своя или человек в дневнике один. */
  owner?: string | null
  /** Выбранные аптеки: по кнопке на каждую. */
  pharmacies?: readonly string[]
}) {
  const [editingLeft, setEditingLeft] = useState(false)
  const [leftValue, setLeftValue] = useState(String(medicine.left ?? ''))
  const [confirming, setConfirming] = useState(false)

  const now = Date.now()
  const { alert: shownAlert, showSupply } = displayAlert(medicine, now)
  const supply = supplyDays(medicine, now)
  const left = effectiveLeft(medicine, now)
  const estimated = isEstimated(medicine, now)
  const perDay = perDayOf(medicine)

  const schedule = medicine.times?.length
    ? medicine.times.join(', ')
    : perDay !== null
      ? `${perDay} ${plural(perDay, 'раз', 'раза', 'раз')} в день`
      : ''

  const аптеки = pharmacyLinks(medicine, pharmacies)

  return (
    <div className="stack">
      <BackBar onBack={onBack} />

      <div className="card">
        <div className="card__head">
          <h2>
            {medicine.name}
            <KindTag kind={medicine.kind} />
          </h2>
          <span className="muted">
            {/* Владелец назван прямо: карточку открывают и из общей аптечки,
                где рядом лежат чужие коробки, а экран при этом на другого
                человека не переключается. */}
            {[owner, medicine.dose].filter(Boolean).join(' · ')}
          </span>
        </div>

        {shownAlert && (
          <div className={`pill__alert pill__alert--${ALERT_TONE[shownAlert.kind]}`}>
            {alertText(shownAlert, medicine)}
          </div>
        )}

        {showSupply && <Supply days={supply!} until={runsOutAt(medicine, now)} />}

        {/* Обе кнопки про остаток, и выглядеть они должны одинаково. */}
        <div className="row row--stack" style={{ marginTop: 'var(--space-4)' }}>
          {medicine.packSize ? (
            <button className="btn btn--primary" onClick={() => void onSave(addPack(medicine, Date.now()))}>
              Купил упаковку — {medicine.packSize} шт.
            </button>
          ) : null}
          <button className="btn" onClick={() => setEditingLeft((open) => !open)}>
            Поправить остаток
          </button>
        </div>

        {editingLeft && (
          <form
            className="pill__left-edit"
            onSubmit={async (event) => {
              event.preventDefault()
              const parsed = Number(leftValue.replace(',', '.'))
              if (!Number.isFinite(parsed)) return
              await onSave(setLeft(medicine, parsed, Date.now()))
              setEditingLeft(false)
            }}
          >
            <div style={{ maxWidth: 170 }}>
              <NumberField
                label="Сколько осталось"
                value={leftValue}
                onChange={setLeftValue}
                min={0}
                max={999}
                start={30}
                size="compact"
                autoFocus
              />
            </div>
            <div className="row">
              <button type="submit" className="btn btn--primary btn--sm">
                Сохранить
              </button>
              <button type="button" className="btn btn--sm" onClick={() => setEditingLeft(false)}>
                Отмена
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <div className="card__head">
          <h2>О препарате</h2>
        </div>

        <dl className="detail">
          <Row
            label="Остаток"
            value={left === null ? '' : `${estimated ? '≈ ' : ''}${left} шт.`}
            note={medicine.autoDeduct ? 'отмечать не нужно' : estimated ? 'по расчёту' : undefined}
          />
          <Row label="Приём" value={schedule} note={medicine.meal === 'before' ? 'до еды' : medicine.meal === 'after' ? 'после еды' : undefined} />
          <Row label="Годен до" value={medicine.expires === null ? '' : monthYear(medicine.expires)} />
          <Row label="Форма выпуска" value={medicine.form ?? ''} />
          <Row label={substanceLabel(medicine.kind)} value={medicine.inn ?? ''} />
          <Row label="Производитель" value={medicine.maker ?? ''} />
          <Row label="В упаковке" value={medicine.packSize ? `${medicine.packSize} шт.` : ''} />
          {medicine.note && <Row label="Примечание" value={medicine.note} />}
        </dl>

        {/* Один абзац фактов, без назиданий: что человеку принимать — его дело,
            наше дело — не выдавать одно за другое. */}
        {medicine.kind === 1 && (
          <Banner tone="info">
            <b>Это БАД, а не лекарство.</b>
            <div style={{ marginTop: 4 }}>
              Добавки регистрируются как пищевая продукция: лечебного действия они не заявляют и клинических испытаний,
              как лекарства, не проходят. Назначенные препараты БАД не заменяет.
            </div>
          </Banner>
        )}
        {medicine.kind === 2 && (
          <Banner tone="info">
            <b>Это гомеопатическое средство.</b>
            <div style={{ marginTop: 4 }}>
              Оно зарегистрировано как лекарство, но действующего вещества в проверяемом количестве не содержит.
              Назначенные препараты им не заменяют.
            </div>
          </Banner>
        )}

        <div className="row" style={{ marginTop: 'var(--space-5)' }}>
          <button className="btn" onClick={onEdit}>
            <PencilIcon />
            Изменить
          </button>
          <a
            className="btn"
            href={instructionUrl(medicine.name, medicine.dose)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Инструкция
          </a>
          {/* Выбранные аптеки — по кнопке на каждую, поиск сразу по названию и
              дозировке. Если ни одна не выбрана, остаётся общий поиск: он ищет
              по действующему веществу и находит дешёвые аналоги. Запрос в обоих
              случаях уходит с устройства человека, от нас наружу не идёт ничего. */}
          {аптеки.length > 0 ? (
            аптеки.map((аптека) => (
              <a key={аптека.id} className="btn" href={аптека.href} target="_blank" rel="noopener noreferrer">
                {аптека.name}
              </a>
            ))
          ) : (
            <a className="btn" href={searchEngineUrl(medicine)} target="_blank" rel="noopener noreferrer">
              Найти в аптеке
            </a>
          )}
          {confirming ? (
            <>
              {/* «Отмена» занимает место, где только что была кнопка
                  «Удалить». Раньше туда вставало «Удалить насовсем», и второе
                  нажатие подряд — обычное дело у пожилого человека и на
                  медленном телефоне — стирало препарат без единого вопроса.
                  Опасное действие обязано переехать, а не подставиться под
                  палец. */}
              <button className="btn" onClick={() => setConfirming(false)}>
                Отмена
              </button>
              <button className="btn btn--danger" onClick={onDelete}>
                Удалить насовсем
              </button>
            </>
          ) : (
            <button className="btn btn--danger" onClick={() => setConfirming(true)}>
              <TrashIcon />
              Удалить
            </button>
          )}
        </div>

        <Banner tone="info">
          <b>Обе кнопки открывают браузер.</b>
          <div style={{ marginTop: 4 }}>
            Реестр не отдаёт инструкцию ссылкой, а цены в аптеках приложение не собирает — поиск делаете вы сами, со
            своего устройства. Наружу уходит только название препарата и дозировка: они и так публичны, ничего о вас
            в запросе нет и никакого списка ваших лекарств никуда не отправляется.
          </div>
        </Banner>
      </div>
    </div>
  )
}
