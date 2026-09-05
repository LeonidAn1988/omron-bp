import { useState } from 'react'
import type { Medicine } from '../types'
import {
  medicineAlert,
  packsNeeded,
  restockList,
  restockText,
  RESTOCK_DAYS,
  SUPPLY_SOON_DAYS,
  type MedicineAlert,
  dosesToday,
  sortMedicines,
} from '../logic/medicines'
import { KIND_LABEL } from '../logic/drugs'
import { monthYear, plural } from '../logic/plural'

// Наружу — для карточки препарата: ей нужен тот же падеж.
export { monthYear }
import { pharmacyLinks } from '../logic/pharmacies'
import { platform } from '../platform/ports'
import { canShareFile, copyTextOut, shareTextOut } from '../logic/io'
import { Banner } from './bits'

/**
 * Общие куски лекарственных разделов.
 *
 * «Приём» и «Аптечка» — разные экраны с разной частотой использования, но
 * предупреждения, полоса запаса и список покупок у них одни. Держать их здесь
 * дешевле, чем дублировать в двух файлах и потом расходиться формулировками.
 */

/**
 * «мая 2027», а не «май 2027». Intl с month: 'long' даёт именительный падеж, и
 * получается «годен до май 2027» — падеж приходится задавать руками.
 */
const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]



/**
 * Пометка «БАД» или «гомеопатия».
 *
 * Стоит рядом с названием везде, где препарат назван: в списке, на его экране и
 * в отчёте врачу. Это не осуждение и не запрет — человек волен принимать что
 * хочет, — но и молчать нельзя: БАД лечебного действия не заявляет, а
 * гомеопатия действующего вещества в проверяемом количестве не содержит. Тот,
 * кто ведёт дневник давления, имеет право видеть разницу в своём же списке.
 */
export function KindTag({ kind }: { kind: Medicine['kind'] }) {
  if (!kind) return null
  return (
    <span className="kind-tag" data-kind={kind}>
      {KIND_LABEL[kind]}
    </span>
  )
}

/**
 * Как назвать поле состава.
 *
 * У лекарства это действующее вещество из реестра, у БАДа — то, источником чего
 * он объявлен. Называть второе действующим веществом нельзя: у БАДа его нет по
 * определению, и подпись обещала бы лечебное действие, которого он не заявляет.
 */
export const substanceLabel = (kind: Medicine['kind']): string =>
  kind === 1 ? 'Источник' : 'Действующее вещество'

const days = (n: number): string => `${n} ${plural(n, 'день', 'дня', 'дней')}`

export function alertText(alert: MedicineAlert, medicine: Medicine): string {
  switch (alert.kind) {
    case 'expired':
      // Дату не повторяем: она стоит полем «Годен до» в карточке препарата.
      return 'Срок годности истёк'
    case 'out':
      return 'Закончился'
    case 'low':
      return alert.days === 0 ? 'Хватит меньше чем на день' : `Хватит на ${days(alert.days)}`
    case 'expiring':
      return `Годен до конца ${monthYear(medicine.expires!)}`
  }
}

/** Строгий срок и кончившийся препарат — красным, остальное — жёлтым. */
export const ALERT_TONE: Record<MedicineAlert['kind'], 'critical' | 'warning'> = {
  expired: 'critical',
  out: 'critical',
  low: 'warning',
  expiring: 'warning',
}

export function MedicineNudge({
  count,
  items,
  onOpen,
  onDismiss,
}: {
  count: number
  /** Коробки выбранного человека — из них берутся названия для баннера. */
  items: Medicine[]
  onOpen: () => void
  /** «Понятно»: убрать баннер на неделю. Точка на вкладке «Аптечка» останется. */
  onDismiss: () => void
}) {
  if (count === 0) return null

  const now = Date.now()
  const тревожные = items.filter((m) => medicineAlert(m, now) !== null)
  const названия = тревожные.slice(0, 2).map((m) => m.name.trim()).filter(Boolean)
  const список =
    названия.length === 0
      ? 'Что-то заканчивается или у чего-то истекает срок годности.'
      : `${названия.join(', ')}${тревожные.length > названия.length ? ` и ещё ${тревожные.length - названия.length}` : ''}.`

  return (
    <Banner tone="warning">
      <b>
        Аптечка: {count} {plural(count, 'препарат требует', 'препарата требуют', 'препаратов требуют')} внимания
      </b>
      {/* Названия, а не «что-то»: приложение знает, о чём речь, и молчать об
          этом — заставлять открывать аптечку ради того, что можно сказать. */}
      <div style={{ marginTop: 4 }}>{список}</div>
      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <button className="btn" onClick={onOpen}>
          Открыть аптечку
        </button>
        <button className="btn btn--sm" onClick={onDismiss}>
          Понятно
        </button>
      </div>
    </Banner>
  )
}

const REASON_LABEL: Record<'out' | 'low' | 'expired' | 'expiring', string> = {
  out: 'закончился',
  expired: 'просрочен',
  low: 'кончается',
  expiring: 'истекает срок',
}

