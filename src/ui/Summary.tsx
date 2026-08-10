import type { Reading } from '../types'
import type { Summary as SummaryData } from '../logic/stats'
import { alertFor, classify } from '../logic/classify'
import { Banner, CategoryBadge, Tile } from './bits'

const FULL_DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/** Предупреждение по последнему измерению — самое срочное, что приложение может сказать. */
export function LatestAlert({ latest }: { latest: Reading | null }) {
  if (!latest) return null
  const alert = alertFor(latest.sys, latest.dia)
  if (!alert) return null
  const tone = alert.kind === 'crisis' ? 'critical' : alert.kind === 'severe' ? 'warning' : 'info'
  return (
    <Banner tone={tone}>
      <b>
        Последнее измерение: {latest.sys}/{latest.dia}
      </b>{' '}
      — {classify(latest.sys, latest.dia).label.toLowerCase()}. {alert.text}
      <div className="muted" style={{ marginTop: 4 }}>
        {FULL_DATE.format(latest.ts)}
      </div>
    </Banner>
  )
}

export function SummaryTiles({ summary, targetSys, targetDia }: { summary: SummaryData; targetSys: number; targetDia: number }) {
  const avgSys = Math.round(summary.avgSys)
  const avgDia = Math.round(summary.avgDia)
  const inTarget = Math.round(summary.withinTarget * 100)
  const delta = summary.morningEveningDelta

  return (
    <div className="grid grid--cards">
      <Tile label="Среднее давление" value={`${avgSys}/${avgDia}`} unit="мм рт. ст.">
        <div style={{ marginTop: 8 }}>
          <CategoryBadge sys={avgSys} dia={avgDia} solid />
        </div>
      </Tile>

      <Tile
        label="В целевом диапазоне"
        value={`${inTarget}%`}
        note={`цель ниже ${targetSys}/${targetDia} · измерений ${summary.count}`}
      />

      <Tile
        label="Средний пульс"
        value={summary.avgBpm ? Math.round(summary.avgBpm) : '—'}
        unit={summary.avgBpm ? 'уд/мин' : undefined}
        note={summary.avgBpm ? undefined : 'нет данных'}
      />

      <Tile
        label="Разброс систолического"
        value={`±${summary.sdSys.toFixed(1)}`}
        note={`от ${summary.minSys} до ${summary.maxSys} мм рт. ст.`}
      />

      <Tile
        label="Утро минус вечер"
        value={delta === null ? '—' : `${delta > 0 ? '+' : ''}${Math.round(delta)}`}
        unit={delta === null ? undefined : 'мм рт. ст.'}
        note={delta === null ? 'нужны измерения утром и вечером' : 'по систолическому давлению'}
      />

      <Tile
        label="Отметки прибора"
        value={summary.ihbCount}
        note={
          <>
            раз нерегулярное сердцебиение
            {summary.movCount > 0 && <> · движение: {summary.movCount}</>}
          </>
        }
      />
    </div>
  )
}
