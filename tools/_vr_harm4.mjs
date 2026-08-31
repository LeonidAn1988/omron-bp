import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:5199'
const browser = await chromium.launch()
for (const width of [320, 360]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
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
  await page.waitForTimeout(350)

  const before = await page.evaluate(() => document.documentElement.scrollWidth)
  // 1) убрать переключатель совсем
  const noPicker = await page.evaluate(() => { document.querySelector('.segmented').style.display = 'none'; return document.documentElement.scrollWidth })
  // 2) вернуть и применить предложенную правку
  const fixed = await page.evaluate(() => {
    const s = document.querySelector('.segmented'); s.style.display = ''
    s.classList.add('segmented--fill')
    return { doc: document.documentElement.scrollWidth, segW: +s.getBoundingClientRect().width.toFixed(1),
      widest: [...document.querySelectorAll('.card *')].map((e)=>({c:(e.className||e.tagName).toString().slice(0,24), r:+e.getBoundingClientRect().right.toFixed(1)})).filter(o=>o.r>document.documentElement.clientWidth+0.5 && !/report-adherence|readings|glucose/.test(o.c)).slice(0,6) }
  })
  // 3) тап по обрезанной кнопке (вернём исходный класс)
  const tap = await page.evaluate(() => {
    const s = document.querySelector('.segmented'); s.classList.remove('segmented--fill')
    const btns = [...s.querySelectorAll('button')]; const last = btns[btns.length-1]; const b = last.getBoundingClientRect()
    const x = (b.left + Math.min(b.right, document.documentElement.clientWidth)) / 2, y = b.top + b.height/2
    const el = document.elementFromPoint(x, y); if (el) el.click()
    return { hit: el ? el.textContent.trim() : null, visibleTap: +(Math.min(b.right, document.documentElement.clientWidth)-b.left).toFixed(1) }
  })
  await page.waitForTimeout(300)
  const period = await page.evaluate(() => [...document.querySelectorAll('.report-facts tr')].map(t=>t.textContent.trim()).find(t=>t.startsWith('Период')))
  console.log(JSON.stringify({ width, docWithPicker: before, docWithoutPicker: noPicker, afterProposedFix: fixed, tap, period }))
  await ctx.close()
}
await browser.close()
