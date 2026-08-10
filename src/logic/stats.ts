import type { Reading } from '../types'
import { dayPart, isWithinTarget, type DayPart } from './classify'

export interface Aggregate {
  count: number
  sys: number
  dia: number
  bpm: number | null
}

export interface Summary {
  count: number
  avgSys: number
  avgDia: number
  avgBpm: number | null
  minSys: number
  maxSys: number
  minDia: number
  maxDia: number
  /** Стандартное отклонение систолического — мера вариабельности давления. */
  sdSys: number
  sdDia: number
  /** Доля измерений в целевом диапазоне, 0..1. */
  withinTarget: number
  ihbCount: number
  movCount: number
  byDayPart: Partial<Record<DayPart, Aggregate>>
  /** Утреннее среднее минус вечернее по систолическому. */
  morningEveningDelta: number | null
  firstTs: number
  lastTs: number
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

function sd(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1))
}

function aggregate(readings: Reading[]): Aggregate {
  const pulses = readings.map((r) => r.bpm).filter((b): b is number => typeof b === 'number' && b > 0)
  return {
    count: readings.length,
    sys: mean(readings.map((r) => r.sys)),
    dia: mean(readings.map((r) => r.dia)),
    bpm: pulses.length ? mean(pulses) : null,
  }
}

export function summarize(readings: Reading[], targetSys: number, targetDia: number): Summary | null {
  if (readings.length === 0) return null

  const sysValues = readings.map((r) => r.sys)
  const diaValues = readings.map((r) => r.dia)
  const base = aggregate(readings)

  const byDayPart: Partial<Record<DayPart, Aggregate>> = {}
  for (const part of ['night', 'morning', 'day', 'evening'] as DayPart[]) {
    const subset = readings.filter((r) => dayPart(new Date(r.ts)) === part)
    if (subset.length) byDayPart[part] = aggregate(subset)
  }

  const morning = byDayPart.morning
  const evening = byDayPart.evening

  return {
    count: readings.length,
    avgSys: base.sys,
    avgDia: base.dia,
    avgBpm: base.bpm,
    minSys: Math.min(...sysValues),
    maxSys: Math.max(...sysValues),
    minDia: Math.min(...diaValues),
    maxDia: Math.max(...diaValues),
    sdSys: sd(sysValues),
    sdDia: sd(diaValues),
    withinTarget: readings.filter((r) => isWithinTarget(r.sys, r.dia, targetSys, targetDia)).length / readings.length,
    ihbCount: readings.filter((r) => r.ihb).length,
    movCount: readings.filter((r) => r.mov).length,
    byDayPart,
    morningEveningDelta: morning && evening ? morning.sys - evening.sys : null,
    firstTs: readings[0].ts,
    lastTs: readings[readings.length - 1].ts,
  }
}

export interface DailyPoint {
  /** Полночь соответствующего дня, epoch ms. */
  ts: number
  sys: number
  dia: number
  bpm: number | null
  count: number
}

/** Средние по календарным дням — база для линии тренда. */
export function dailyAverages(readings: Reading[]): DailyPoint[] {
  const buckets = new Map<number, Reading[]>()
  for (const reading of readings) {
    const date = new Date(reading.ts)
    const key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    const bucket = buckets.get(key)
    if (bucket) bucket.push(reading)
    else buckets.set(key, [reading])
  }
  return [...buckets.entries()]
    .map(([ts, group]) => {
      const agg = aggregate(group)
      return { ts, sys: agg.sys, dia: agg.dia, bpm: agg.bpm, count: agg.count }
    })
    .sort((a, b) => a.ts - b.ts)
}

/** Скользящее среднее по дневным точкам, окно в днях. */
export function movingAverage(points: DailyPoint[], windowDays = 7): { ts: number; sys: number; dia: number }[] {
  const span = windowDays * 86_400_000
  return points.map((point) => {
    const window = points.filter((p) => p.ts <= point.ts && p.ts > point.ts - span)
    return {
      ts: point.ts,
      sys: mean(window.map((p) => p.sys)),
      dia: mean(window.map((p) => p.dia)),
    }
  })
}

export type PeriodKey = '7d' | '30d' | '90d' | 'all'

export const PERIODS: { key: PeriodKey; label: string; days: number | null }[] = [
  { key: '7d', label: '7 дней', days: 7 },
  { key: '30d', label: '30 дней', days: 30 },
  { key: '90d', label: '90 дней', days: 90 },
  { key: 'all', label: 'Всё время', days: null },
]

export function filterByPeriod(readings: Reading[], period: PeriodKey): Reading[] {
  const config = PERIODS.find((p) => p.key === period)
  if (!config?.days) return readings
  const cutoff = Date.now() - config.days * 86_400_000
  return readings.filter((r) => r.ts >= cutoff)
}
