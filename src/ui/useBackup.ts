import { useCallback, useEffect, useRef, useState } from 'react'
import type { Measurement, Medicine, Settings } from '../types'
import { backupTarget, requestDurability } from '../db/store'
import { canShareFile, download, shareFile, toJson } from '../logic/io'
import {
  backupFilename,
  backupWarning,
  recordsBehind,
  shouldAutoBackup,
  type BackupWarning,
} from '../logic/backup'

/**
 * Состояние сохранности дневника и всё, что с ним можно сделать.
 *
 * Собрано в одном месте, потому что защита работает только целиком: постоянное
 * хранилище удерживает данные в браузере, копия в файл переживает очистку и
 * смену устройства, а предупреждение нужно ровно тогда, когда ни то ни другое
 * не сработало.
 */

export interface BackupStatus {
  /** Умеет ли платформа писать копии сама. */
  supported: boolean
  /** Имя файла для копий, если он выбран. */
  target: string | null
  /** Защищено ли хранилище от вытеснения браузером. null — вопрос неприменим. */
  durable: boolean | null
  warning: BackupWarning
  /** Сколько записей ещё не в копии — их и потеряем. */
  behind: number
  lastAt: number | null
  count: number
  busy: boolean
  /** Автоматическая запись не прошла: файл удалили или отозвали доступ. */
  failed: boolean
  chooseTarget: () => Promise<void>
  forgetTarget: () => Promise<void>
  saveNow: () => Promise<void>
  /** Умеет ли платформа отдать копию в другое приложение. */
  canShare: boolean
  /** Передать копию в облако, мессенджер или почту — чтобы она пережила устройство. */
  shareNow: () => Promise<void>
}

export function useBackup(
  measurements: Measurement[],
  medicines: Medicine[],
  settings: Settings,
  onSettings: (next: Settings) => void,
  ready: boolean,
): BackupStatus {
  const [target, setTarget] = useState<string | null>(null)
  const [durable, setDurable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const supported = backupTarget.isSupported()
  /**
   * Считаем и измерения, и препараты. Иначе внесённая аптечка не сдвигала
   * счётчик, копия не обновлялась и не предупреждала — а введена она руками и
   * теряется так же безвозвратно, как измерение.
   */
  const count = measurements.length + medicines.length

  /**
   * Настройки читаются из ссылки, а не из замыкания: автокопия срабатывает по
   * изменению данных, и если бы она зависела ещё и от настроек, то запускалась
   * бы повторно от собственной же отметки о времени.
   */
  const latest = useRef({ settings, measurements, medicines, onSettings })
  latest.current = { settings, measurements, medicines, onSettings }

  /**
   * Что уходит в копию. Одних измерений мало: аптечка и настройки тоже введены
   * руками и теряются так же безвозвратно. Служебные поля про сами копии из
   * снимка исключены — они описывают устройство, а не данные.
   */
  const snapshot = (): string => {
    const { measurements: items, medicines: pills, settings: current } = latest.current
    const { backupLastAt: _at, backupLastCount: _count, ...rest } = current
    return toJson({ measurements: items, medicines: pills, settings: rest })
  }

  useEffect(() => {
    void requestDurability().then(setDurable)
    void backupTarget.current().then(setTarget)
  }, [])

  const markDone = useCallback((saved: number) => {
    const { settings: current, onSettings: save } = latest.current
    save({ ...current, backupLastAt: Date.now(), backupLastCount: saved })
  }, [])

  // Автоматическая копия: пишем, как только дневник разошёлся с файлом.
  useEffect(() => {
    if (!ready || !target) return
    const { settings: current, measurements: items, medicines: pills } = latest.current
    const total = items.length + pills.length
    if (!shouldAutoBackup({ lastAt: current.backupLastAt, lastCount: current.backupLastCount }, total)) return

    let cancelled = false
    void (async () => {
      const ok = await backupTarget.write(snapshot())
      if (cancelled) return
      if (ok) {
        setFailed(false)
        markDone(total)
      } else {
        // Цель пропала. Молчать нельзя: человек считает, что копии идут.
        setFailed(true)
        setTarget(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready, target, count, settings.backupLastCount, settings.backupLastAt, markDone])

  const chooseTarget = useCallback(async () => {
    setBusy(true)
    try {
      const name = await backupTarget.choose(backupFilename(Date.now()))
      if (name) {
        setTarget(name)
        setFailed(false)
      }
    } finally {
      setBusy(false)
    }
  }, [])

  const forgetTarget = useCallback(async () => {
    await backupTarget.forget()
    setTarget(null)
    setFailed(false)
  }, [])

  /** Ручное сохранение — работает везде, в том числе там, где автокопий нет. */
  const saveNow = useCallback(async () => {
    setBusy(true)
    try {
      const saved = await download(backupFilename(Date.now()), snapshot(), 'application/json')
      // Отметку ставим только при подтверждённом сохранении — ровно как в
      // shareNow ниже. На телефоне «сохранить» проходит через системное окно, и
      // отказ от него означает, что копии нет.
      if (saved) markDone(latest.current.measurements.length + latest.current.medicines.length)
    } finally {
      setBusy(false)
    }
  }, [markDone])

  /**
   * Передача копии наружу. На телефоне это важнее скачивания: скачанный файл
   * лежит в той же памяти, что и дневник, и пропадает вместе с телефоном.
   */
  const shareNow = useCallback(async () => {
    setBusy(true)
    try {
      const sent = await shareFile(backupFilename(Date.now()), snapshot(), 'application/json')
      // Отметку ставим только при подтверждённой передаче: закрытое окно
      // «поделиться» означает, что копии нет, и делать вид иначе нельзя.
      if (sent) markDone(latest.current.measurements.length + latest.current.medicines.length)
    } finally {
      setBusy(false)
    }
  }, [markDone])

  return {
    supported,
    target,
    durable,
    warning: backupWarning(
      { lastAt: settings.backupLastAt, lastCount: settings.backupLastCount },
      count,
      Date.now(),
    ),
    behind: recordsBehind({ lastAt: settings.backupLastAt, lastCount: settings.backupLastCount }, count),
    lastAt: settings.backupLastAt,
    count,
    busy,
    failed,
    chooseTarget,
    forgetTarget,
    saveNow,
    canShare: canShareFile(),
    shareNow,
  }
}
