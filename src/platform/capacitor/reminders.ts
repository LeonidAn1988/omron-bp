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
import type { Reminder, ReminderAction, ReminderPermission, ReminderSound, RemindersPort } from '../ports'

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

/**
 * Кнопки прямо в уведомлении — главный выигрыш всей затеи.
 *
 * «Принял» с заблокированного экрана это одно касание, а не «разблокировать,
 * найти приложение, найти препарат, нажать». Оговорка: приложение при этом
 * всё равно запускается — у Capacitor нет фонового обработчика для локальных
 * уведомлений, и обойти это можно только своим нативным приёмником.
 */
const ACTION_TYPE = 'omron-dose'
const SNOOZE_MIN = 15

/**
 * Мелодия, выбранная в последний раз. Нужна отложенному напоминанию: оно
 * создаётся в ответ на нажатие, когда настроек под рукой нет, а прийти обязано
 * тем же звуком, что и остальные — иначе человек его не узнает.
 */
let lastSound = 'system'

let actionsReady: Promise<void> | null = null

function registerActions(): Promise<void> {
  if (!actionsReady) {
    actionsReady = LocalNotifications.registerActionTypes({
      types: [
        {
          id: ACTION_TYPE,
          actions: [
            { id: 'taken', title: 'Принял' },
            { id: 'snooze', title: `Отложить ${SNOOZE_MIN} мин` },
          ],
        },
      ],
    }).catch(() => {
      actionsReady = null
    })
  }
  return actionsReady
}

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
    // Наивысшая достижимая важность: уведомление всплывает и звучит, иначе
    // оно теряется в ленте и смысла в нём нет. Пятёрку (IMPORTANCE_MAX)
    // Android не отдаёт — проверено на устройстве, канал создаётся с четвёркой.
    importance: 4,
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
    lastSound = soundId
    await registerActions()
    await LocalNotifications.schedule({
      notifications: reminders.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        channelId: channelId(soundId),
        actionTypeId: ACTION_TYPE,
        // Приём и сутки едут вместе с уведомлением: по ним приложение поймёт,
        // какую именно отметку ставить, когда человек нажмёт «Принял».
        extra: { slot: item.slot, day: item.day, step: item.step },
        // Два флага, и оба выяснены на живом телефоне, а не по документации.
        //
        // `isExactNotification: false` — прямой отказ от точного будильника.
        // По умолчанию плагин считает уведомление точным и, не найдя
        // разрешения, уводит человека в системный экран «Будильники и
        // напоминания». Разрешение мы сняли сознательно, поэтому экрана нет —
        // и вызов висел навсегда, не поставив ни одного напоминания.
        //
        // `allowWhileIdle: true` — иначе плагин ставит будильник типа RTC,
        // который телефон **не будит**. Напоминание в восемь утра не
        // прозвучало бы, пока телефон спит на тумбочке. С этим флагом идёт
        // `setAndAllowWhileIdle(RTC_WAKEUP)`: он будит устройство, работает в
        // режиме глубокого сна и особого разрешения не требует.
        isExactNotification: false,
        schedule: { at: new Date(item.at), allowWhileIdle: true },
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

  onAction(handler: (action: ReminderAction) => void) {
    let живо = true
    const подписка = LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      if (!живо) return
      const extra = (event.notification.extra ?? {}) as { slot?: string; day?: number }
      if (typeof extra.slot !== 'string' || typeof extra.day !== 'number') return

      if (event.actionId === 'snooze') {
        // Откладывание — целиком забота платформы: приложению незачем знать,
        // что человек попросил напомнить попозже, набор от этого не меняется.
        void ensureChannel(lastSound).then(() =>
          LocalNotifications.schedule({
            notifications: [
              {
                // Свой диапазон идентификаторов: отложенное не должно затирать
                // штатные напоминания и не должно ими затираться.
                id: 900_000 + (event.notification.id % 100_000),
                title: event.notification.title,
                body: event.notification.body ?? '',
                channelId: channelId(lastSound),
                actionTypeId: ACTION_TYPE,
                extra: event.notification.extra,
                isExactNotification: false,
                schedule: { at: new Date(Date.now() + SNOOZE_MIN * 60_000), allowWhileIdle: true },
              },
            ],
          }),
        )
        return
      }

      handler({ kind: event.actionId === 'taken' ? 'taken' : 'open', slot: extra.slot, day: extra.day })
    })

    return () => {
      живо = false
      void подписка.then((item) => item.remove())
    }
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
