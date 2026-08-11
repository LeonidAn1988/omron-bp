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
  device: 'с прибора',
  manual: 'вручную',
  import: 'из файла',
}

const ARM_LABELS: Record<string, string> = { left: 'левая рука', right: 'правая рука' }

/**
 * На широком экране — таблица, на телефоне — список карточек-строк.
 * Раскладку целиком берёт на себя CSS через data-col: разметка одна и та же,
 * поэтому печатный отчёт использует этот же компонент без оговорок.
 */
export function Readings({ readings, onDelete }: { readings: Reading[]; onDelete?: (id: string) => void }) {
  if (readings.length === 0) {
    return <div className="chart__empty">За выбранный период измерений нет</div>
  }

  const rows = [...readings].sort((a, b) => b.ts - a.ts)

  return (
    <div className="table-scroll">
      <table className="readings-table">
        <thead>
          <tr>
            <th>Дата и время</th>
            <th>Верхнее / нижнее</th>
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
                <td data-col="when">{DATE_TIME.format(reading.ts)}</td>
                <td data-col="val" className="num">
                  {reading.sys}/{reading.dia}
                </td>
                <td data-col="cat">
                  <CategoryBadge sys={reading.sys} dia={reading.dia} />
                </td>
                {/* Прочерк нужен таблице, чтобы колонка не выглядела сломанной,
                    но в мобильном списке он превращается в шум — прячется в CSS. */}
                <td data-col="bpm">
                  {reading.bpm ? `${reading.bpm} уд/мин` : <span className="dash-only">—</span>}
                </td>
                <td data-col="marks" className="wrap">
                  {marks.length ? marks.join(', ') : <span className="dash-only">—</span>}
                </td>
                <td data-col="note" className="wrap">
                  {reading.note ? `${reading.note} · ` : ''}
                  <span className="muted">{SOURCE_LABELS[reading.source]}</span>
                </td>
                {onDelete && (
                  <td data-col="del" className="no-print">
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
