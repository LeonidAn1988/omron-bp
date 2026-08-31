import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
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
const ctx = await browser.newContext({ viewport: { width: 360, height: 900 }, locale: 'ru-RU',
  timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.textScale = 'xlarge'; cur.density = 'roomy'; cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close(); localStorage.setItem('textScale','xlarge'); localStorage.setItem('density','roomy')
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(400)
await go(page, { tool: 'Отчёт' })
await page.waitForTimeout(600)
const card = page.locator('.report-drugs').locator('xpath=ancestor::div[contains(@class,"card")][1]')
await card.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
await card.screenshot({ path: `${OUT}/um_do.png` })
await page.addStyleTag({ content: FIX })
await page.waitForTimeout(400)
await card.screenshot({ path: `${OUT}/um_posle.png` })
// и полный снимок страницы после правки, чтобы увидеть выход за карточку
await page.screenshot({ path: `${OUT}/um_posle_full.png`, fullPage: true })
await browser.close()
