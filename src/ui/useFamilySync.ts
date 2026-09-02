/**
 * Семейная синхронизация: читать чужие копии при каждом открытии приложения.
 *
 * Сервера нет. Свой дневник телефон и так пишет в файл при каждом изменении —
 * это обычная автокопия. Синхронизация добавляет вторую половину: приложение
 * знает файлы других телефонов семьи и читает их, когда его открывают.
 *
 * Отсюда и обещание, которое можно дать честно: «жена внесла у себя, я открыл
 * приложение — и увидел». Не «увидел мгновенно»: между двумя телефонами стоит
 * облачный клиент, который сам решает, когда синхронизировать папку. И не «пока
 * приложение закрыто»: в закрытом приложении наш код не выполняется вовсе —
 * фоновая работа потребовала бы отдельного нативного рабочего.
 *
 * Читаем при запуске и при каждом возвращении на экран. Чаще незачем: между
 * двумя взглядами на телефон ничего не меняется.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Settings } from '../types'
import { parseImportFile } from '../logic/io'
import { isEncrypted } from '../logic/crypto'
import { mergeChangedAnything, mergeDiary, type MergeLog } from '../logic/merge'
import { platform, type BackupSource } from '../platform/ports'
import { getAllMedicines, getAllMeasurements, getAllTombstones, putMedicine, putMeasurements, saveTombstones } from '../db/store'

export interface FamilySyncStatus {
  /** Держит ли платформа чужие файлы между запусками. В браузере — нет. */
  supported: boolean
  sources: BackupSource[]
  busy: boolean
  /** Когда читали в последний раз. */
  lastAt: number | null
  /** Что принесло последнее чтение. `null` — ещё не читали. */
  lastLog: MergeLog | null
  /** Файлы, которые не прочитались: удалены, переименованы, отозван доступ. */
  unreadable: string[]
  addSource: () => Promise<void>
  removeSource: (id: string) => Promise<void>
  /** Прочитать сейчас — кнопкой, не дожидаясь следующего открытия. */
  syncNow: () => Promise<void>
}

