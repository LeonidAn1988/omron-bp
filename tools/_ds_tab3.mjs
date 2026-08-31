import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4477'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.onboarded = true; cur.trackGlucose = false
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(400)
await go(page, { tab: 'Приём' })
await page.waitForTimeout(400)
// закрыть баннер «Понятно», если он есть
const ok = page.locator('button', { hasText: /^Понятно$/ }).first()
if (await ok.count()) { await ok.click(); await page.waitForTimeout(400) }
const r = await page.evaluate(() => {
  const sel = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'
  const all = [...document.querySelectorAll(sel)]
  const list = all.map((e,i)=>({i:i+1, day:e.classList.contains('daystrip__day'), txt:(e.innerText||e.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim().slice(0,30)}))
  const d = list.filter(x=>x.day)
  const pos = [...new Set(all.map(e=>e.getAttribute('tabindex')).filter(t=>t&&+t>0))]
  return { total: list.length, days: d.length, from: d[0].i, to: d[d.length-1].i, positiveTabindex: pos, first: list.find(x=>/^Принял/.test(x.txt)), before: list.filter(x=>x.i<d[0].i).map(x=>x.txt), after: list.filter(x=>x.i>d[d.length-1].i).map(x=>`${x.i}:${x.txt}`) }
})
console.log(JSON.stringify(r, null, 1))
await browser.close()
