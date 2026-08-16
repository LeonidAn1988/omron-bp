/**
 * Автоматические копии на Android.
 *
 * Здесь этот порт **проще и надёжнее**, чем в вебе. В браузере приходилось
 * просить у человека файл через диалог, хранить долгоживущий описатель в
 * IndexedDB и следить, не отозвано ли разрешение, — и всё равно в мобильном
 * Chrome создать новый файл этим способом нельзя, а в Safari нет и самого API.
 *
 * У приложения есть собственный каталог, куда оно пишет без спроса и без
 * разрешений. Поэтому выбирать цель не нужно: копия всегда пишется в один и тот
 * же файл, `choose` только подтверждает согласие, а `isSupported` честно
 * отвечает «да».
 *
 * Чего это не отменяет: файл лежит **внутри телефона**. Он переживает
 * перезагрузку и обновление приложения, но исчезает при «Очистить данные» и при
 * удалении приложения, а вместе с потерянным телефоном пропадает целиком.
 * Поэтому отправка копии наружу через «поделиться» остаётся обязательной частью
 * сценария, и интерфейс продолжает об этом напоминать.
 */

import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import type { BackupPort } from '../ports'

/**
 * `Data` — приватный каталог приложения. Не `Documents` и не `External`:
 * дневник давления не должен появляться в общей файловой памяти телефона, где
 * его увидит любое приложение с доступом к хранилищу.
 */
const DIR = Directory.Data
const FILE = 'дневник-копия.json'

/** Согласие на автокопии. Самого файла до первой записи ещё нет. */
const ENABLED_KEY = 'omron.backup-enabled'

const enabled = (): boolean => {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

const setEnabled = (value: boolean) => {
  try {
    if (value) localStorage.setItem(ENABLED_KEY, '1')
    else localStorage.removeItem(ENABLED_KEY)
  } catch {
    // Без памяти под флаг автокопии просто не включатся — данные не пострадают.
  }
}

export const capacitorBackup: BackupPort = {
  isSupported() {
    return true
  },

  /**
   * Диалога выбора файла нет и не нужно: место известно заранее. Нажатие просто
   * включает автокопии и сразу создаёт файл, чтобы человек увидел результат, а
   * не обещание.
   */
  async choose() {
    try {
      await Filesystem.writeFile({ path: FILE, data: '', directory: DIR, encoding: Encoding.UTF8 })
      setEnabled(true)
      return FILE
    } catch {
      return null
    }
  },

  async target() {
    if (!enabled()) return null
    try {
      await Filesystem.stat({ path: FILE, directory: DIR })
      return FILE
    } catch {
      // Файл могли вычистить вместе с данными приложения. Согласие при этом
      // сохраняем: следующая запись создаст его заново.
      return enabled() ? FILE : null
    }
  },

  async write(content) {
    if (!enabled()) return false
    try {
      await Filesystem.writeFile({ path: FILE, data: content, directory: DIR, encoding: Encoding.UTF8 })
      return true
    } catch {
      return false
    }
  },

  async forget() {
    setEnabled(false)
    try {
      await Filesystem.deleteFile({ path: FILE, directory: DIR })
    } catch {
      // Файла могло уже не быть — цель всё равно забыта.
    }
  },
}
