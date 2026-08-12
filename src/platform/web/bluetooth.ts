/**
 * Реализация BluetoothPort поверх Web Bluetooth.
 *
 * Весь браузерный API живёт здесь: слушатели событий, DataView, особенности
 * резолва сервисов. Наружу отдаётся обычный Uint8Array и колбэк.
 */

import type {
  BluetoothPort,
  DevicePickerOptions,
  GattCharacteristic,
  GattCharacteristicProperties,
  GattDevice,
  GattService,
} from '../ports'

/**
 * Web Bluetooth принимает BufferSource поверх обычного ArrayBuffer, а subarray()
 * отдаёт окно в общий буфер — передавать такое окно в GATT-запись небезопасно.
 */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

class WebCharacteristic implements GattCharacteristic {
  private listener: ((event: Event) => void) | null = null

  constructor(private readonly native: BluetoothRemoteGATTCharacteristic) {}

  get uuid() {
    return this.native.uuid
  }

  async writeValue(data: Uint8Array): Promise<void> {
    await this.native.writeValueWithResponse(toBuffer(data))
  }

  async startNotifications(onValue: (data: Uint8Array) => void): Promise<void> {
    if (this.listener) await this.stopNotifications()
    this.listener = (event: Event) => {
      const target = event.target as BluetoothRemoteGATTCharacteristic
      if (target.value) onValue(new Uint8Array(target.value.buffer))
    }
    this.native.addEventListener('characteristicvaluechanged', this.listener)
    await this.native.startNotifications()
  }

  async stopNotifications(): Promise<void> {
    if (!this.listener) return
    try {
      await this.native.stopNotifications()
    } catch {
      // Прибор мог отключиться сам — снять слушатель всё равно нужно.
    }
    this.native.removeEventListener('characteristicvaluechanged', this.listener)
    this.listener = null
  }
}

class WebService implements GattService {
  private readonly cache = new Map<string, WebCharacteristic>()

  constructor(private readonly native: BluetoothRemoteGATTService) {}

  async getCharacteristic(uuid: string): Promise<GattCharacteristic> {
    const cached = this.cache.get(uuid)
    if (cached) return cached
    const wrapped = new WebCharacteristic(await this.native.getCharacteristic(uuid))
    this.cache.set(uuid, wrapped)
    return wrapped
  }

  async listCharacteristics(): Promise<{ characteristic: GattCharacteristic; properties: GattCharacteristicProperties }[]> {
    const all = await this.native.getCharacteristics()
    return all.map((native) => ({
      characteristic: new WebCharacteristic(native),
      properties: {
        read: native.properties.read,
        write: native.properties.write,
        writeWithoutResponse: native.properties.writeWithoutResponse,
        notify: native.properties.notify,
        indicate: native.properties.indicate,
      },
    }))
  }
}

class WebDevice implements GattDevice {
  constructor(private readonly native: BluetoothDevice) {}

  get id() {
    return this.native.id
  }

  get name() {
    return this.native.name ?? null
  }

  async connect(serviceUuid: string): Promise<GattService> {
    if (!this.native.gatt) throw new Error('У выбранного устройства нет GATT — это не тонометр')
    const server = await this.native.gatt.connect()
    // На части платформ сервисы резолвятся с задержкой сразу после connect().
    let lastError: unknown
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        return new WebService(await server.getPrimaryService(serviceUuid))
      } catch (error) {
        lastError = error
        await new Promise((r) => setTimeout(r, 250))
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Не удалось получить сервисы устройства')
  }

  disconnect() {
    this.native.gatt?.disconnect()
  }
}

export const webBluetooth: BluetoothPort = {
  isSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator
  },

  async isEnabled() {
    if (!this.isSupported()) return null
    try {
      return await navigator.bluetooth.getAvailability()
    } catch {
      return null
    }
  },

  async pickDevice({ serviceUuid, namePrefixes, showAll }: DevicePickerOptions) {
    const options: RequestDeviceOptions = showAll
      ? { acceptAllDevices: true, optionalServices: [serviceUuid] }
      : {
          filters: [...namePrefixes.map((namePrefix) => ({ namePrefix })), { services: [serviceUuid] }],
          optionalServices: [serviceUuid],
        }
    return new WebDevice(await navigator.bluetooth.requestDevice(options))
  },

  async knownDevices() {
    if (!this.isSupported()) return []
    const bluetooth = navigator.bluetooth as Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> }
    if (typeof bluetooth.getDevices !== 'function') return []
    try {
      return (await bluetooth.getDevices()).map((device) => new WebDevice(device))
    } catch {
      return []
    }
  },

  isCancellation(error: unknown) {
    // Пользователь закрыл системный диалог выбора — это не ошибка приложения.
    if (error instanceof DOMException && error.name === 'NotFoundError') return true
    const message = error instanceof Error ? error.message : String(error)
    return /User cancelled|chooser|cancell?ed/i.test(message)
  },
}
