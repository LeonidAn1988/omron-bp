import { useCallback, useRef, useState } from 'react'
import type { LogLevel } from '../ble/protocol'

export interface LogLine {
  id: number
  time: string
  level: LogLevel
  message: string
}

const TIME = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function useBleLog() {
  const [lines, setLines] = useState<LogLine[]>([])
  const counter = useRef(0)

  const log = useCallback((level: LogLevel, message: string) => {
    counter.current += 1
    const line = { id: counter.current, time: TIME.format(new Date()), level, message }
    // Держим только хвост: обмен с прибором генерирует сотни строк в debug-режиме.
    setLines((prev) => [...prev.slice(-600), line])
  }, [])

  const clear = useCallback(() => setLines([]), [])
  return { lines, log, clear }
}

export function BleLog({ lines, showDebug }: { lines: LogLine[]; showDebug: boolean }) {
  const visible = showDebug ? lines : lines.filter((line) => line.level !== 'debug')
  const endRef = useRef<HTMLDivElement>(null)

  if (visible.length === 0) {
    return <div className="muted">Журнал пуст. Здесь появится ход обмена с прибором.</div>
  }

  return (
    // tabIndex делает область прокручиваемой с клавиатуры: фокусируемых потомков
    // внутри нет, и без этого до содержимого журнала не добраться без мыши.
    <div className="log" tabIndex={0} role="region" aria-label="Журнал обмена с прибором">
      {visible.map((line) => (
        <div className={`log__line log__line--${line.level}`} key={line.id}>
          <span className="log__time">{line.time}</span>
          <span className="log__msg">{line.message}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

export function logToText(lines: LogLine[]): string {
  return lines.map((line) => `${line.time} [${line.level}] ${line.message}`).join('\n')
}
