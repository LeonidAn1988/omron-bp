/**
 * Обмен через Яндекс.Диск — то, что можно проверить без сети.
 *
 * Ошибка в адресе или в разборе ключа означает, что обмен не заработает вовсе,
 * а человек будет думать, что настроил. Поэтому каждая ссылка сторожится.
 */
import { authUrl, parseToken, authHeader, listUrl, uploadUrl, downloadUrl, diskFileName, parseListing, parseHref, DISK_FOLDER, YANDEX_CLIENT_ID } from './build/api.mjs'

export function run() {
  let failures = 0
  const check = (name, condition, detail = '') => {
    if (condition) console.log(`  ok   ${name}`)
    else {
      console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }

  // ── вход ─────────────────────────────────────────────────────────────────
  check('страница входа просит ключ сразу', authUrl().includes('response_type=token'))
  check('и называет наше приложение', authUrl().includes(YANDEX_CLIENT_ID))
  check('идентификатор приложения на месте', /^[0-9a-f]{32}$/.test(YANDEX_CLIENT_ID))

  // ── ключ ─────────────────────────────────────────────────────────────────
  const ключ = 'y0__wgBEOqp_gsGAAAAAADrfAAAAAD3q7yourfaketokenvalue'
  check('голый ключ принимается', parseToken(ключ) === ключ)
  check('ключ из адреса', parseToken(`https://oauth.yandex.ru/verification_code#access_token=${ключ}&token_type=bearer`) === ключ)
  check('ключ из строки с подписью', parseToken(`  access_token=${ключ}  `) === ключ)
  check('пустая строка — ничего', parseToken('   ') === null)
  check('случайный текст — ничего', parseToken('не знаю что вставить') === null)
  check('слишком короткое — ничего', parseToken('abc123') === null)
  check('заголовок в формате Яндекса', authHeader(ключ).Authorization === `OAuth ${ключ}`)

  // ── адреса ───────────────────────────────────────────────────────────────
  check('папка приложения, а не весь Диск', DISK_FOLDER === 'app:/')
  check('список идёт в папку приложения', decodeURIComponent(listUrl()).includes('path=app:/'))
  check('загрузка перезаписывает файл', uploadUrl('дневник.json').includes('overwrite=true'))
  check('в адресе загрузки закодировано имя', uploadUrl('дневник-Отец.json').includes(encodeURIComponent('дневник-Отец.json')))
  check('скачивание берёт тот же путь', decodeURIComponent(downloadUrl('дневник.json')).includes('app:/дневник.json'))
  check('все адреса — к API Диска', [listUrl(), uploadUrl('a.json'), downloadUrl('a.json')].every((u) => u.startsWith('https://cloud-api.yandex.net/v1/disk/')))

  // ── имя файла ────────────────────────────────────────────────────────────
  check('имя человека в названии', diskFileName('Отец') === 'дневник-Отец.json')
  check('«Я» в название не идёт', diskFileName('Я') === 'дневник.json')
  check('без имени — общее название', diskFileName(undefined) === 'дневник.json')
  check('косые из имени вычищены', !diskFileName('а/б:в').includes('/'))

  // ── разбор ответов ───────────────────────────────────────────────────────
  const ответ = { _embedded: { items: [
    { type: 'file', name: 'дневник-Отец.json', modified: '2026-09-05T10:00:00+00:00', size: 1200 },
    { type: 'file', name: 'фото.jpg', modified: '2026-09-05T10:00:00+00:00', size: 90 },
    { type: 'dir', name: 'папка' },
    { type: 'file', name: 'дневник.json', size: 900 },
    null,
  ] } }
  const файлы = parseListing(ответ)
  check('в списке только дневники', файлы.map((f) => f.name).join() === 'дневник-Отец.json,дневник.json')
  check('дата разобрана', файлы[0].modified === Date.parse('2026-09-05T10:00:00+00:00'))
  check('без даты — null, а не NaN', файлы[1].modified === null)
  check('мусор не роняет разбор', parseListing({}).length === 0 && parseListing(null).length === 0)

  check('ссылка берётся', parseHref({ href: 'https://uploader1.disk.yandex.net/upload?x=1' }) === 'https://uploader1.disk.yandex.net/upload?x=1')
  check('не-https ссылка отвергается', parseHref({ href: 'http://злоумышленник/' }) === null)
  check('нет ссылки — null', parseHref({}) === null)

  return failures
}
