import type { GlucoseContext, Measurement } from '../types'
import { deviceMeasurementId } from '../db/store'
import { platform } from '../platform/ports'

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

/**
 * Один файл на оба дневника: колонка `kind` разделяет давление и сахар.
 * Так резервная копия остаётся одна, и её нельзя потерять по половинке.
 */
export function toCsv(items: Measurement[]): string {
  const header = ['datetime', 'kind', 'sys', 'dia', 'bpm', 'ihb', 'mov', 'mmol', 'context', 'user', 'source', 'note']
  const rows = items.map((m) =>
    [
      formatDateTime(m.ts),
      m.kind,
      m.kind === 'bp' ? m.sys : '',
      m.kind === 'bp' ? m.dia : '',
      m.kind === 'bp' ? (m.bpm ?? '') : '',
      m.kind === 'bp' ? (m.ihb ? 1 : 0) : '',
      m.kind === 'bp' ? (m.mov ? 1 : 0) : '',
      m.kind === 'glucose' ? m.mmol : '',
      m.kind === 'glucose' ? m.context : '',
      m.user,
      m.source,
      m.note ?? '',
    ]
      .map(csvCell)
      .join(','),
  )
  // BOM — чтобы Excel не ломал кириллицу в примечаниях.
  return '﻿' + [header.join(','), ...rows].join('\n')
}

export function toJson(items: Measurement[]): string {
  return JSON.stringify({ format: 'omron-bp/v2', exportedAt: new Date().toISOString(), measurements: items }, null, 2)
}

/** Как именно файл попадёт к пользователю, решает платформа. */
export function download(filename: string, content: string, mime: string): Promise<void> {
  return platform().files.save(filename, content, mime)
}

/** Умеет ли платформа передать файл в другое приложение. */
export function canShareFile(): boolean {
  return platform().files.canShare()
}

/** Отдать файл системному «поделиться». `false` — пользователь закрыл окно. */
export function shareFile(filename: string, content: string, mime: string): Promise<boolean> {
  return platform().files.share(filename, content, mime)
}

// ── импорт ─────────────────────────────────────────────────────────────────

const HEADER_ALIASES: Record<string, string[]> = {
  datetime: ['datetime', 'date_time', 'timestamp', 'дата и время', 'датавремя'],
  date: ['date', 'дата', 'measurement date'],
  time: ['time', 'время', 'measurement time'],
  kind: ['kind', 'type', 'вид', 'тип'],
  sys: ['sys', 'systolic', 'systolic (mmhg)', 'сад', 'систолическое', 'верхнее', 'верхнее давление'],
  dia: ['dia', 'diastolic', 'diastolic (mmhg)', 'дад', 'диастолическое', 'нижнее', 'нижнее давление'],
  bpm: ['bpm', 'pulse', 'pulse (bpm)', 'heart rate', 'heartrate', 'пульс', 'чсс'],
  ihb: ['ihb', 'irregular', 'irregular heartbeat', 'нерегулярное сердцебиение', 'аритмия'],
  mov: ['mov', 'movement', 'body movement', 'движение'],
  mmol: ['mmol', 'glucose', 'blood sugar', 'сахар', 'глюкоза', 'глюкоза (ммоль/л)', 'ммоль/л', 'сахар крови'],
  context: ['context', 'meal', 'момент', 'контекст', 'до/после еды', 'отметка'],
  user: ['user', 'пользователь'],
  note: ['note', 'notes', 'comment', 'memo', 'msg', 'примечание', 'заметка', 'комментарий'],
}

