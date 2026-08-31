/** Путь человека с плохим зрением: приходит на «Размер текста» и уходит с крупным шрифтом. */
import { chromium } from 'playwright'
import { seed, go, settle, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4711'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 407, height: 1000 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 3, hasTouch: true, isMobile: true })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(900)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.onboarded = true; cur.theme = 'dark'
  await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
await go(page, { tool: 'Настройки' })

const shot = async (name) => {
  const grp = page.locator('.segmented--fill[aria-label="Размер текста"]')
  const sam = page.locator('.sample')
  await grp.scrollIntoViewIfNeeded(); await page.waitForTimeout(250)
  const a = await grp.boundingBox(); const b = await sam.boundingBox()
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 8, y: a.y - 34, width: 407 - 16, height: (b.y + b.height + 12) - (a.y - 34) } })
}
await shot('zh-1-default')
// доступное имя до нажатия
const names = async () => page.evaluate(() => [...document.querySelectorAll('.segmented--fill[aria-label="Размер текста"] button')].map((b) => `${b.getAttribute('aria-pressed') === 'true' ? '*' : ' '}${b.textContent.trim()}`))
console.log('до:', JSON.stringify(await names()))
await page.getByRole('button', { name: 'Очень крупный', exact: true }).click()
await page.waitForTimeout(500)
await shot('zh-2-xlarge')
console.log('после:', JSON.stringify(await names()))
// снимок дерева доступности (что услышит скринридер)
const ax = await page.accessibility.snapshot({ root: await page.locator('.segmented--fill[aria-label="Размер текста"]').elementHandle() })
console.log('a11y:', JSON.stringify(ax))
await browser.close()