export function useFamilySync({
  ready,
  settings,
  onSettings,
  onChanged,
}: {
  ready: boolean
  settings: Settings
  /** Люди добавляются слиянием: у жены мог появиться человек, которого здесь нет. */
  onSettings: (next: Settings) => void
  /** Дневник изменился — экранам надо перечитать хранилище. */
  onChanged: () => Promise<void>
}): FamilySyncStatus {
  const port = platform().backup
  const supported = port.canReadSources()
  const [sources, setSources] = useState<BackupSource[]>([])
  const [busy, setBusy] = useState(false)
  const [lastAt, setLastAt] = useState<number | null>(null)
  const [lastLog, setLastLog] = useState<MergeLog | null>(null)
  const [unreadable, setUnreadable] = useState<string[]>([])

  /** Настройки и колбэки читаются из ссылки: слияние не должно перезапускаться от них. */
  const latest = useRef({ settings, onSettings, onChanged })
  latest.current = { settings, onSettings, onChanged }

  const идёт = useRef(false)

  const прочитать = useCallback(async () => {
    if (!supported || идёт.current) return
    const список = await port.sources()
    setSources(список)
    if (список.length === 0) return

    идёт.current = true
    setBusy(true)
    const плохие: string[] = []
    try {
      const [measurements, medicines, tombstones] = await Promise.all([
        getAllMeasurements(),
        getAllMedicines(),
        getAllTombstones(),
      ])
      let своё = { measurements, medicines, tombstones, people: latest.current.settings.people }
      const итог: MergeLog = {
        addedMeasurements: 0,
        updatedMeasurements: 0,
        addedMedicines: 0,
        updatedMedicines: 0,
        addedIntakes: 0,
        removed: 0,
        addedPeople: 0,
        stockConflicts: [],
      }

      for (const источник of список) {
        const текст = await port.readSource(источник.id)
        if (текст === null) {
          плохие.push(источник.name)
          continue
        }
        // Закрытую паролем копию читать нечем: пароль знает её владелец, а не
        // мы. Молчать об этом нельзя — человек считает, что обмен идёт.
        if (isEncrypted(текст)) {
          плохие.push(`${источник.name} (закрыт паролем)`)
          continue
        }
        let разобрано
        try {
          разобрано = parseImportFile(источник.name.endsWith('.json') ? источник.name : `${источник.name}.json`, текст)
        } catch {
          плохие.push(`${источник.name} (не читается)`)
          continue
        }
        const слито = mergeDiary(своё, {
          measurements: разобрано.measurements,
          medicines: разобрано.medicines,
          tombstones: разобрано.tombstones,
          people: разобрано.settings?.people,
        })
        своё = {
          measurements: слито.measurements,
          medicines: слито.medicines,
          tombstones: слито.tombstones,
          people: слито.people,
        }
        итог.addedMeasurements += слито.log.addedMeasurements
        итог.updatedMeasurements += слито.log.updatedMeasurements
        итог.addedMedicines += слито.log.addedMedicines
        итог.updatedMedicines += слито.log.updatedMedicines
        итог.addedIntakes += слито.log.addedIntakes
        итог.removed += слито.log.removed
        итог.addedPeople += слито.log.addedPeople
        итог.stockConflicts.push(...слито.log.stockConflicts)
      }

      if (mergeChangedAnything(итог)) {
        // Отметку времени правки не переставляем: пришедшее сюда уже имеет
        // свою, и пометить его «сейчас» значит сделать чужую правку свежее
        // местной при следующем обмене.
        await saveTombstones(своё.tombstones)
        await putMeasurements(своё.measurements, false)
        for (const item of своё.medicines) await putMedicine(item, false)
        if (итог.addedPeople > 0) {
          latest.current.onSettings({ ...latest.current.settings, people: своё.people })
        }
        await latest.current.onChanged()
      }

      setLastLog(итог)
      setLastAt(Date.now())
      setUnreadable(плохие)
    } finally {
      идёт.current = false
      setBusy(false)
    }
  }, [port, supported])

  // Список источников нужен экрану и до первого чтения.
  useEffect(() => {
    if (!supported) return
    void port.sources().then(setSources)
  }, [port, supported])

  // При запуске и при каждом возвращении на экран.
  useEffect(() => {
    if (!ready || !supported) return
    void прочитать()
    const проснулись = () => {
      if (document.visibilityState === 'visible') void прочитать()
    }
    document.addEventListener('visibilitychange', проснулись)
    return () => document.removeEventListener('visibilitychange', проснулись)
  }, [ready, supported, прочитать])

  const addSource = useCallback(async () => {
    const added = await port.addSource()
    if (!added) return
    setSources(await port.sources())
    await прочитать()
  }, [port, прочитать])

  const removeSource = useCallback(
    async (id: string) => {
      await port.removeSource(id)
      setSources(await port.sources())
    },
    [port],
  )

  return { supported, sources, busy, lastAt, lastLog, unreadable, addSource, removeSource, syncNow: прочитать }
}

/** Одной строкой: что принесло последнее чтение. */
export function describeMerge(log: MergeLog | null): string {
  if (!log) return 'ещё не читали'
  if (!mergeChangedAnything(log)) return 'нового не было'
  const части: string[] = []
  const прибавка = log.addedMeasurements + log.updatedMeasurements
  if (прибавка > 0) части.push(`измерений: ${прибавка}`)
  if (log.addedMedicines > 0) части.push(`препаратов: ${log.addedMedicines}`)
  if (log.addedIntakes > 0) части.push(`отметок приёма: ${log.addedIntakes}`)
  if (log.removed > 0) части.push(`удалено: ${log.removed}`)
  if (log.addedPeople > 0) части.push(`людей: ${log.addedPeople}`)
  return части.join(', ')
}
