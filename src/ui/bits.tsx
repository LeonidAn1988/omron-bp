import type { ReactNode } from 'react'
import { classify } from '../logic/classify'
import { BackIcon, ChevronIcon } from './icons'

/**
 * Цветовая метка категории давления. Цвет всегда идёт вместе с названием —
 * ни одно значение не передаётся одним лишь цветом.
 */
export function CategoryBadge({ sys, dia, solid = false }: { sys: number; dia: number; solid?: boolean }) {
  const category = classify(sys, dia)
  return (
    <span className={solid ? 'badge badge--solid' : 'badge'} style={{ ['--dot' as string]: category.color }}>
      <span className="badge__dot" />
      {category.label}
    </span>
  )
}

export function Tile({
  label,
  value,
  unit,
  note,
  children,
}: {
  label: string
  value?: ReactNode
  unit?: string
  note?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="card">
      <div className="tile__label">{label}</div>
      {value !== undefined && (
        <div className="tile__value">
          {value}
          {unit && <span className="tile__unit">{unit}</span>}
        </div>
      )}
      {children}
      {note && <div className="tile__note">{note}</div>}
    </div>
  )
}

export type BannerTone = 'critical' | 'warning' | 'info' | 'good'

const BANNER_ICONS: Record<BannerTone, string> = {
  critical: '⚠',
  warning: '⚠',
  info: 'ℹ',
  good: '✓',
}

export function Banner({ tone, children }: { tone: BannerTone; children: ReactNode }) {
  return (
    <div className={`banner banner--${tone}`}>
      <span className="banner__icon" aria-hidden="true">
        {BANNER_ICONS[tone]}
      </span>
      <div>{children}</div>
    </div>
  )
}

/**
 * Строка списка, ведущая на другой экран: заголовок, текущее значение, шеврон.
 *
 * Значение здесь обязательно. Список из одних названий заставляет открывать
 * все шесть подэкранов подряд, чтобы вспомнить, что настроено, — а приходят в
 * настройки обычно ради одного.
 *
 * Разметка та же, что у строки препарата в аптечке: приём уже опознан, и
 * заводить ради настроек второй вид списка незачем.
 */
export function NavRow({ title, value, onOpen }: { title: string; value?: string; onOpen: () => void }) {
  return (
    <li className="pill">
      <button className="pill__open" onClick={onOpen}>
        <span className="pill__head">
          <span className="pill__title">
            <span className="pill__name">{title}</span>
          </span>
          <ChevronIcon />
        </span>
        {value && <span className="pill__sub">{value}</span>}
      </button>
    </li>
  )
}

/**
 * Возврат на уровень выше.
 *
 * Та же кнопка, что над карточкой препарата. Она обязана делать ровно то же,
 * что аппаратная «Назад»: двух разных ответов на «назад» в приложении быть не
 * должно.
 */
export function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="row no-print">
      <button className="btn" onClick={onBack}>
        <BackIcon />
        {label}
      </button>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

/**
 * Плавное раскрытие вместо мгновенного появления.
 * Анимируется grid-template-rows, а не height — содержимое не прыгает и
 * не нужно знать его высоту заранее.
 *
 * inert обязателен: нулевая высота с overflow: hidden прячет содержимое только
 * визуально, а скринридер продолжал бы зачитывать свёрнутые баннеры, и в них же
 * оставались бы досягаемые с клавиатуры кнопки.
 */
export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className="reveal" data-open={open} inert={!open}>
      <div>{children}</div>
    </div>
  )
}
