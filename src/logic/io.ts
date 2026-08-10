import type { Reading } from '../types'
import { readingId } from '../db/store'

// ── экспорт ────────────────────────────────────────────────────────────────

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(readings: Reading[]): string {
  const header = ['datetime', 'sys', 'dia', 'bpm', 'ihb', 'mov', 'user', 'source', 'note']
  const rows = readings.map((r) =>
    [formatDateTime(r.ts), r.sys, r.dia, r.bpm ?? '', r.ihb ? 1 : 0, r.mov ? 1 : 0, r.user, r.source, r.note ?? '']
      .map(csvCell)
      .join(','),
  )
  // BOM — чтобы Excel не ломал кириллицу в примечаниях.
  return '﻿' + [header.join(','), ...rows].join('\n')
}

export function toJson(readings: Reading[]): string {
  return JSON.stringify({ format: 'omron-bp/v1', exportedAt: new Date().toISOString(), readings }, null, 2)
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── импорт ─────────────────────────────────────────────────────────────────

const HEADER_ALIASES: Record<string, string[]> = {
  datetime: ['datetime', 'date_time', 'timestamp', 'дата и время', 'датавремя'],
  date: ['date', 'дата', 'measurement date'],
  time: ['time', 'время', 'measurement time'],
  sys: ['sys', 'systolic', 'systolic (mmhg)', 'сад', 'систолическое', 'верхнее', 'верхнее давление'],
  dia: ['dia', 'diastolic', 'diastolic (mmhg)', 'дад', 'диастолическое', 'нижнее', 'нижнее давление'],
  bpm: ['bpm', 'pulse', 'pulse (bpm)', 'heart rate', 'heartrate', 'пульс', 'чсс'],
  ihb: ['ihb', 'irregular', 'irregular heartbeat', 'нерегулярное сердцебиение', 'аритмия'],
  mov: ['mov', 'movement', 'body movement', 'движение'],
  user: ['user', 'пользователь'],
  note: ['note', 'notes', 'comment', 'memo', 'msg', 'примечание', 'заметка', 'комментарий'],
}

function detectDelimiter(line: string): string {
  const counts = [',', ';', '\t'].map((d) => [d, line.split(d).length] as const)
  return counts.sort((a, b) => b[1] - a[1])[0][0]
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else quoted = false
      } else current += char
    } else if (char === '"') quoted = true
    else if (char === delimiter) {
      cells.push(current)
      current = ''
    } else current += char
  }
  cells.push(current)
  return cells.map((c) => c.trim())
}

function mapHeaders(headers: string[]): Record<string, number> {
  const normalized = headers.map((h) => h.replace(/^﻿/, '').trim().toLowerCase())
  const map: Record<string, number> = {}
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = normalized.findIndex((h) => aliases.includes(h))
    if (index >= 0) map[field] = index
  }
  return map
}

/** Разбирает дату из распространённых форматов: ISO, `ДД.ММ.ГГГГ`, `ДД/ММ/ГГГГ`, `ГГГГ-ММ-ДД`. */
export function parseDateTime(datePart: string, timePart = ''): number | null {
  const text = `${datePart} ${timePart}`.trim()
  if (!text) return null

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{1,2})?:?(\d{2})?:?(\d{2})?/)
  if (iso) {
    return new Date(+iso[1], +iso[2] - 1, +iso[3], +(iso[4] ?? 0), +(iso[5] ?? 0), +(iso[6] ?? 0)).getTime()
  }

  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\D*(\d{1,2})?:?(\d{2})?:?(\d{2})?/)
  if (dmy) {
    const year = +dmy[3] < 100 ? 2000 + +dmy[3] : +dmy[3]
    return new Date(year, +dmy[2] - 1, +dmy[1], +(dmy[4] ?? 0), +(dmy[5] ?? 0), +(dmy[6] ?? 0)).getTime()
  }

  const fallback = Date.parse(text)
  return Number.isNaN(fallback) ? null : fallback
}

const truthy = (value: string | undefined) =>
  !!value && ['1', 'true', 'yes', 'да', 'y'].includes(value.trim().toLowerCase())

export interface ImportResult {
  readings: Reading[]
  skipped: number
}

export function parseCsv(text: string): ImportResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return { readings: [], skipped: 0 }

  const delimiter = detectDelimiter(lines[0])
  const headers = splitCsvLine(lines[0], delimiter)
  const columns = mapHeaders(headers)
  if (columns.sys === undefined || columns.dia === undefined) {
    throw new Error('В файле не найдены столбцы с систолическим и диастолическим давлением')
  }

  const readings: Reading[] = []
  let skipped = 0

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, delimiter)
    const sys = Number(cells[columns.sys])
    const dia = Number(cells[columns.dia])
    const ts =
      columns.datetime !== undefined
        ? parseDateTime(cells[columns.datetime])
        : parseDateTime(cells[columns.date ?? -1] ?? '', cells[columns.time ?? -1] ?? '')

    if (!ts || !Number.isFinite(sys) || !Number.isFinite(dia) || sys <= 0 || dia <= 0) {
      skipped++
      continue
    }

    const bpmRaw = columns.bpm !== undefined ? Number(cells[columns.bpm]) : NaN
    const user = columns.user !== undefined ? Number(cells[columns.user]) || 1 : 1

    readings.push({
      id: readingId(user, ts),
      ts,
      sys,
      dia,
      bpm: Number.isFinite(bpmRaw) && bpmRaw > 0 ? bpmRaw : null,
      ihb: truthy(cells[columns.ihb ?? -1]),
      mov: truthy(cells[columns.mov ?? -1]),
      user,
      source: 'import',
      note: cells[columns.note ?? -1] || undefined,
    })
  }

  return { readings, skipped }
}

/** Формат ubpm.json из omblepy и собственный бэкап приложения. */
export function parseJson(text: string): ImportResult {
  const data = JSON.parse(text)

  if (Array.isArray(data?.readings)) {
    const readings = (data.readings as Reading[]).filter((r) => r && r.ts && r.sys && r.dia)
    return { readings, skipped: (data.readings as unknown[]).length - readings.length }
  }

  if (data?.UBPM && typeof data.UBPM === 'object') {
    const readings: Reading[] = []
    let skipped = 0
    for (const [userKey, entries] of Object.entries(data.UBPM as Record<string, unknown[]>)) {
      const user = Number(userKey.replace(/\D/g, '')) || 1
      for (const entry of entries as Record<string, unknown>[]) {
        const ts = parseDateTime(String(entry.date ?? ''), String(entry.time ?? ''))
        const sys = Number(entry.sys)
        const dia = Number(entry.dia)
        if (!ts || !sys || !dia) {
          skipped++
          continue
        }
        readings.push({
          id: readingId(user, ts),
          ts,
          sys,
          dia,
          bpm: Number(entry.bpm) || null,
          ihb: Number(entry.ihb) === 1,
          mov: Number(entry.mov) === 1,
          user,
          source: 'import',
          note: String(entry.msg ?? '') || undefined,
        })
      }
    }
    return { readings, skipped }
  }

  throw new Error('Неизвестный формат JSON. Ожидается бэкап этого приложения или ubpm.json от omblepy.')
}

export function parseImportFile(filename: string, text: string): ImportResult {
  return filename.toLowerCase().endsWith('.json') ? parseJson(text) : parseCsv(text)
}
