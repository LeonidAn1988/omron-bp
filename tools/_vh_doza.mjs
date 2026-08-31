import { chromium } from 'playwright'
import { seed, FROZEN } from './visual.mjs'
const URL = process.env.URL ?? 'http://localhost:5199'
const browser = await chromium.launch()
// Самые опасные строки дозировки: комбинированные, с запятой, с дробью.
const EXTRA = [
  { id: 'd1', name: 'Ко-перинева', dose: '160/12,5 мг', form: 'Таблетки' },
  { id: 'd2', name: 'Дигоксин', dose: '0,125 мг', form: 'Таблетки' },
  { id: 'd3', name: 'Варфарин', dose: '2,5 мг', form: 'Таблетки' },
  { id: 'd4', name: 'Метопролол', dose: '1000 мг', form: 'Таблетки' },
  { id: 'd5', name: 'Инсулин гларгин', dose: '100 ЕД/мл', form: 'Раствор для подкожного введения' },
  { id: 'd6', name: 'Эутирокс', dose: '112,5 мкг', form: 'Таблетки' },
]
for (const [w, dens, sc] of [[320,'roomy','xlarge'], [320,'normal','xlarge'], [360,'roomy','xlarge'], [360,'normal','xlarge'], [280,'roomy','xlarge']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'light', ignoreHTTPSErrors: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async ({ s, d, extra }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s; cur.density = d; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction(['meta','medicines'],'readwrite')
      tx.objectStore('meta').put(cur,'settings')
      extra.forEach((m) => tx.objectStore('medicines').put({ ...m, maker: 'Озон', packSize: 30, left: 20,
        perDay: null, expires: Date.UTC(2027,6,31), times: ['08:00'], perTime: 1, taken: [] }))
      tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, { s: sc, d: dens, extra: EXTRA })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 30000 })
  await page.locator('header button', { hasText: 'Отчёт' }).first().click()
  await page.waitForTimeout(600)
  const out = await page.evaluate(() => {
    const linesOf = (el) => { const out = []; const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, cur = null
      while ((n = walk.nextNode())) { const t = n.nodeValue; if (!t.trim()) continue
        const rg = document.createRange()
        for (let i = 0; i < t.length; i++) { rg.setStart(n,i); rg.setEnd(n,i+1)
          const rc = rg.getBoundingClientRect(); if (!rc.width && !rc.height) continue
          const top = Math.round(rc.top)
          if (!cur || Math.abs(cur.top - top) > 3) { cur = { top, s: '' }; out.push(cur) }
          cur.s += t[i] } }
      return out.map((l) => l.s) }
    const t = document.querySelector('.report-drugs')
    return [...t.querySelectorAll('tbody tr')].map((tr) => {
      const tds = [...tr.querySelectorAll('td')]
      return { name: tds[0].innerText.split('\n')[0], dose: linesOf(tds[1]) }
    })
  })
  console.log(`### ${w}px / ${dens} / ${sc}`)
  for (const r of out) console.log('   ', r.name.padEnd(18), JSON.stringify(r.dose))
  await ctx.close()
}
await browser.close()
