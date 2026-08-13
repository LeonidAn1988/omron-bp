import { GLUCOSE_CONTEXT_LABELS, type BpReading, type GlucoseContext, type GlucoseReading, type Medicine } from '../types'
import { PERIODS, type GlucoseSummary, type PeriodKey, type Summary } from '../logic/stats'
import { DAY_PART_LABELS, classify, classifyGlucose, glucoseCeiling, type DayPart, type GlucoseTargets } from '../logic/classify'
import { Readings } from './Readings'
import { GlucoseList } from './Glucose'
import { CategoryBadge } from './bits'
import { perDayOf } from '../logic/medicines'
import { plural } from '../logic/plural'

const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
const DAY_PART_ORDER: DayPart[] = ['morning', 'day', 'evening', 'night']
const GLUCOSE_ORDER: GlucoseContext[] = ['fasting', 'before-meal', 'after-meal', 'bedtime', 'night']

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td style={{ color: 'var(--text-muted)' }}>{label}</td>
      <td className="wrap">{children}</td>
    </tr>
  )
}

const MEAL_NOTE: Record<'before' | 'after' | 'any', string> = {
  before: ', до еды',
  after: ', после еды',
  any: '',
}

export function Report({
  readings,
  summary,
  glucoseReadings,
  glucoseSummary,
  glucoseTargets,
  patient,
  periodLabel,
  targetSys,
  targetDia,
  period,
  onPeriodChange,
  medicines,
}: {
  readings: BpReading[]
  summary: Summary | null
  glucoseReadings: GlucoseReading[]
  glucoseSummary: GlucoseSummary | null
  glucoseTargets: GlucoseTargets
  patient: string
  periodLabel: string
  targetSys: number
  targetDia: number
  period: PeriodKey
  onPeriodChange: (next: PeriodKey) => void
  /** Аптечка попадает в отчёт: на приёме врачу нужен список того, что человек принимает. */
  medicines: Medicine[]
}) {
  // Период — орган управления отчётом, поэтому стоит рядом с кнопкой печати,
  // а не в общей шапке приложения. Ограничений по периоду нет: «Всё время»
  // доступно всегда и бесплатно.
  const picker = (
    <div className="segmented no-print" role="group" aria-label="Период отчёта">
      {PERIODS.map((item) => (
        <button key={item.key} aria-pressed={period === item.key} onClick={() => onPeriodChange(item.key)}>
          {item.label}
        </button>
      ))}
    </div>
  )

  if (!summary && !glucoseSummary) {
    return (
      <div className="stack">
        <div className="row no-print">{picker}</div>
        <div className="chart__empty">За выбранный период нет записей — отчёт формировать не из чего.</div>
      </div>
    )
  }

  const span = summary ?? glucoseSummary!

  return (
    <div className="stack">
      <div className="row no-print">
        <button className="btn btn--primary" onClick={() => window.print()}>
          Печать или сохранение в PDF
        </button>
        {picker}
      </div>
      <div className="muted no-print" style={{ marginTop: 'calc(var(--space-3) * -1)' }}>
        В диалоге печати выберите «Сохранить как PDF», чтобы отправить отчёт врачу файлом.
      </div>

      <div className="card">
        <div className="card__head">
          <h2>Дневник самоконтроля</h2>
          <span className="muted">составлен {DATE.format(Date.now())}</span>
        </div>
        <table className="report-facts">
          <tbody>
            <Row label="Кого касается">{patient}</Row>
            <Row label="Период">
              {periodLabel.toLowerCase()} — с {DATE.format(span.firstTs)} по {DATE.format(span.lastTs)}
            </Row>
          </tbody>
        </table>
      </div>

      {summary && (
        <>
          <div className="card">
            <div className="card__head">
              <h2>Артериальное давление</h2>
            </div>
            <table className="report-facts">
              <tbody>
                <Row label="Измерений">{summary.count}</Row>
                <Row label="Среднее давление">
                  <b>
                    {Math.round(summary.avgSys)}/{Math.round(summary.avgDia)}
                  </b>{' '}
                  мм рт. ст. · <CategoryBadge sys={Math.round(summary.avgSys)} dia={Math.round(summary.avgDia)} />
                </Row>
                <Row label="Средний пульс">
                  {summary.avgBpm ? `${Math.round(summary.avgBpm)} уд/мин` : 'нет данных'}
                </Row>
                <Row label="Разброс">
                  систолическое ±{summary.sdSys.toFixed(1)} (от {summary.minSys} до {summary.maxSys}), диастолическое ±
                  {summary.sdDia.toFixed(1)} (от {summary.minDia} до {summary.maxDia})
                </Row>
                <Row label="В целевом диапазоне">
                  {Math.round(summary.withinTarget * 100)}% измерений ниже {targetSys}/{targetDia}
                </Row>
                <Row label="Отметки прибора">
                  нерегулярное сердцебиение — {summary.ihbCount}, движение при измерении — {summary.movCount}
                </Row>
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card__head">
              <h2>Давление по времени суток</h2>
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
        </>
      )}

      {glucoseSummary && (
        <>
          <div className="card">
            <div className="card__head">
              <h2>Уровень глюкозы крови</h2>
            </div>
            <table className="report-facts">
              <tbody>
                <Row label="Замеров">{glucoseSummary.count}</Row>
                <Row label="Средний сахар">
                  <b>{glucoseSummary.avg.toFixed(1)}</b> ммоль/л (от {glucoseSummary.min.toFixed(1)} до{' '}
                  {glucoseSummary.max.toFixed(1)})
                </Row>
                <Row label="Разброс">±{glucoseSummary.sd.toFixed(1)} ммоль/л</Row>
                <Row label="В целевом диапазоне">
                  {Math.round(glucoseSummary.withinTarget * 100)}% замеров — с учётом момента замера: ниже{' '}
                  {glucoseTargets.fastingMax.toFixed(1)} натощак и {glucoseTargets.postMealMax.toFixed(1)} через два часа
                  после еды
                </Row>
                <Row label="Ниже порога">
                  {glucoseSummary.lowCount} раз ниже {glucoseTargets.low.toFixed(1)} ммоль/л
                </Row>
                <Row label="Выше цели">{glucoseSummary.highCount} раз</Row>
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card__head">
              <h2>Сахар по моменту замера</h2>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Момент замера</th>
                    <th>Замеров</th>
                    <th>Средний</th>
                    <th>Разброс</th>
                    <th>Оценка среднего</th>
                  </tr>
                </thead>
                <tbody>
                  {GLUCOSE_ORDER.filter((context) => glucoseSummary.byContext[context]).map((context) => {
                    const stats = glucoseSummary.byContext[context]!
                    return (
                      <tr key={context}>
                        <td className="wrap">{GLUCOSE_CONTEXT_LABELS[context]}</td>
                        <td>{stats.count}</td>
                        <td className="num">{stats.avg.toFixed(1)}</td>
                        <td>±{stats.sd.toFixed(1)}</td>
                        <td className="wrap">
                          {classifyGlucose(stats.avg, context, glucoseTargets).label} при норме ниже{' '}
                          {glucoseCeiling(context, glucoseTargets).toFixed(1)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {medicines.length > 0 && (
        <div className="card">
          <div className="card__head">
            <h2>Что принимает</h2>
            <span className="muted">со слов пациента</span>
          </div>
          {/* Три колонки, а не четыре: на узком экране четвёртая давала
              горизонтальную прокрутку. Действующее вещество ушло под название —
              на бумаге так тоже читается лучше. */}
          <table className="report-drugs">
            <thead>
              <tr>
                <th>Препарат</th>
                <th>Дозировка</th>
                <th>Схема приёма</th>
              </tr>
            </thead>
            <tbody>
              {[...medicines]
                .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
                .map((item) => {
                  const perDay = perDayOf(item)
                  const inn = item.inn && item.inn.toLowerCase() !== item.name.toLowerCase() ? item.inn : null
                  return (
                    <tr key={item.id}>
                      <td>
                        {item.name}
                        {inn && <div className="muted">{inn}</div>}
                      </td>
                      <td>
                        {item.dose || '—'}
                        {item.form && <div className="muted">{item.form.toLowerCase()}</div>}
                      </td>
                      <td>
                        {item.times?.length
                          ? `${item.times.join(', ')}${MEAL_NOTE[item.meal ?? 'any']}`
                          : perDay !== null
                            ? `${perDay} ${plural(perDay, 'раз', 'раза', 'раз')} в сутки`
                            : 'по потребности'}
                        {item.note && <div className="muted">{item.note}</div>}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}

      {summary && (
        <div className="card">
          <div className="card__head">
            <h2>Все измерения давления за период</h2>
          </div>
          <Readings readings={readings} />
        </div>
      )}

      {glucoseSummary && (
        <div className="card">
          <div className="card__head">
            <h2>Все замеры сахара за период</h2>
          </div>
          <GlucoseList readings={glucoseReadings} targets={glucoseTargets} />
        </div>
      )}

      <div className="muted" style={{ lineHeight: 1.6 }}>
        {medicines.length > 0 && (
          <>
            Перечень препаратов внесён пациентом самостоятельно и не является выпиской из назначений.{' '}
          </>
        )}
        Данные давления выгружены из тонометра Omron RS7 Intelli IT (HEM-6232T) и дополнены записями, внесёнными
        вручную; даты и время соответствуют часам прибора. Категории давления приведены по классификации ESC/ESH для
        измерений в кабинете, порогом нормы для домашних измерений принято {targetSys}/{targetDia} мм рт. ст. Оценка
        сахара дана относительно целевых значений {glucoseTargets.fastingMax.toFixed(1)} ммоль/л натощак и{' '}
        {glucoseTargets.postMealMax.toFixed(1)} ммоль/л через два часа после еды. Документ подготовлен неаттестованным
        приложением, не является медицинским заключением и не заменяет осмотр врача.
      </div>
    </div>
  )
}
