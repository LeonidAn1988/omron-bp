import { useState } from 'react'
import type { Medicine } from '../types'
import {
  medicineAlert,
  packsNeeded,
  restockList,
  restockText,
  shortForm,
  RESTOCK_DAYS,
  SUPPLY_SOON_DAYS,
  type MedicineAlert,
} from '../logic/medicines'
import { KIND_LABEL } from '../logic/drugs'
import { plural } from '../logic/plural'
import { pharmacyLinks } from '../logic/pharmacies'
import { canShareFile, download, shareFile } from '../logic/io'
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

export const monthYear = (ts: number): string => {
  const d = new Date(ts)
  return `${MONTHS_GENITIVE[d.getMonth()]} ${d.getFullYear()}`
}

/** Форма коротко: в списке нужно одно слово — таблетки это, капли или гель. */
export const shortFormOf = shortForm

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
  const [copied, setCopied] = useState(false)
  const list = restockList(medicines, Date.now())
  if (list.length === 0) return null

  const text = restockText(list, ownerName)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Буфер обмена бывает запрещён политикой страницы. Молчать нельзя:
      // человек нажал и ждёт, поэтому предлагаем файл.
      await download('купить.txt', text, 'text/plain')
    }
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
                  <a key={аптека.id} href={аптека.href} target="_blank" rel="noopener noreferrer">
                    {аптека.name}
                  </a>
                ))}
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

      <div className="row" style={{ marginTop: 'var(--space-4)' }}>
        {canShareFile() && (
          <button
            className="btn btn--primary"
            onClick={() => void shareFile('купить.txt', text, 'text/plain')}
          >
            Отправить список
          </button>
        )}
        <button className={canShareFile() ? 'btn' : 'btn btn--primary'} onClick={() => void copy()}>
          {copied ? 'Скопировано' : 'Скопировать'}
        </button>
      </div>

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
