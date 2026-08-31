import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:5199'
const browser = await chromium.launch()

for (const width of [320, 360, 384, 393, 412]) {
  const ctx = await browser.newContext({
    viewport: { width, height: 800 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true,
  })
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

  const m = await page.evaluate(() => {
    const de = document.documentElement
    const seg = document.querySelector('.segmented')
    const btns = [...seg.querySelectorAll('button')]
    const last = btns[btns.length - 1].getBoundingClientRect()
    const vw = de.clientWidth
    // что ещё вылезает за вьюпорт, кроме переключателя
    const over = []
    document.querySelectorAll('body *').forEach((el) => {
      const b = el.getBoundingClientRect()
      if (b.width > 0 && b.right > vw + 0.5) {
        const inSeg = seg.contains(el) || el === seg
        if (!inSeg) over.push({ cls: el.className && el.className.toString().slice(0, 30) || el.tagName, right: +b.right.toFixed(1), pos: getComputedStyle(el).position })
      }
    })
    const nav = document.querySelector('nav.tabs')
    const nb = nav.getBoundingClientRect()
    const tabs = [...nav.querySelectorAll('button')].map((t) => { const b = t.getBoundingClientRect(); return { t: t.textContent.trim().slice(0,12), l: +b.left.toFixed(0), r: +b.right.toFixed(0), out: b.right > vw + 0.5 } })
    return {
      vw, docScrollW: de.scrollWidth, overflowPx: de.scrollWidth - vw,
      segW: +seg.getBoundingClientRect().width.toFixed(1),
      lastVisibleTapWidth: +(Math.min(last.right, vw) - last.left).toFixed(1),
      lastTotalWidth: +last.width.toFixed(1),
      hiddenPct: Math.round(100 * Math.max(0, last.right - vw) / last.width),
      nav: { l: +nb.left.toFixed(0), r: +nb.right.toFixed(0), w: +nb.width.toFixed(0) },
      tabsOutside: tabs.filter((t) => t.out),
      tabCount: tabs.length,
      otherOverflow: over,
    }
  })
  console.log(`--- ширина ${width} ---`)
  console.log(JSON.stringify(m))
  await ctx.close()
}
await browser.close()
