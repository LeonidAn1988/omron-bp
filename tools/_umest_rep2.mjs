import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:5199'

const M = () => {
  const t = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const card = el.closest('.card')
    const brk = (n) => { const r = document.createRange(); r.selectNodeContents(n); return r.getClientRects().length }
    return {
      w: Math.round(el.getBoundingClientRect().width),
      scrollW: el.scrollWidth,
      card: card.clientWidth,
      over: el.scrollWidth > card.clientWidth,
      ths: [...el.querySelectorAll('th')].map(th => `${th.textContent.trim()}=${brk(th.firstChild)}стр/${Math.round(th.getBoundingClientRect().width)}px`),
    }
  }
  const de = document.documentElement
  return { root: getComputedStyle(de).fontSize, docScrollW: de.scrollWidth, docClientW: de.clientWidth,
    horiz: de.scrollWidth > de.clientWidth, drugs: t('.report-drugs'), adh: t('.report-adherence') }
}

const FIX = `
.report-drugs, .report-adherence { table-layout: auto; }
.report-drugs th, .report-drugs td, .report-adherence th, .report-adherence td { min-width: 0; }
.report-drugs th, .report-adherence th { hyphens: manual; overflow-wrap: normal; }
.report-adherence td:nth-child(3) { white-space: nowrap; }
.report-drugs th:nth-child(1), .report-drugs td:nth-child(1),
.report-drugs th:nth-child(2), .report-drugs td:nth-child(2),
.report-adherence th:nth-child(1), .report-adherence td:nth-child(1),
.report-adherence th:nth-child(2), .report-adherence td:nth-child(2),
.report-adherence th:nth-child(3), .report-adherence td:nth-child(3) { width: auto; }`

const browser = await chromium.launch()
for (const [width, density] of [[360,'roomy'],[320,'normal'],[320,'roomy']]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await seed(page, FROZEN)
  await page.evaluate(async (d) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = 'xlarge'; cur.density = d; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close(); localStorage.setItem('textScale','xlarge'); localStorage.setItem('density', d)
  }, density)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(400)
  await go(page, { tool: 'Отчёт' })
  await page.waitForTimeout(600)
  const before = await page.evaluate(M)
  await page.addStyleTag({ content: FIX })
  await page.waitForTimeout(300)
  const after = await page.evaluate(M)
  console.log(`\n### ${width}px xlarge ${density}`)
  console.log('  ДО   :', JSON.stringify(before))
  console.log('  ПОСЛЕ:', JSON.stringify(after))
  await ctx.close()
}
await browser.close()
