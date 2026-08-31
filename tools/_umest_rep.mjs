import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:5199'

const MEASURE = () => {
  const brokenWord = (el) => {
    // Слово считаем разорванным, если его текстовый узел занимает больше
    // одного прямоугольника (то есть переполз на вторую строку).
    const out = []
    for (const n of el.childNodes) {
      if (n.nodeType !== 3) continue
      const words = n.textContent.trim()
      if (!words) continue
      const r = document.createRange()
      r.selectNodeContents(n)
      out.push({ text: words, rects: r.getClientRects().length })
    }
    return out
  }
  const tbl = (sel) => {
    const t = document.querySelector(sel)
    if (!t) return null
    const card = t.closest('.card')
    return {
      sel,
      tableScrollW: t.scrollWidth,
      tableClientW: Math.round(t.getBoundingClientRect().width),
      cardClientW: card ? card.clientWidth : null,
      ths: [...t.querySelectorAll('th')].map((th) => ({
        t: th.textContent.trim(),
        w: Math.round(th.getBoundingClientRect().width),
        lines: Math.round(th.getBoundingClientRect().height / parseFloat(getComputedStyle(th).lineHeight)),
        parts: brokenWord(th),
      })),
      lastColCells: [...t.querySelectorAll('tr > td:last-child')].slice(0, 6).map((td) => ({
        t: td.textContent.trim(),
        parts: brokenWord(td),
      })),
      firstColCells: [...t.querySelectorAll('tr > td:first-child')].slice(0, 6).map((td) => ({
        t: (td.childNodes[0] && td.childNodes[0].textContent || '').trim(),
        parts: brokenWord(td),
      })),
    }
  }
  const de = document.documentElement
  return {
    rootFont: getComputedStyle(de).fontSize,
    docScrollW: de.scrollWidth,
    docClientW: de.clientWidth,
    bodyScrollW: document.body.scrollWidth,
    horizScroll: de.scrollWidth > de.clientWidth,
    drugs: tbl('.report-drugs'),
    adherence: tbl('.report-adherence'),
  }
}

const FIX = `
.report-drugs, .report-adherence { table-layout: auto; }
.report-drugs th, .report-drugs td,
.report-adherence th, .report-adherence td { min-width: 0; }
.report-drugs th, .report-adherence th { hyphens: manual; overflow-wrap: normal; }
.report-adherence td:nth-child(3) { white-space: nowrap; }
.report-drugs th:nth-child(1), .report-drugs td:nth-child(1),
.report-drugs th:nth-child(2), .report-drugs td:nth-child(2),
.report-adherence th:nth-child(1), .report-adherence td:nth-child(1),
.report-adherence th:nth-child(2), .report-adherence td:nth-child(2),
.report-adherence th:nth-child(3), .report-adherence td:nth-child(3) { width: auto; }
`

const browser = await chromium.launch()
for (const width of [360]) {
  for (const scale of ['normal', 'xlarge']) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2,
    })
    const page = await ctx.newPage()
    await page.clock.install({ time: new Date(FROZEN) })
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    await seed(page, FROZEN)
    await page.evaluate(async (s) => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
      const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
      cur.textScale = s; cur.onboarded = true
      await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
      db.close()
      localStorage.setItem('textScale', s)
    }, scale)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('nav.tabs', { timeout: 20000 })
    await page.waitForTimeout(400)
    await go(page, { tool: 'Отчёт' })
    await page.waitForTimeout(600)

    const before = await page.evaluate(MEASURE)
    console.log(`\n========== ${width}px / ${scale} — КАК СЕЙЧАС ==========`)
    console.log(JSON.stringify(before, null, 1))

    await page.addStyleTag({ content: FIX })
    await page.waitForTimeout(300)
    const after = await page.evaluate(MEASURE)
    console.log(`\n========== ${width}px / ${scale} — С ПРЕДЛОЖЕННОЙ ПРАВКОЙ ==========`)
    console.log(JSON.stringify(after, null, 1))

    await ctx.close()
  }
}
await browser.close()
