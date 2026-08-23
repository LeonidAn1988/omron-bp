/**
 * Сборка браузерной платформы.
 *
 * Единственное место, где ядро связывается с конкретной средой выполнения.
 * Для Android и iOS появится `platform/capacitor/`, для macOS и Windows —
 * `platform/tauri/`; ядро и интерфейс останутся прежними.
 */

import { installPlatform, type Platform } from '../ports'
import { webBluetooth } from './bluetooth'
import { webStorage } from './storage'
import { webFiles } from './files'
import { webBackup } from './backup'
import { webReminders } from './reminders'

export const webPlatform: Platform = {
  kind: 'web',
  bluetooth: webBluetooth,
  storage: webStorage,
  files: webFiles,
  backup: webBackup,
  reminders: webReminders,
}

export function installWebPlatform() {
  installPlatform(webPlatform)
}

export { useIndexedDbFactory } from './storage'
