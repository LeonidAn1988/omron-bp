import { chromium } from 'playwright'
import { seed, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1800)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(600)
await page.locator('nav.tabs button', { hasText: 'Аптечка' }).first().click()
await page.waitForTimeout(350)
await page.locator('button', { hasText: 'Добавить препарат' }).first().click()
await page.waitForTimeout(350)
const input = page.locator('.suggest input').first()
await input.click(); await input.fill('Диклофенак')
await page.waitForTimeout(800)
const n = await page.locator('.suggest__item').count()
console.log('подсказок', n)
await page.locator('.suggest__item').first().click()
await page.waitForTimeout(500)
const m = await page.evaluate(() => {
  const g = document.querySelector('.chips[aria-label="Формы выпуска из реестра"]')
  return {
    name: document.querySelector('.suggest input').value,
    inner: g ? Math.round(g.getBoundingClientRect().width) : null,
    chips: g ? [...g.querySelectorAll('.chip')].map(c => ({ t: c.textContent.trim(), len: c.textContent.trim().length, w: Math.round(c.getBoundingClientRect().width), right: Math.round(c.getBoundingClientRect().right) })) : [],
    scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
  }
})
console.log(JSON.stringify(m, null, 1))
await page.screenshot({ path: `${OUT}/rf_chip3_diclo.png` })
await browser.close()
