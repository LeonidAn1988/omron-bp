/**
 * Карта памяти и формат записи для Omron HEM-6232T (RS7 Intelli IT).
 * Значения взяты из omblepy/deviceSpecific/hem-6232t.py.
 */

import { OmronTransport } from './protocol'

/** Начальные адреса кольцевого буфера для пользователя 1 и пользователя 2. */
export const USER_START_ADDRESSES = [0x2e8, 0x860]
/** Сколько измерений помещается в память на каждого пользователя. */
export const RECORDS_PER_USER = [100, 100]
/** Размер одной записи в байтах. */
export const RECORD_SIZE = 0x0e // 14
/** Максимум данных, который прибор отдаёт одним пакетом. */
export const TRANSMISSION_BLOCK_SIZE = 0x38 // 56

export interface DeviceRecord {
  /** Номер пользователя на приборе: 1 или 2. */
  user: number
  /** Момент измерения по часам самого тонометра, в локальном времени. */
  date: Date
  sys: number
  dia: number
  bpm: number
  /** Прибор зафиксировал нерегулярное сердцебиение. */
  ihb: boolean
  /** Прибор зафиксировал движение во время измерения. */
  mov: boolean
  /** Исходные байты — на случай разбора спорных записей. */
  raw: string
}

/**
 * Достаёт число из битового диапазона. Бит 0 — старший бит нулевого байта.
 * Диапазоны в этом формате не длиннее 8 бит, поэтому обычного number хватает.
 */
function bits(bytes: Uint8Array, first: number, last: number): number {
  let value = 0
  for (let i = first; i <= last; i++) {
    value = (value << 1) | ((bytes[i >> 3] >> (7 - (i & 7))) & 1)
  }
  return value
}

const isBlank = (bytes: Uint8Array) => bytes.every((b) => b === 0xff)

/**
 * Разбирает одну 14-байтовую запись.
 * Возвращает null, если слот пустой или содержимое не похоже на валидное измерение.
 */
export function parseRecord(bytes: Uint8Array, user: number): DeviceRecord | null {
  if (isBlank(bytes)) return null

  const dia = bits(bytes, 0, 7)
  const sys = bits(bytes, 8, 15) + 25
  const year = bits(bytes, 18, 23) + 2000
  const bpm = bits(bytes, 24, 31)
  const ihb = bits(bytes, 32, 32) === 1
  const mov = bits(bytes, 33, 33) === 1
  const month = bits(bytes, 34, 37)
  const day = bits(bytes, 38, 42)
  const hour = bits(bytes, 43, 47)
  const minute = bits(bytes, 52, 57)
  const second = Math.min(bits(bytes, 58, 63), 59) // прибор иногда пишет до 63

  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  if (hour > 23 || minute > 59) return null
  if (sys < 40 || sys > 300 || dia < 20 || dia > 250) return null

  const date = new Date(year, month - 1, day, hour, minute, second)
  if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1 || date.getDate() !== day) return null

  return { user, date, sys, dia, bpm, ihb, mov, raw: Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') }
}

export interface ReadProgress {
  /** 0..1 по всему процессу чтения обоих пользователей. */
  fraction: number
  user: number
}

/**
 * Полностью вычитывает кольцевые буферы обоих пользователей.
 * Операция только на чтение — в прибор ничего не пишется.
 */
export async function readAllRecords(
  transport: OmronTransport,
  onProgress?: (p: ReadProgress) => void,
): Promise<DeviceRecord[]> {
  const totalBytes = USER_START_ADDRESSES.reduce((sum, _, i) => sum + RECORDS_PER_USER[i] * RECORD_SIZE, 0)
  let bytesDone = 0
  const records: DeviceRecord[] = []

  for (let userIdx = 0; userIdx < USER_START_ADDRESSES.length; userIdx++) {
    const user = userIdx + 1
    const length = RECORDS_PER_USER[userIdx] * RECORD_SIZE
    const base = bytesDone

    const memory = await transport.readMemory(
      USER_START_ADDRESSES[userIdx],
      length,
      TRANSMISSION_BLOCK_SIZE,
      (done) => onProgress?.({ fraction: (base + done) / totalBytes, user }),
    )
    bytesDone += length

    for (let offset = 0; offset + RECORD_SIZE <= memory.length; offset += RECORD_SIZE) {
      const record = parseRecord(memory.subarray(offset, offset + RECORD_SIZE), user)
      if (record) records.push(record)
    }
  }

  records.sort((a, b) => a.date.getTime() - b.date.getTime())
  return records
}
