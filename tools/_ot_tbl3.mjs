import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:5199'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light' })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.trackGlucose = true; cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await go(page, { tool: 'Отчёт' })
await page.waitForTimeout(400)
await page.emulateMedia({ media: 'print' })
await page.setViewportSize({ width: 794, height: 1123 })  // A4 @96dpi
await page.waitForTimeout(300)
console.log(JSON.stringify(await page.evaluate(() => {
  const r = []
  for (const w of document.querySelectorAll('.table-scroll')) {
    const t = w.querySelector('table')
    if (t.classList.contains('readings-table')) continue
    r.push({ title: w.closest('.card')?.querySelector('h2')?.textContent.trim(),
      overflowX: getComputedStyle(w).overflowX, client: w.clientWidth, scroll: w.scrollWidth,
      cols: [...t.querySelectorAll('thead th')].map(th => ({ th: th.textContent.trim(), w: +th.getBoundingClientRect().width.toFixed(1) })) })
  }
  return r
}), null, 1))
await browser.close()
