/**
 * Прогон тестов: собирает нужные модули из TypeScript в tests/build и запускает наборы.
 *   npm test
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const testsDir = dirname(fileURLToPath(import.meta.url))
const root = join(testsDir, '..')
const buildDir = join(testsDir, 'build')

rmSync(buildDir, { recursive: true, force: true })
mkdirSync(buildDir, { recursive: true })

for (const [entry, out] of [
  ['src/ble/hem6232t.ts', 'hem6232t.mjs'],
  ['src/logic/io.ts', 'io.mjs'],
  ['src/db/store.ts', 'store.mjs'],
]) {
  execFileSync(
    'npx',
    [
      'esbuild',
      entry,
      '--bundle',
      '--format=esm',
      // fake-indexeddb остаётся внешним: тест подсовывает его через useIndexedDbFactory
      '--external:fake-indexeddb',
      `--outfile=${join(buildDir, out)}`,
      '--log-level=error',
    ],
    { cwd: root, stdio: 'inherit' },
  )
}

const suites = [
  ['Разбор записи прибора (сверка с omblepy)', await import('./parse-record.test.mjs')],
  ['Экспорт и импорт файлов', await import('./io.test.mjs')],
  ['Миграция хранилища с версии 1 на версию 2', await import('./migration.test.mjs')],
]

let failures = 0
for (const [name, suite] of suites) {
  console.log(`\n${name}`)
  failures += await suite.run()
}

rmSync(buildDir, { recursive: true, force: true })

console.log(failures === 0 ? '\nВсе тесты пройдены.\n' : `\nПРОВАЛЕНО ПРОВЕРОК: ${failures}\n`)
process.exit(failures === 0 ? 0 : 1)
