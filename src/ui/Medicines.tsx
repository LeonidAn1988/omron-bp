import { useState } from 'react'
import type { Medicine } from '../types'
import {
  packsNeeded,
  restockList,
  restockText,
  shortForm,
  RESTOCK_DAYS,
  SUPPLY_SOON_DAYS,
  type MedicineAlert,
} from '../logic/medicines'
import { plural } from '../logic/plural'
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

export function MedicineNudge({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count === 0) return null

  return (
    <Banner tone="warning">
      <b>
        Аптечка: {count} {plural(count, 'препарат требует', 'препарата требуют', 'препаратов требуют')} внимания
      </b>
      <div style={{ marginTop: 4 }}>Что-то заканчивается или у чего-то истекает срок годности.</div>
      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <button className="btn" onClick={onOpen}>
          Открыть аптечку
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
export function Restock({ medicines }: { medicines: Medicine[] }) {
  const [copied, setCopied] = useState(false)
  const list = restockList(medicines, Date.now())
  if (list.length === 0) return null

  const text = restockText(list)

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
              {medicine.dose && <span className="buy__dose">{medicine.dose}</span>}
              <span className="buy__why" data-reason={reason}>
                {REASON_LABEL[reason]}
              </span>
              {medicine.inn && medicine.inn !== medicine.name && (
                <span className="buy__inn">по веществу: {medicine.inn}</span>
              )}
            </span>
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
        Количество рассчитано на {RESTOCK_DAYS} {plural(RESTOCK_DAYS, 'день', 'дня', 'дней')} по вашему расписанию. Просроченная пачка в запас не засчитана —
        принимать её нельзя.
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