/** Как называется момент замера в чужих файлах и в нашем собственном экспорте. */
const CONTEXT_ALIASES: Record<string, GlucoseContext> = {
  fasting: 'fasting',
  натощак: 'fasting',
  'before-meal': 'before-meal',
  before: 'before-meal',
  'before meal': 'before-meal',
  'до еды': 'before-meal',
  'after-meal': 'after-meal',
  after: 'after-meal',
  'after meal': 'after-meal',
  'после еды': 'after-meal',
  'через 2 часа после еды': 'after-meal',
  bedtime: 'bedtime',
  'перед сном': 'bedtime',
  night: 'night',
  ночью: 'night',
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

/** Запятая как десятичный разделитель — норма в русских выгрузках. */
const num = (value: string | undefined): number => Number(String(value ?? '').replace(',', '.'))

function parseContext(value: string | undefined): GlucoseContext {
  const key = String(value ?? '').trim().toLowerCase()
  return CONTEXT_ALIASES[key] ?? 'before-meal'
}

export interface ImportResult {
  measurements: Measurement[]
  skipped: number
}

export function parseCsv(text: string): ImportResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return { measurements: [], skipped: 0 }

  const delimiter = detectDelimiter(lines[0])
  const headers = splitCsvLine(lines[0], delimiter)
  const columns = mapHeaders(headers)

  const hasBp = columns.sys !== undefined && columns.dia !== undefined
  const hasGlucose = columns.mmol !== undefined
  if (!hasBp && !hasGlucose) {
    throw new Error('В файле не нашлось ни давления, ни сахара — проверьте заголовки столбцов')
  }

  const measurements: Measurement[] = []
  let skipped = 0

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, delimiter)
    const ts =
      columns.datetime !== undefined
        ? parseDateTime(cells[columns.datetime])
        : parseDateTime(cells[columns.date ?? -1] ?? '', cells[columns.time ?? -1] ?? '')
    if (!ts) {
      skipped++
      continue
    }

    const user = columns.user !== undefined ? Number(cells[columns.user]) || 1 : 1
    const source = 'import' as const
    const note = cells[columns.note ?? -1] || undefined

    // Вид берём из колонки, если она есть; иначе — по тому, какие числа заполнены.
    const declared = String(cells[columns.kind ?? -1] ?? '').trim().toLowerCase()
    const sys = hasBp ? num(cells[columns.sys]) : NaN
    const dia = hasBp ? num(cells[columns.dia]) : NaN
    const mmol = hasGlucose ? num(cells[columns.mmol]) : NaN

    const isGlucoseRow = declared === 'glucose' || (!declared && !Number.isFinite(sys) && Number.isFinite(mmol))

    if (isGlucoseRow) {
      if (!Number.isFinite(mmol) || mmol <= 0 || mmol > 50) {
        skipped++
        continue
      }
      measurements.push({
        kind: 'glucose',
        id: deviceMeasurementId('glucose', user, ts),
        ts,
        mmol,
        context: parseContext(cells[columns.context ?? -1]),
        user,
        source,
        note,
      })
      continue
    }

    if (!Number.isFinite(sys) || !Number.isFinite(dia) || sys <= 0 || dia <= 0) {
      skipped++
      continue
    }
    const bpmRaw = columns.bpm !== undefined ? num(cells[columns.bpm]) : NaN
    measurements.push({
      kind: 'bp',
      id: deviceMeasurementId('bp', user, ts),
      ts,
      sys,
      dia,
      bpm: Number.isFinite(bpmRaw) && bpmRaw > 0 ? bpmRaw : null,
      ihb: truthy(cells[columns.ihb ?? -1]),
      mov: truthy(cells[columns.mov ?? -1]),
      user,
      source,
      note,
    })
  }

  return { measurements, skipped }
}

/** Наш бэкап (v1 и v2) и формат ubpm.json из omblepy. */
export function parseJson(text: string): ImportResult {
  const data = JSON.parse(text)

  // v2 — оба дневника; v1 — только давление, вид в записях не хранился.
  const own = data?.measurements ?? data?.readings
  if (Array.isArray(own)) {
    const measurements = (own as Partial<Measurement>[])
      .filter((m) => m && typeof m.ts === 'number')
      .map((m) => (m.kind ? m : { ...m, kind: 'bp' as const }))
      .filter((m) => (m.kind === 'glucose' ? Number.isFinite((m as never)['mmol']) : Number.isFinite((m as never)['sys'])))
    return { measurements: measurements as Measurement[], skipped: own.length - measurements.length }
  }

  if (data?.UBPM && typeof data.UBPM === 'object') {
    const measurements: Measurement[] = []
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
        measurements.push({
          kind: 'bp',
          id: deviceMeasurementId('bp', user, ts),
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
    return { measurements, skipped }
  }

  throw new Error('Неизвестный формат JSON. Ожидается резервная копия этого приложения или ubpm.json от omblepy.')
}

export function parseImportFile(filename: string, text: string): ImportResult {
  return filename.toLowerCase().endsWith('.json') ? parseJson(text) : parseCsv(text)
}
