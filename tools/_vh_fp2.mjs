import { chromium } from 'playwright'
import { seed, FROZEN } from './visual.mjs'
const URL = process.env.URL ?? 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
for (const dens of ['compact','normal','roomy']) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'dark', ignoreHTTPSErrors: true, deviceScaleFactor: 1220/360 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async (d) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = 'xlarge'; cur.density = d; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, dens)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 30000 })
  await page.evaluate((d) => document.documentElement.setAttribute('data-density', d), dens)
  await page.locator('header button', { hasText: 'Отчёт' }).first().click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/fp_360_${dens}.png` })
  await ctx.close()
}
await browser.close()
