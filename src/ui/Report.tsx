import type { Reading } from '../types'
import type { Summary } from '../logic/stats'
import { DAY_PART_LABELS, classify, type DayPart } from '../logic/classify'
import { Readings } from './Readings'
import { CategoryBadge } from './bits'

const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

const DAY_PART_ORDER: DayPart[] = ['morning', 'day', 'evening', 'night']

export function Report({
  readings,
  summary,
  patient,
  periodLabel,
  targetSys,
  targetDia,
}: {
  readings: Reading[]
  summary: Summary | null
  patient: string
  periodLabel: string
  targetSys: number
  targetDia: number
}) {
  if (!summary) {
    return <div className="chart__empty">За выбранный период нет измерений — отчёт формировать не из чего.</div>
  }

  const avgSys = Math.round(summary.avgSys)
  const avgDia = Math.round(summary.avgDia)

  return (
    <div className="stack">
      <div className="row no-print">
        <button className="btn btn--primary" onClick={() => window.print()}>
          Печать или сохранение в PDF
        </button>
        <span className="muted">
          В диалоге печати выберите «Сохранить как PDF», чтобы отправить отчёт врачу файлом.
        </span>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Дневник артериального давления</h2>
          <span className="muted">составлен {DATE.format(Date.now())}</span>
        </div>

        <table style={{ maxWidth: 560 }}>
          <tbody>
            <tr>
              <td style={{ color: 'var(--text-muted)' }}>Кого касается</td>
              <td className="wrap">{patient}</td>
            </tr>
            <tr>
              <td style={{ color: 'var(--text-muted)' }}>Период</td>
              <td className="wrap">
                {periodLabel.toLowerCase()} — с {DATE.format(summary.firstTs)} по {DATE.format(summary.lastTs)}
              </td>
            </tr>
            <tr>
              <td style={{ color: 'var(--text-muted)' }}>Измерений</td>
              <td className="wrap">{summary.count}</td>
            </tr>
            <tr>
              <td style={{ color: 'var(--text-muted)' }}>Среднее давление</td>
              <td className="wrap">
                <b>
                  {avgSys}/{avgDia}
                </b>{' '}
                мм рт. ст. · <CategoryBadge sys={avgSys} dia={avgDia} />
              </td>
            </tr>
            <tr>
              <td style={{ color: 'var(--text-muted)' }}>Средний пульс</td>
              <td className="wrap">{summary.avgBpm ? `${Math.round(summary.avgBpm)} уд/мин` : 'нет данных'}</td>
            </tr>
            <tr>
              <td style={{ color: 'var(--text-muted)' }}>Разброс</td>
              <td className="wrap">
                систолическое ±{summary.sdSys.toFixed(1)} (от {summary.minSys} до {summary.maxSys}), диастолическое ±
                {summary.sdDia.toFixed(1)} (от {summary.minDia} до {summary.maxDia})
              </td>
            </tr>
            <tr>
              <td style={{ color: 'var(--text-muted)' }}>В целевом диапазоне</td>
              <td className="wrap">
                {Math.round(summary.withinTarget * 100)}% измерений ниже {targetSys}/{targetDia}
              </td>
            </tr>
            <tr>
              <td style={{ color: 'var(--text-muted)' }}>Отметки прибора</td>
              <td className="wrap">
                нерегулярное сердцебиение — {summary.ihbCount}, движение при измерении — {summary.movCount}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Средние по времени суток</h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Время суток</th>
                <th>Измерений</th>
                <th>САД/ДАД</th>
                <th>Категория</th>
                <th>Пульс</th>
              </tr>
            </thead>
            <tbody>
              {DAY_PART_ORDER.filter((part) => summary.byDayPart[part]).map((part) => {
                const agg = summary.byDayPart[part]!
                const sys = Math.round(agg.sys)
                const dia = Math.round(agg.dia)
                return (
                  <tr key={part}>
                    <td>{DAY_PART_LABELS[part]}</td>
                    <td>{agg.count}</td>
                    <td className="num">
                      {sys}/{dia}
                    </td>
                    <td className="wrap">{classify(sys, dia).label}</td>
                    <td>{agg.bpm ? Math.round(agg.bpm) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Все измерения за период</h2>
        </div>
        <Readings readings={readings} />
      </div>

      <div className="muted" style={{ lineHeight: 1.6 }}>
        Данные выгружены из тонометра Omron RS7 Intelli IT (HEM-6232T) и дополнены записями, внесёнными вручную. Даты и
        время соответствуют часам прибора. Категории приведены по классификации ESC/ESH для измерений в кабинете;
        порогом нормы для домашних измерений считается {targetSys}/{targetDia} мм рт. ст. Документ подготовлен
        неаттестованным приложением, не является медицинским заключением и не заменяет осмотр врача.
      </div>
    </div>
  )
}
