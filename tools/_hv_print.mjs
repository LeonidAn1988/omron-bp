import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4477'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true, isMobile: true })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
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
await page.waitForTimeout(600)

// печатная раскладка
await page.emulateMedia({ media: 'print' })
await page.waitForTimeout(300)
const pm = await page.evaluate(() => {
  const out = []
  for (const w of document.querySelectorAll('.table-scroll')) {
    const title = w.closest('.card')?.querySelector('h2')?.textContent.trim() ?? '(?)'
    out.push({ title, clientW: w.clientWidth, scrollW: w.scrollWidth, overflowX: getComputedStyle(w).overflowX,
      cols: [...w.querySelectorAll('thead th')].map(th => th.textContent.trim() + '=' + Math.round(th.getBoundingClientRect().width)) })
  }
  return { root: getComputedStyle(document.documentElement).fontSize, out }
})
console.log('ПЕЧАТЬ (media=print), rootFont', pm.root)
for (const t of pm.out) console.log(' ', t.title, `| ${t.clientW}видно/${t.scrollW}всего overflow-x:${t.overflowX} |`, t.cols.join(' '))
await page.pdf({ path: `${OUT}/hv_report.pdf`, format: 'A4', printBackground: false })
await page.emulateMedia({ media: 'screen' })
await ctx.close(); await browser.close()
