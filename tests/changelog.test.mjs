/**
 * История изменений: разбор файла и то, что версия в нём одна на всех.
 *
 * Вторая проверка важнее первой. Номер версии живёт в двух местах — в
 * `CHANGELOG.md`, откуда его берёт приложение, и в `versionName` сборки, откуда
 * его берёт Android. Разойтись они могут молча: выпуск соберётся, поставится и
 * будет показывать в «О приложении» чужой номер. Проверка ловит это до сборки.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseChangelog, currentVersion } from './build/api.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }

  const source = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
  const releases = parseChangelog(source)

  check('файл разобран', releases.length >= 9, `записей: ${releases.length}`)
  check('новая версия сверху', releases[0]?.version === currentVersion(releases))
  check(
    'у каждой записи есть дата и хотя бы одна строка',
    releases.every((r) => r.date && r.items.length > 0),
    releases.filter((r) => !r.date || !r.items.length).map((r) => r.version).join(', '),
  )
  check(
    'версии не повторяются',
    new Set(releases.map((r) => r.version)).size === releases.length,
  )
  check(
    'номера версий выглядят как номера',
    releases.every((r) => /^\d+\.\d+\.\d+$/.test(r.version)),
    releases.map((r) => r.version).filter((v) => !/^\d+\.\d+\.\d+$/.test(v)).join(', '),
  )

  // Пояснение в шапке файла тоже размечено списком — оно не должно попасть в
  // первую запись: человек увидел бы в «Что изменилось» инструкцию для себя же.
  check('шапка файла не попала в записи', !releases.some((r) => r.items.some((i) => i.includes('строка списка'))))

  const gradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8')
  const versionName = /versionName\s+"([^"]+)"/.exec(gradle)?.[1]
  check(
    'версия сборки совпадает с верхней записью истории',
    versionName === currentVersion(releases),
    `build.gradle: ${versionName}, CHANGELOG.md: ${currentVersion(releases)}`,
  )

  // Разбор не должен зависеть от того, чем кончается файл и есть ли пустые
  // строки: файл правят руками, и на этом легко споткнуться.
  const рваный = '## 1.2.3 — вчера\n-  первое  \n\n\n-\tвторое\n## 1.2.2 — позавчера\n- третье'
  const разобрано = parseChangelog(рваный)
  check('лишние пробелы и пустые строки не мешают', разобрано.length === 2 && разобрано[0].items[0] === 'первое')
  check('заголовок без списка пропускается', parseChangelog('## 9.9.9 — никогда').length === 0)

  return failures
}
