import { chromium } from 'playwright'
import { seed, FROZEN } from './visual.mjs'
const URL = process.env.URL ?? 'http://localhost:5199'
const browser = await chromium.launch()
const EXTRA = [
  { id: 'x1', name: 'Амлодипин', dose: '5 мг', inn: 'Амлодипин', form: 'Таблетки' },
  { id: 'x2', name: 'Аторвастатин', dose: '12,5 мг', inn: 'Аторвастатин', form: 'Таблетки' },
  { id: 'x3', name: 'Периндоприл', dose: '1000 МЕ/мл', inn: 'Периндоприл', form: 'Таблетки' },
  { id: 'x4', name: 'Колекальциферол', dose: '2000 МЕ', inn: 'Колекальциферол', form: 'Капли' },
]
const results = []
for (const width of [320, 360, 412]) {
for (const density of ['compact', 'normal', 'roomy']) {
for (const scale of ['small', 'normal', 'large', 'xlarge']) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'light', ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async ({ s, d, extra, now }) => {
    const DAY = 86400000
    const day0 = (() => { const x = new Date(now); x.setHours(0,0,0,0); return x.getTime() })()
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s; cur.density = d; cur.onboarded = true; cur.trackGlucose = true
    const marks = []; for (let i = -20; i <= 0; i++) marks.push(day0 + i*DAY + 8*3600000)
    await new Promise((res, rej) => { const tx = db.transaction(['meta','medicines'],'readwrite')
      tx.objectStore('meta').put(cur,'settings')
      extra.forEach((m) => tx.objectStore('medicines').put({ ...m, maker: 'Озон', packSize: 30, left: 20,
        perDay: null, expires: Date.UTC(2027,6,31), times: ['08:00'], perTime: 1, taken: marks }))
      tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, { s: scale, d: density, extra: EXTRA, now: FROZEN })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 30000 })
  await page.locator('header button', { hasText: 'Отчёт' }).first().click()
  await page.waitForTimeout(600)
  const r = await page.evaluate(() => {
    const linesOf = (el) => {
      const out = []; const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, cur = null
      while ((n = walk.nextNode())) { const t = n.nodeValue; if (!t.trim()) continue
        const rg = document.createRange()
        for (let i = 0; i < t.length; i++) { rg.setStart(n,i); rg.setEnd(n,i+1)
          const rc = rg.getBoundingClientRect(); if (!rc.width && !rc.height) continue
          const top = Math.round(rc.top)
          if (!cur || Math.abs(cur.top - top) > 3) { cur = { top, s: '' }; out.push(cur) }
          cur.s += t[i] } }
      return out.map((l) => l.s)
    }
    const grab = (sel) => { const t = document.querySelector(sel); if (!t) return null
      return { w: Math.round(t.getBoundingClientRect().width),
        th: [...t.querySelectorAll('th')].map((x) => linesOf(x)),
        td: [...t.querySelectorAll('tbody td')].map((x) => ({ l: linesOf(x), hidden: getComputedStyle(x).overflow !== 'visible' && x.scrollHeight > x.clientHeight + 1 })) } }
    return { root: getComputedStyle(document.documentElement).fontSize,
      drugs: grab('.report-drugs'), adh: grab('.report-adherence'),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      tableOverflow: [...document.querySelectorAll('.report-drugs, .report-adherence')].some(t => t.scrollWidth > t.clientWidth + 1) }
  })
  // Разбитые пополам слова в шапке и разорванные числа в ячейках
  const brokenTh = []
  for (const t of ['drugs','adh']) if (r[t]) r[t].th.forEach((l) => { if (l.length > 1 && l.some((s) => !/[\s,]$/.test(s) && l.indexOf(s) < l.length - 1)) brokenTh.push(`${t}:${l.join('/')}`) })
  const brokenNum = []
  for (const t of ['drugs','adh']) if (r[t]) r[t].td.forEach((c) => {
    for (let i = 0; i < c.l.length - 1; i++) {
      const a = c.l[i], b = c.l[i+1]
      if (/\d$/.test(a.trimEnd()) && /^[\d%]/.test(b)) brokenNum.push(`${t}: ${a}|${b}`)
      if (/%$/.test(b.trim()) && /\d$/.test(a.trim()) && b.trim() === '%') brokenNum.push(`${t}: PCT ${a}|${b}`)
    }
  })
  results.push({ width, density, scale, root: r.root, brokenTh, brokenNum,
    hidden: (r.drugs?.td||[]).concat(r.adh?.td||[]).filter(c=>c.hidden).length,
    tableOverflow: r.tableOverflow, docOverflowX: r.overflowX,
    dolya: r.adh ? r.adh.td.filter((_,i)=>i%3===2).map(c=>c.l.join('/')) : [],
    doza: r.drugs ? r.drugs.td.filter((_,i)=>i%3===1).map(c=>c.l[0]) : [] })
  await ctx.close()
}}}
console.log(JSON.stringify(results, null, 1))
await browser.close()
