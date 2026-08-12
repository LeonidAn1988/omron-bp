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

// Один бандл на все наборы: реестр платформы хранит состояние в модуле,
// и при раздельных бандлах установленная платформа была бы не видна.
execFileSync(
  'npx',
  [
    'esbuild',
    'tests/api.ts',
    '--bundle',
    '--format=esm',
    '--external:fake-indexeddb',
    `--outfile=${join(buildDir, 'api.mjs')}`,
    '--log-level=error',
  ],
  { cwd: root, stdio: 'inherit' },
)

const suites = [
  ['Разбор записи прибора (сверка с omblepy)', await import('./parse-record.test.mjs')],
  ['Экспорт и импорт файлов', await import('./io.test.mjs')],
  ['Миграция хранилища с версии 1 на версию 2', await import('./migration.test.mjs')],
  ['Профиль глюкометра (пакеты по спецификации)', await import('./glucose-profile.test.mjs')],
  ['Сохранность дневника', await import('./backup.test.mjs')],
  ['Переносимость ядра', await import('./portability.test.mjs')],
]

let failures = 0
for (const [name, suite] of suites) {
  console.log(`\n${name}`)
  failures += await suite.run()
}

rmSync(buildDir, { recursive: true, force: true })

console.log(failures === 0 ? '\nВсе тесты пройдены.\n' : `\nПРОВАЛЕНО ПРОВЕРОК: ${failures}\n`)
process.exit(failures === 0 ? 0 : 1)
