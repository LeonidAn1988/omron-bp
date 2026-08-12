/**
 * Модель измерений.
 *
 * Размеченное объединение, а не один тип со всеми полями сразу: давление и сахар
 * измеряются разными приборами, интерпретируются по разным правилам и почти не
 * имеют общих полей, кроме «когда» и «чьё».
 *
 * Отдельно предусмотрен вид `glucose-cgm` — данные датчика непрерывного мониторинга.
 * Он здесь объявлен, но НЕ реализован: датчик даёт запись каждые 1–5 минут, это
 * ~288 значений в сутки против трёх у тонометра, и такой поток требует своего
 * хранения и прореживания при отрисовке. Место под него оставлено сознательно,
 * чтобы не переделывать модель на живых данных.
 */

export type MeasurementSource = 'device' | 'manual' | 'import'

export type MeasurementKind = 'bp' | 'glucose'

interface MeasurementBase {
  /** Для записей с прибора — детерминированный, чтобы повторная выгрузка не плодила дубли. */
  id: string
  /** Момент измерения, epoch ms. */
  ts: number
  /** Пользователь прибора: 1 или 2. */
  user: number
  source: MeasurementSource
  note?: string
}

export interface BpReading extends MeasurementBase {
  kind: 'bp'
  /** Систолическое, мм рт. ст. */
  sys: number
  /** Диастолическое, мм рт. ст. */
  dia: number
  bpm: number | null
  /** Нерегулярное сердцебиение (по данным прибора). */
  ihb: boolean
  /** Движение во время измерения (по данным прибора). */
  mov: boolean
  arm?: 'left' | 'right'
}

/**
 * Момент замера относительно еды. Обязателен: значение глюкозы без него
 * не интерпретируется — 9 ммоль/л натощак и через два часа после еды значат разное.
 */
export type GlucoseContext = 'fasting' | 'before-meal' | 'after-meal' | 'bedtime' | 'night'

export const GLUCOSE_CONTEXT_LABELS: Record<GlucoseContext, string> = {
  fasting: 'Натощак',
  'before-meal': 'До еды',
  'after-meal': 'Через 2 часа после еды',
  bedtime: 'Перед сном',
  night: 'Ночью',
}

export interface GlucoseReading extends MeasurementBase {
  kind: 'glucose'
  /** Концентрация глюкозы, ммоль/л — единица, принятая в России и Европе. */
  mmol: number
  context: GlucoseContext
}

export type Measurement = BpReading | GlucoseReading

export const isBp = (m: Measurement): m is BpReading => m.kind === 'bp'
export const isGlucose = (m: Measurement): m is GlucoseReading => m.kind === 'glucose'

export interface Settings {
  /** Ключ сопряжения, 32 hex-символа. */
  pairingKey: string
  /** Как подписаны пользователи прибора. */
  userNames: Record<number, string>
  /** Активный пользователь, чьи данные показываем. */
  activeUser: number

  /** Целевое давление, назначенное врачом. */
  targetSys: number
  targetDia: number

  /** Верхняя граница нормы натощак и до еды, ммоль/л. */
  glucoseFastingMax: number
  /** Верхняя граница нормы через 2 часа после еды, ммоль/л. */
  glucosePostMealMax: number
  /** Порог гипогликемии, ммоль/л. */
  glucoseLow: number

  /** Показывать ли раздел сахара. Включается сам, как только появляется первая запись. */
  trackGlucose: boolean
}
