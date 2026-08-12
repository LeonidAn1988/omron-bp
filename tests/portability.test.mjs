/**
 * Ядро обязано оставаться переносимым.
 *
 * Конечная цель проекта — нативные приложения под Android, iOS, macOS и Windows.
 * Переезд дешёвый ровно до тех пор, пока разбор протокола, классификация,
 * статистика и обмен файлами не знают ни про DOM, ни про React: платформенное
 * живёт в `src/platform/` за интерфейсами.
 *
 * Этот инвариант ломается незаметно — достаточно одного `document.` в удобном
 * месте, — поэтому он проверяется, а не только описан в документации.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function dirname(path) {
  return path.slice(0, path.lastIndexOf('/'))
}

/** Файлы ядра: всё, что обязано пережить смену платформы без правок. */
const CORE = ['src/types.ts', 'src/ble/protocol.ts', 'src/ble/hem6232t.ts', 'src/ble/session.ts', 'src/logic', 'src/db']

/** Глобальные объекты среды, которых в ядре быть не должно. */
const FORBIDDEN = [
  ['document', /\bdocument\s*\./],
  ['window', /\bwindow\s*\./],
  ['navigator', /\bnavigator\s*\./],
  ['indexedDB', /\bindexedDB\b/],
  ['localStorage', /\blocalStorage\b/],
  ['react', /from\s+'react'/],
  ['типы Web Bluetooth', /\bBluetoothRemoteGATT\w*|\bBluetoothDevice\b/],
]

function collect(target) {
  const full = join(root, target)
  if (statSync(full).isFile()) return [target]
  return readdirSync(full)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => `${target}/${name}`)
}

export function run() {
  let failures = 0
  const files = CORE.flatMap(collect).sort()

  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8')
    // Комментарии не в счёт: они как раз объясняют, почему платформенного тут нет.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const hits = FORBIDDEN.filter(([, pattern]) => pattern.test(code)).map(([name]) => name)

    if (hits.length === 0) {
      console.log(`  ok   ${file}`)
    } else {
      console.log(`  FAIL ${file} — зависит от платформы: ${hits.join(', ')}`)
      failures++
    }
  }

  console.log(`  проверено файлов ядра: ${files.length}`)
  if (failures === 0) console.log('  ok   ядро переносимо: платформенное только в src/platform/')
  return failures
}
