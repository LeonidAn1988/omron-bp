/**
 * Шифрование резервной копии паролем.
 *
 * Копия уходит в облако **самого человека** — Яндекс.Диск, Google Drive, что он
 * выберет. Мы её не храним и не видим, но облако видит: состав аптечки
 * восстанавливает диагноз однозначно, метформин плюс периндоприл это диабет и
 * гипертония. Пароль закрывает и от облака тоже.
 *
 * Пароль необязателен, и это осознанно. Файл и так лежит за аккаунтом облака,
 * то есть один рубеж уже есть. Второй пароль, который надо помнить годами, у
 * пожилого человека означает потерю всего дневника без единого шанса на
 * восстановление: ключ не хранится нигде, и подобрать его нечем — в этом весь
 * смысл. Поэтому шифрование включается сознательно и с прямым предупреждением.
 *
 * Устройство конверта:
 *
 *     { "omron": "encrypted", "v": 1, "kdf": {...}, "iv": "…", "data": "…" }
 *
 * Открытый текст узнаётся по отсутствию поля `omron`, поэтому старые
 * незашифрованные копии читаются как раньше и ничего переносить не нужно.
 */

/** Сколько раз прогоняется пароль. Столько же рекомендует OWASP для PBKDF2-SHA256. */
const ITERATIONS = 210_000

/** Метка конверта: по ней зашифрованная копия отличается от обычной. */
const MARK = 'encrypted'

export interface EncryptedEnvelope {
  omron: typeof MARK
  v: 1
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  iv: string
  data: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Ключ выводится из пароля, а не хранится.
 *
 * Соль своя у каждой копии: иначе одинаковый пароль у двух людей давал бы
 * одинаковый ключ, и подготовленная заранее таблица открывала бы обе копии.
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Зашифровать копию. Возвращает готовый к записи текст конверта. */
export async function encryptBackup(content: string, password: string): Promise<string> {
  if (!password) throw new Error('Пароль пустой — шифровать нечем')

  const salt = crypto.getRandomValues(new Uint8Array(16))
  // Двенадцать байт — размер, для которого AES-GCM и рассчитан; своя случайная
  // последовательность у каждой записи обязательна, повтор раскрывает ключ.
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoder.encode(content),
  )

  const envelope: EncryptedEnvelope = {
    omron: MARK,
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: toBase64(salt) },
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(data)),
  }
  return JSON.stringify(envelope)
}

/** Зашифрована ли копия. Открытый текст читается как раньше. */
export function isEncrypted(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text)
    return !!parsed && typeof parsed === 'object' && (parsed as { omron?: unknown }).omron === MARK
  } catch {
    return false
  }
}

/**
 * Расшифровать копию.
 *
 * Неверный пароль и испорченный файл различаются намеренно: первое человек
 * исправит сам, второе — нет, и говорить ему «неверный пароль» о разрушенном
 * файле значит гонять его по кругу.
 */
export async function decryptBackup(text: string, password: string): Promise<string> {
  let envelope: EncryptedEnvelope
  try {
    envelope = JSON.parse(text) as EncryptedEnvelope
  } catch {
    throw new Error('Файл копии повреждён — это не похоже на копию дневника')
  }
  if (envelope.omron !== MARK) throw new Error('Эта копия не зашифрована')
  if (envelope.v !== 1) {
    throw new Error('Копия сделана более новой версией приложения — обновите его и попробуйте снова')
  }

  const key = await deriveKey(password, fromBase64(envelope.kdf.salt))
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.iv) as BufferSource },
      key,
      fromBase64(envelope.data) as BufferSource,
    )
    return decoder.decode(plain)
  } catch {
    // AES-GCM не отличает неверный ключ от подделанных данных: и то и другое
    // проваливает проверку целостности. Для человека вероятнее первое.
    throw new Error('Не подошёл пароль')
  }
}