/**
 * Что пора купить.
 *
 * Отдельный экран, а не пометки в общем списке: в аптеке и в аптечном
 * приложении нужен готовый перечень, а не разбор десяти карточек. Список
 * отдаётся простым текстом — его вставляют в мессенджер, диктуют по телефону
 * и читают с экрана у прилавка.
 */
/**
 * «Сегодня» на «Обзоре»: что принять и сколько уже отмечено.
 *
 * Строки без кнопок — отмечают на «Приёме». Здесь только ответ на вопрос
 * «что мне сегодня», ради которого человек и открывает приложение утром.
 */
export function TodayCard({ medicines, onOpen }: { medicines: Medicine[]; onOpen: () => void }) {
  const now = Date.now()
  const rows = medicines
    .flatMap((medicine) => dosesToday(medicine, now).map((slot) => ({ medicine, slot })))
    .sort((a, b) => a.slot.time.localeCompare(b.slot.time))
  if (rows.length === 0) return null
  const left = rows.filter((r) => r.slot.takenAt === null).length

  return (
    <div className="card">
      <div className="card__head">
        <h2>Сегодня</h2>
        <span className="muted">{left === 0 ? 'всё отмечено' : `осталось отметить: ${left}`}</span>
      </div>
      <ul className="today">
        {rows.map(({ medicine, slot }) => (
          <li key={`${medicine.id}-${slot.time}`} className="today__row" data-done={slot.takenAt !== null} data-overdue={slot.overdue}>
            <span className="today__time">{slot.time}</span>
            <span className="today__name">
              {medicine.name}
              {medicine.dose && <span className="today__dose"> {medicine.dose}</span>}
            </span>
            <span className="today__mark" aria-label={slot.takenAt !== null ? 'принято' : slot.overdue ? 'пропущено' : 'ещё не время'}>
              {slot.takenAt !== null ? '✓' : slot.overdue ? '!' : ''}
            </span>
          </li>
        ))}
      </ul>
      {left > 0 && (
        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
          <button className="btn btn--primary" onClick={onOpen}>
            Отметить приём
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * «Заканчивается» на «Обзоре»: названия и сроки, а не «что-то заканчивается».
 * Пусто — карточки нет: спокойствие не нуждается в подтверждении.
 */
export function ShortageCard({ medicines, onOpen }: { medicines: Medicine[]; onOpen: () => void }) {
  const now = Date.now()
  const rows = sortMedicines(medicines, now)
    .map((medicine) => ({ medicine, alert: medicineAlert(medicine, now) }))
    .filter((r): r is { medicine: Medicine; alert: MedicineAlert } => r.alert !== null)
  if (rows.length === 0) return null

  return (
    <div className="card">
      <div className="card__head">
        <h2>Заканчивается</h2>
        <span className="muted">
          {rows.length} {plural(rows.length, 'препарат', 'препарата', 'препаратов')}
        </span>
      </div>
      <ul className="shortage">
        {rows.map(({ medicine, alert }) => (
          <li key={medicine.id} className="shortage__row" data-tone={ALERT_TONE[alert.kind]}>
            <span className="shortage__name">{medicine.name}</span>
            <span className="shortage__why">{alertText(alert, medicine)}</span>
          </li>
        ))}
      </ul>
      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <button className="btn" onClick={onOpen}>
          В аптечку
        </button>
      </div>
    </div>
  )
}

export function Restock({
  medicines,
  ownerName,
  pharmacies = [],
}: {
  medicines: Medicine[]
  /** Чья коробка — в сводном списке семьи. Пусто, когда человек один. */
  ownerName?: (medicine: Medicine) => string | null
  /** Выбранные аптеки: под каждой строкой появятся ссылки на поиск. */
  pharmacies?: readonly string[]
}) {
  // Все состояния объявлены до единственного выхода ниже. Иначе при пустом
  // списке покупок React насчитывает меньше хуков, чем в прошлый раз, и роняет
  // всё приложение в белый экран — ровно это и случилось у человека, который
  // переключился на того, кому покупать нечего.
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const list = restockList(medicines, Date.now())
  if (list.length === 0) return null

  // Галочки и заголовок: список уходит сообщением в мессенджер, и там он
  // должен читаться списком, а не абзацем.
  const text = restockText(list, ownerName, { checklist: true })

  const copy = async () => {
    const ok = await copyTextOut(text)
    setFailed(!ok)
    if (!ok) return
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="card">
      <div className="card__head">
        <h2>Купить</h2>
        <span className="muted">
          {list.length} {plural(list.length, 'препарат', 'препарата', 'препаратов')}
        </span>
      </div>

      <ul className="buy">
        {list.map(({ medicine, reason, need }) => (
          <li key={medicine.id} className="buy__row">
            <span className="buy__body">
              <span className="buy__name">{medicine.name}</span>
              {/* Имя владельца в строке покупок: без него список «что купить»
                  на всю семью не говорит, кому именно, а в аптеке это и есть
                  главный вопрос — брать одну пачку или две. */}
              {ownerName?.(medicine) && <span className="buy__owner">{ownerName(medicine)}</span>}
              {medicine.dose && <span className="buy__dose">{medicine.dose}</span>}
              <span className="buy__why" data-reason={reason}>
                {REASON_LABEL[reason]}
              </span>
              {medicine.inn && medicine.inn !== medicine.name && (
                <span className="buy__inn">по веществу: {medicine.inn}</span>
              )}
            </span>
            {/* Ссылки прямо в строке списка: человек стоит перед выбором «где
                взять» ровно здесь, а не на карточке препарата. */}
            {pharmacyLinks(medicine, pharmacies).length > 0 && (
              <span className="buy__where no-print">
                {pharmacyLinks(medicine, pharmacies).map((аптека) => (
                  <a
                    key={аптека.id}
                    href={аптека.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => {
                      // Через порт: на телефоне ссылку перехватывает приложение
                      // аптеки и открывается на своей главной, теряя запрос.
                      event.preventDefault()
                      void platform().files.openExternal(аптека.href)
                    }}
                  >
                    {аптека.name}
                  </a>
                ))}
                {pharmacyLinks(medicine, pharmacies).find((a) => a.innHref) && (
                  <a
                    href={pharmacyLinks(medicine, pharmacies).find((a) => a.innHref)!.innHref!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => {
                      event.preventDefault()
                      void platform().files.openExternal(pharmacyLinks(medicine, pharmacies).find((a) => a.innHref)!.innHref!)
                    }}
                  >
                    по веществу
                  </a>
                )}
              </span>
            )}
            {need !== null && (
              <span className="buy__need">
                {packsNeeded(medicine, need) !== null ? (
                  <>
                    {packsNeeded(medicine, need)} {plural(packsNeeded(medicine, need)!, 'пачка', 'пачки', 'пачек')}
                    <span className="fact__note">по {medicine.packSize} шт.</span>
                  </>
                ) : (
                  `${need} шт.`
                )}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="row row--stack" style={{ marginTop: 'var(--space-4)' }}>
        {canShareFile() && (
          <button
            className="btn btn--primary"
            // Текстом, а не файлом «купить.txt»: получатель видит сообщение в
            // ленте, а не вложение, которое надо открыть и которое непонятно
            // как называется.
            onClick={() => void shareTextOut(text, 'Купить в аптеке')}
          >
            Отправить список
          </button>
        )}
        <button className={canShareFile() ? 'btn' : 'btn btn--primary'} onClick={() => void copy()}>
          {copied ? 'Скопировано' : 'Скопировать'}
        </button>
      </div>

      {failed && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Banner tone="critical">
            Скопировать не вышло — телефон не дал доступ к буферу обмена. Отправьте список кнопкой рядом.
          </Banner>
        </div>
      )}

      <p className="muted" style={{ margin: 'var(--space-3) 0 0' }}>
        Количество рассчитано на {RESTOCK_DAYS} {plural(RESTOCK_DAYS, 'день', 'дня', 'дней')}
        {ownerName ? ' по расписанию каждого.' : ' по вашему расписанию.'}
        {/* Фраза про просроченную пачку выводилась всегда, даже когда в списке
            одни «кончается». Человек 75 лет читал запрет принимать лекарство,
            шёл искать несуществующую просроченную пачку — а в худшем случае
            решал, что нельзя пить ту, что лежит дома. */}
        {list.some((item) => item.reason === 'expired') && (
          <> Просроченная пачка в запас не засчитана — принимать её нельзя.</>
        )}
      </p>
    </div>
  )
}

/** «26 августа» — дата, когда запас кончится. Она нагляднее, чем «через 13 дней». */
const dayMonth = (ts: number): string => {
  const d = new Date(ts)
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`
}

/** Горизонт полосы запаса. Дальше месяца загадывать бессмысленно, а полоса всё равно полна. */
const SUPPLY_HORIZON = 30

/**
 * Прогноз запаса: полоса и подпись.
 *
 * Полоса нужна для взгляда мельком — заполнена наполовину или почти пуста
 * видно быстрее, чем читается число. Смысл при этом несёт подпись: полоса
 * скрыта от скринридера, дублировать её словами нечем.
 */
export function Supply({ days, until }: { days: number; until: number | null }) {
  const state = days <= 0 ? 'critical' : days <= SUPPLY_SOON_DAYS ? 'warning' : 'ok'
  const fill = Math.max(2, Math.min(100, Math.round((days / SUPPLY_HORIZON) * 100)))

  return (
    <div className="supply" data-state={state}>
      <div className="supply__track" aria-hidden="true">
        <div className="supply__fill" style={{ width: `${fill}%` }} />
      </div>
      <div className="supply__text">
        {days <= 0 ? 'Запас кончился' : <>Хватит на {days} {plural(days, 'день', 'дня', 'дней')}</>}
        {until !== null && days > 0 && <span className="muted"> · до {dayMonth(until)}</span>}
      </div>
    </div>
  )
}
