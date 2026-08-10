import type { Reading } from '../types'
import { CategoryBadge } from './bits'

const DATE_TIME = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const SOURCE_LABELS: Record<Reading['source'], string> = {
  device: 'прибор',
  manual: 'вручную',
  import: 'импорт',
}

const ARM_LABELS: Record<string, string> = { left: 'левая рука', right: 'правая рука' }

export function Readings({ readings, onDelete }: { readings: Reading[]; onDelete?: (id: string) => void }) {
  if (readings.length === 0) {
    return <div className="chart__empty">Пока нет измерений за выбранный период</div>
  }

  // Самые свежие сверху — так удобнее и на экране, и в распечатке.
  const rows = [...readings].sort((a, b) => b.ts - a.ts)

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Дата и время</th>
            <th>САД/ДАД</th>
            <th>Категория</th>
            <th>Пульс</th>
            <th>Отметки</th>
            <th>Примечание</th>
            {onDelete && <th className="no-print" aria-label="Удалить" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((reading) => {
            const marks = [
              reading.ihb && 'аритмия',
              reading.mov && 'движение',
              reading.arm && ARM_LABELS[reading.arm],
            ].filter(Boolean)
            return (
              <tr key={reading.id}>
                <td>{DATE_TIME.format(reading.ts)}</td>
                <td className="num">
                  {reading.sys}/{reading.dia}
                </td>
                <td>
                  <CategoryBadge sys={reading.sys} dia={reading.dia} />
                </td>
                <td>{reading.bpm ?? '—'}</td>
                <td className="wrap">{marks.length ? marks.join(', ') : '—'}</td>
                <td className="wrap">
                  {reading.note ? `${reading.note} · ` : ''}
                  <span className="muted">{SOURCE_LABELS[reading.source]}</span>
                </td>
                {onDelete && (
                  <td className="no-print">
                    <button
                      className="btn btn--icon"
                      title="Удалить измерение"
                      aria-label={`Удалить измерение от ${DATE_TIME.format(reading.ts)}`}
                      onClick={() => onDelete(reading.id)}
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
