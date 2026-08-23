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
  isBatteryRestricted(): Promise<{ restricted: boolean | null }>
  isDoNotDisturbOn(): Promise<{ on: boolean | null }>
  openBatteryOptimization(): Promise<{ opened: boolean }>
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
 * Отложенные напоминания живут в своём диапазоне идентификаторов и **не
 * снимаются** пересборкой набора.
 *
 * Иначе выходило так: человек нажал «Отложить», приложение от этого нажатия
 * запустилось, пересобрало набор — и первым делом сняло всё ожидающее, включая
 * только что отложенное. Просьба «напомни через пятнадцать минут» исчезала в
 * ту же секунду, в которую была высказана.
 */
const SNOOZE_BASE = 900_000

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
async function ensureChannel(soundId: string, cleanup = true) {
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

  // Уборка лишних каналов — только когда мелодию выбрал человек. Из обработчика
  // «Отложить» её звать нельзя: там выбранная мелодия неизвестна, и уборка
  // снесла бы канал вместе с громкостью, которую человек себе выставил.
  if (!cleanup) return

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

  async exactTiming() {
    try {
      const { exact_alarm: состояние } = await LocalNotifications.checkExactNotificationSetting()
      return состояние === 'granted'
    } catch {
      return null
    }
  },

  async requestExactTiming() {
    try {
      const { exact_alarm: состояние } = await LocalNotifications.changeExactNotificationSetting()
      return состояние === 'granted'
    } catch {
      return null
    }
  },

  async schedule(reminders: Reminder[], soundId: string) {
    await this.cancelAll()
    if (!reminders.length) return

    // Убираем из шторки то, что уже показано, но в новом наборе не значится:
    // отмеченный приём иначе оставляет стопку карточек, и человек смотрит на
    // напоминание о том, что он уже сделал.
    try {
      const { notifications: показанные } = await LocalNotifications.getDeliveredNotifications()
      const нужные = new Set(reminders.map((item) => item.id))
      const лишние = показанные.filter((item) => item.id < SNOOZE_BASE && !нужные.has(item.id))
      if (лишние.length) await LocalNotifications.removeDeliveredNotifications({ notifications: лишние })
    } catch {
      // Не смертельно: карточка в шторке переживаема, а падать из-за неё нельзя.
    }

    await ensureChannel(soundId)
    lastSound = soundId
    await registerActions()

    // Точное время — только если человек уже разрешил. Спрашивать отсюда
    // нельзя: плагин уводит в системный экран без объяснений, посреди
    // сохранения настроек. Разрешение просится отдельно, в разделе настроек,
    // где рядом написано зачем.
    const exact = (await this.exactTiming()) === true
    await LocalNotifications.schedule({
      notifications: reminders.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        // Развёрнутый вид: полный состав приёма с дозировками. Без этого
        // Android обрезает вторую строку многоточием, и второй препарат
        // человек просто не видит.
        largeBody: item.details,
        summaryText: item.title,
        channelId: channelId(soundId),
        actionTypeId: ACTION_TYPE,
        // Приём и сутки едут вместе с уведомлением: по ним приложение поймёт,
        // какую именно отметку ставить, когда человек нажмёт «Принял».
        extra: { slot: item.slot, day: item.day, step: item.step },
        // Два флага, и оба выяснены на живом телефоне, а не по документации.
        //
        // `isExactNotification` включаем только когда разрешение уже есть.
        // Иначе плагин уводит человека в системный экран «Будильники и
        // напоминания» прямо посреди сохранения настроек, а если разрешение
        // ещё и не объявлено — экрана нет и вызов висит навсегда, не поставив
        // ни одного напоминания. Проверено: именно так и было.
        //
        // `allowWhileIdle: true` — иначе плагин ставит будильник типа RTC,
        // который телефон **не будит**. Напоминание в восемь утра не
        // прозвучало бы, пока телефон спит на тумбочке. С этим флагом идёт
        // пробуждающий будильник, работающий и в режиме глубокого сна.
        isExactNotification: exact,
        // Не обязательное: если разрешение отзовут, напоминания должны
        // остаться — пусть неточные, — а не исчезнуть совсем.
        isExactMandatory: false,
        schedule: { at: new Date(item.at), allowWhileIdle: true },
      })),
    })
  },

  async cancelAll() {
    const { notifications } = await LocalNotifications.getPending()
    // Отложенные не трогаем: человек попросил напомнить попозже, и пересборка
    // набора — не повод забыть об этой просьбе.
    const наши = notifications.filter(({ id }) => id < SNOOZE_BASE)
    if (!наши.length) return
    await LocalNotifications.cancel({ notifications: наши.map(({ id }) => ({ id })) })
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
        // Канал берём тот же, в котором пришло исходное уведомление: своей
        // мелодии обработчик не знает, а на холодном старте `lastSound` ещё
        // не восстановлен и указал бы на системный звук.
        const канал = event.notification.channelId ?? channelId(lastSound)
        void ensureChannel(канал.startsWith(CHANNEL_PREFIX) ? канал.slice(CHANNEL_PREFIX.length) : lastSound, false).then(() =>
          LocalNotifications.schedule({
            notifications: [
              {
                // Свой диапазон идентификаторов: отложенное не должно затирать
                // штатные напоминания и не снимается пересборкой набора.
                id: SNOOZE_BASE + (event.notification.id % 100_000),
                title: event.notification.title,
                body: event.notification.body ?? '',
                channelId: канал,
                actionTypeId: ACTION_TYPE,
                extra: event.notification.extra,
                isExactNotification: false,
                isExactMandatory: false,
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

  async isQuietModeOn() {
    try {
      const { on } = await SystemSettings.isDoNotDisturbOn()
      return on
    } catch {
      return null
    }
  },

  async isBatteryRestricted() {
    try {
      const { restricted } = await SystemSettings.isBatteryRestricted()
      return restricted
    } catch {
      return null
    }
  },

  async openBatterySettings() {
    try {
      // Сначала список исключений: там нужный переключатель виден сразу.
      const { opened } = await SystemSettings.openBatteryOptimization()
      if (opened) return true
    } catch {
      // Экрана может не быть на нестандартной прошивке — ведём в настройки
      // приложения, оттуда до батареи доходят в два шага.
    }
    try {
      const { opened } = await SystemSettings.openAppDetails()
      return opened
    } catch {
      return false
    }
  },
}
