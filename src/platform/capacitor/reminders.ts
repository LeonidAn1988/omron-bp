/**
 * Напоминания о приёме через системные уведомления Android.
 *
 * Три вещи, которые здесь не очевидны и стоили бы отладки на живом телефоне.
 *
 * **Звук принадлежит каналу, а не уведомлению.** С Android 8 мелодию и
 * громкость задаёт канал уведомлений, и после создания канала сменить его звук
 * из приложения нельзя — система запоминает настройку за человеком. Поэтому под
 * каждую мелодию заводится свой канал, а выбор мелодии означает «ставить
 * напоминания в другой канал». Неиспользуемые каналы удаляются, чтобы в
 * настройках телефона не копилась свалка.
 *
 * **Время неточное — и это осознанно.** Точные будильники на Android 12+
 * требуют отдельного разрешения, а `USE_EXACT_ALARM` разрешён только
 * будильникам и календарям. Напоминание о таблетке в окне в несколько минут
 * задачу решает; выпрашивать у человека особое разрешение ради этих минут —
 * нет.
 *
 * **Уведомления переживают перезагрузку** — приёмник в манифесте плагина
 * восстанавливает расписание. Проверять это надо именно перезагрузкой: без
 * приёмника всё выглядит рабочим ровно до первого выключения телефона.
 */

import { LocalNotifications } from '@capacitor/local-notifications'
import { registerPlugin } from '@capacitor/core'
import type { Reminder, ReminderPermission, ReminderSound, RemindersPort } from '../ports'

/** Свой нативный плагин: переходы на системные экраны. */
interface SystemSettingsPlugin {
  openChannel(options: { channelId: string }): Promise<{ opened: boolean }>
  openAppNotifications(): Promise<{ opened: boolean }>
  openAppDetails(): Promise<{ opened: boolean }>
}

const SystemSettings = registerPlugin<SystemSettingsPlugin>('SystemSettings')

/**
 * Мелодии. `id` — имя файла в `android/app/src/main/res/raw/`, собирается
 * генератором `tools/sounds.py`; менять список надо в обоих местах разом.
 */
const SOUNDS: ReminderSound[] = [
  { id: 'system', name: 'Как у телефона', hint: 'обычный звук уведомления' },
  { id: 'myagkiy', name: 'Мягкий', hint: 'два негромких удара' },
  { id: 'kolokolchik', name: 'Колокольчик', hint: 'слышно даже вполуха' },
  { id: 'pereliv', name: 'Перелив', hint: 'длиннее и ниже — если высокие звуки плохо слышны' },
]

/**
 * Версия в имени канала. Настройки канала система хранит за человеком, и
 * изменения в коде на уже созданный канал не действуют — новый вид канала
 * требует нового имени.
 */
const CHANNEL_PREFIX = 'omron-meds-v1-'

const channelId = (soundId: string) => CHANNEL_PREFIX + soundId

function toPermission(display: string): ReminderPermission {
  if (display === 'granted') return 'granted'
  if (display === 'denied') return 'denied'
  return 'prompt'
}

/**
 * Создать канал под выбранную мелодию и убрать остальные наши каналы.
 *
 * Удаление не косметика: иначе в системных настройках уведомлений копятся
 * четыре одинаковых по названию канала, и человек правит громкость не у того.
 */
async function ensureChannel(soundId: string) {
  const wanted = channelId(soundId)
  await LocalNotifications.createChannel({
    id: wanted,
    name: 'Приём лекарств',
    description: 'Напоминания принять препарат по расписанию',
    // Максимальная важность: напоминание должно всплывать и звучать, иначе оно
    // теряется в ленте и смысла в нём нет.
    importance: 5,
    visibility: 1,
    vibration: true,
    ...(soundId === 'system' ? {} : { sound: `${soundId}.wav` }),
  })

  const { channels } = await LocalNotifications.listChannels()
  for (const channel of channels) {
    if (channel.id.startsWith(CHANNEL_PREFIX) && channel.id !== wanted) {
      await LocalNotifications.deleteChannel({ id: channel.id }).catch(() => undefined)
    }
  }
}

export const capacitorReminders: RemindersPort = {
  isSupported: () => true,

  async permission() {
    const { display } = await LocalNotifications.checkPermissions()
    return toPermission(display)
  },

  async requestPermission() {
    const { display } = await LocalNotifications.requestPermissions()
    return toPermission(display)
  },

  sounds: () => SOUNDS,

  async schedule(reminders: Reminder[], soundId: string) {
    await this.cancelAll()
    if (!reminders.length) return

    await ensureChannel(soundId)
    await LocalNotifications.schedule({
      notifications: reminders.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        channelId: channelId(soundId),
        // `repeats` с `on` — ежедневное повторение в заданное время. Секунды
        // задаём нулём явно: без них система подставляет текущие, и напоминание
        // приходит в 08:00:37.
        schedule: { on: { hour: item.hour, minute: item.minute, second: 0 }, repeats: true, allowWhileIdle: false },
      })),
    })
  },

  async cancelAll() {
    const { notifications } = await LocalNotifications.getPending()
    if (!notifications.length) return
    await LocalNotifications.cancel({ notifications: notifications.map(({ id }) => ({ id })) })
  },

  async scheduled() {
    const { notifications } = await LocalNotifications.getPending()
    return notifications.length
  },

  async openSoundSettings(soundId: string) {
    try {
      // Канал должен существовать, иначе системный экран открывать нечего.
      await ensureChannel(soundId)
      const { opened } = await SystemSettings.openChannel({ channelId: channelId(soundId) })
      return opened
    } catch {
      try {
        const { opened } = await SystemSettings.openAppNotifications()
        return opened
      } catch {
        return false
      }
    }
  },

  async openBatterySettings() {
    try {
      const { opened } = await SystemSettings.openAppDetails()
      return opened
    } catch {
      return false
    }
  },
}
