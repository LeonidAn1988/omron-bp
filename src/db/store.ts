/**
 * Работа с дневником поверх StoragePort.
 *
 * Здесь только правила приложения: детерминированные идентификаторы, дедупликация,
 * значения настроек по умолчанию. Всё, что зависит от среды выполнения, живёт в
 * `src/platform/`, поэтому этот файл переезжает на нативные платформы без правок.
 */

import type { BpReading, GlucoseReading, Measurement, Medicine, Settings } from '../types'
import { platform } from '../platform/ports'
import { DEFAULT_PAIRING_KEY } from '../ble/protocol'

export const DEFAULT_SETTINGS: Settings = {
  pairingKey: DEFAULT_PAIRING_KEY,
  userNames: { 1: 'Пользователь 1', 2: 'Пользователь 2' },
  activeUser: 1,
  targetSys: 135,
  targetDia: 85,
  glucoseFastingMax: 7.0,
  glucosePostMealMax: 10.0,
  glucoseLow: 3.9,
  trackGlucose: false,
  theme: 'auto',
  textScale: 'normal',
  density: 'normal',
  sections: { overview: true, bp: true, glucose: true, intake: true, cabinet: true },
  startTab: 'overview',
  remindersOn: false,
  // Не системный звук: напоминание о лекарстве должно отличаться от почты и
  // мессенджера, иначе человек перестаёт на него реагировать.
  reminderSound: 'kolokolchik',
  remindersRepeat: true,
  intakeTimes: { morning: '08:00', day: '13:00', evening: '19:00', night: '22:00' },
  onboarded: false,
  nudgesUntil: { backup: 0, cabinet: 0 },
  backupEncrypt: false,
  backupLastAt: null,
  backupLastCount: 0,
}

/**
 * Идентификатор записи, снятой с прибора. Детерминированный — повторная выгрузка
 * не плодит дубли.
 *
 * Префикс зависит от вида измерения: давление и сахар, снятые в одну и ту же секунду,
 * иначе затёрли бы друг друга.
 */
export function deviceMeasurementId(kind: Measurement['kind'], user: number, ts: number): string {
  return `${kind === 'bp' ? 'd' : 'g'}${user}-${Math.floor(ts / 1000)}`
}

/** Совместимость: идентификаторы давления, выданные до появления сахара, выглядели так же. */
export const readingId = (user: number, ts: number) => deviceMeasurementId('bp', user, ts)

export const isBpReading = (m: Measurement): m is BpReading => m.kind === 'bp'
export const isGlucoseReading = (m: Measurement): m is GlucoseReading => m.kind === 'glucose'

export function getAllMeasurements(): Promise<Measurement[]> {
  return platform().storage.allMeasurements()
}

export function putMeasurements(items: Measurement[]): Promise<void> {
  return platform().storage.putMeasurements(items)
}

/**
 * Добавляет только то, чего ещё нет. Дубли режутся по id, поэтому повторная
 * выгрузка с прибора безопасна.
 */
export async function addNewMeasurements(items: Measurement[]): Promise<Measurement[]> {
  const existing = new Set((await getAllMeasurements()).map((m) => m.id))
  const fresh = items.filter((m) => !existing.has(m.id))
  await putMeasurements(fresh)
  return fresh
}

export function deleteMeasurement(id: string): Promise<void> {
  return platform().storage.deleteMeasurement(id)
}

export function clearMeasurements(): Promise<void> {
  return platform().storage.clearMeasurements()
}

export async function loadSettings(): Promise<Settings> {
  const stored = await platform().storage.loadSettings()
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    userNames: { ...DEFAULT_SETTINGS.userNames, ...(stored?.userNames ?? {}) },
    // Разделы мержатся по полю: у копии, снятой до появления настройки, их нет,
    // и без слияния все разделы разом пропали бы из навигации.
    sections: { ...DEFAULT_SETTINGS.sections, ...(stored?.sections ?? {}) },
  }
}

export function saveSettings(settings: Settings): Promise<void> {
  return platform().storage.saveSettings(settings)
}

// ── аптечка ────────────────────────────────────────────────────────────────

export function getAllMedicines(): Promise<Medicine[]> {
  return platform().storage.allMedicines()
}

export function putMedicine(item: Medicine): Promise<void> {
  return platform().storage.putMedicine(item)
}

export function deleteMedicine(id: string): Promise<void> {
  return platform().storage.deleteMedicine(id)
}

/**
 * Идентификатор препарата. В отличие от измерений, детерминированным его сделать
 * не из чего: один и тот же препарат заводят дважды с разным сроком годности —
 * это две разные коробки, а не дубль.
 */
export function newMedicineId(): string {
  return `med-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ── сохранность ────────────────────────────────────────────────────────────

/** Просит платформу не вытеснять данные. Ответ показываем в настройках. */
export function requestDurability(): Promise<boolean | null> {
  return platform().storage.requestDurability()
}

export const backupTarget = {
  isSupported: () => platform().backup.isSupported(),
  choose: (suggestedName: string) => platform().backup.choose(suggestedName),
  current: () => platform().backup.target(),
  write: (content: string) => platform().backup.write(content),
  read: () => platform().backup.read(),
  forget: () => platform().backup.forget(),
}
