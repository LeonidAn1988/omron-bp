export type ReadingSource = 'device' | 'manual' | 'import'

export interface Reading {
  /** Для записей с прибора — детерминированный, чтобы повторная синхронизация не плодила дубли. */
  id: string
  /** Момент измерения, epoch ms. */
  ts: number
  sys: number
  dia: number
  bpm: number | null
  /** Нерегулярное сердцебиение (по данным прибора). */
  ihb: boolean
  /** Движение во время измерения (по данным прибора). */
  mov: boolean
  /** Пользователь прибора: 1 или 2. */
  user: number
  source: ReadingSource
  note?: string
  /** Рука, на которой измеряли. */
  arm?: 'left' | 'right'
  /** Отметка «после приёма лекарств» и подобные. */
  tags?: string[]
}

export interface Settings {
  /** Ключ сопряжения, 32 hex-символа. */
  pairingKey: string
  /** Как подписаны пользователи прибора. */
  userNames: Record<number, string>
  /** Активный пользователь, чьи данные показываем. */
  activeUser: number
  /** Целевые значения, назначенные врачом. */
  targetSys: number
  targetDia: number
}
