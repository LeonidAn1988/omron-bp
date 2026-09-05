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
import { emptyMergeLog, mergeChangedAnything, mergeDiary, type MergeLog } from '../logic/merge'
import { platform, type BackupSource } from '../platform/ports'
import {
  deleteMeasurement,
  deleteMedicine,
  getAllMedicines,
  getAllMeasurements,
  getAllTombstones,
  putMedicine,
  putMeasurements,
  saveTombstones,
} from '../db/store'

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
  /** Когда в чужом файле сделана самая свежая запись. Ключ — id источника. */
  freshness: Record<string, number | null>
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
  const [freshness, setFreshness] = useState<Record<string, number | null>>({})

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
    const свежесть: Record<string, number | null> = {}
    try {
      const [measurements, medicines, tombstones] = await Promise.all([
        getAllMeasurements(),
        getAllMedicines(),
        getAllTombstones(),
      ])
      let своё = { measurements, medicines, tombstones, people: latest.current.settings.people }
      const итог: MergeLog = emptyMergeLog()

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
        // Свежесть — по самой поздней записи в файле. Отличает «облако не
        // донесло» от «человек ничего не вносил»: снаружи это одно и то же.
        const времена = [
          ...разобрано.measurements.map((m) => m.updatedAt ?? m.ts),
          ...разобрано.medicines.map((m) => m.updatedAt ?? 0),
        ]
        свежесть[источник.id] = времена.length ? Math.max(...времена) : null
      }

      if (mergeChangedAnything(итог)) {
        // Пока читались чужие файлы, человек мог что-то внести. Слепок, снятый
        // до чтения, эти правки не содержит — и записанный поверх, затёр бы их.
        // Поэтому перед записью сливаем результат ещё раз с тем, что в базе сейчас.
        const [сейчасИзм, сейчасЛек, сейчасНадгр] = await Promise.all([
          getAllMeasurements(),
          getAllMedicines(),
          getAllTombstones(),
        ])
        const финал = mergeDiary(
          { measurements: сейчасИзм, medicines: сейчасЛек, tombstones: сейчасНадгр, people: latest.current.settings.people },
          { measurements: своё.measurements, medicines: своё.medicines, tombstones: своё.tombstones, people: своё.people },
        )
        try {
          // Отметку времени правки не переставляем: пришедшее сюда уже имеет
          // свою, и пометить его «сейчас» значит сделать чужую правку свежее
          // местной при следующем обмене.
          await saveTombstones(финал.tombstones)
          // Надгробия — не только сохранить, но и применить: слияние выбросило
          // убитые записи из своего списка, а в хранилище они лежали и дальше,
          // и «удалено: 1» в журнале ничего не удаляло.
          const убитые = new Set(финал.tombstones.map((t) => t.id))
          for (const item of сейчасИзм) if (убитые.has(item.id)) await deleteMeasurement(item.id)
          for (const item of сейчасЛек) if (убитые.has(item.id)) await deleteMedicine(item.id)
          await putMeasurements(финал.measurements, false)
          for (const item of финал.medicines) await putMedicine(item, false)
          if (финал.people.length > latest.current.settings.people.length) {
            latest.current.onSettings({ ...latest.current.settings, people: финал.people })
          }
        } catch (error) {
          // Запись сорвалась на полпути — молчать нельзя: человек считает, что
          // обмен прошёл. Сообщаем как о нечитаемом источнике, тем же местом.
          плохие.push(`запись не удалась: ${error instanceof Error ? error.message : String(error)}`)
        }
        await latest.current.onChanged()
      }

      setLastLog(итог)
      setLastAt(Date.now())
      setUnreadable(плохие)
      setFreshness(свежесть)
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
    let added: BackupSource | null
    try {
      added = await port.addSource()
    } catch (error) {
      setUnreadable([error instanceof Error ? error.message : String(error)])
      return
    }
    if (!added) return
    // Проверяем сразу: непригодный файл иначе навсегда останется в списке
    // «телефоны семьи», а человек будет ждать от него записей.
    const текст = await port.readSource(added.id)
    const беда =
      текст === null
        ? 'файл не читается'
        : isEncrypted(текст)
          ? 'файл закрыт паролем — телефоны семьи его не прочтут'
          : (() => {
              try {
                parseImportFile(added.name.endsWith('.json') ? added.name : `${added.name}.json`, текст)
                return null
              } catch {
                return 'это не копия дневника'
              }
            })()
    if (беда) {
      await port.removeSource(added.id)
      setUnreadable([`${added.name}: ${беда}`])
      return
    }
    setSources(await port.sources())
    await прочитать()
  }, [port, прочитать])

  const removeSource = useCallback(
    async (id: string) => {
      await port.removeSource(id)
      setSources(await port.sources())
      setUnreadable([])
    },
    [port],
  )

  return { supported, sources, busy, lastAt, lastLog, unreadable, freshness, addSource, removeSource, syncNow: прочитать }
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
