import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 3, hasTouch: true })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(900)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.textScale = 'xlarge'; cur.trackGlucose = true; cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close(); localStorage.setItem('textScale', 'xlarge')
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(500)
await go(page, { tool: 'Отчёт' })
await page.waitForTimeout(300)
await page.evaluate(() => { const b=[...document.querySelectorAll('.segmented button')].pop(); b.click() })
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/vr_harm_all_selected.png` })
// печатная версия
await page.emulateMedia({ media: 'print' })
await page.waitForTimeout(300)
const printTxt = await page.evaluate(() => {
  const seg = document.querySelector('.segmented')
  return { segVisible: seg ? seg.getBoundingClientRect().width : 0, segDisplay: seg ? getComputedStyle(seg).display : '—',
    facts: [...document.querySelectorAll('.report-facts tr')].map(t=>t.textContent.trim()).slice(0,3) }
})
console.log(JSON.stringify(printTxt))
await page.screenshot({ path: `${OUT}/vr_harm_print.png`, fullPage: false })
await ctx.close(); await browser.close()
