/** Замер переключателя периода в «Отчёте врачу» по всей сетке размер×плотность. */
import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4877'
const WIDTHS = [360, 375]
const SCALES = ['small', 'normal', 'large', 'xlarge']
const DENS = ['compact', 'normal', 'roomy']

const browser = await chromium.launch()
const rows = []

for (const width of WIDTHS) {
  for (const sc of SCALES) {
    for (const de of DENS) {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
        colorScheme: 'dark', deviceScaleFactor: 3, hasTouch: true, isMobile: true,
      })
      const page = await ctx.newPage()
      await page.clock.install({ time: new Date(FROZEN) })
      await page.goto(URL, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(900)
      await seed(page, FROZEN)
      await page.evaluate(async ([a, b]) => {
        const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
        const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
        cur.textScale = a; cur.density = b; cur.onboarded = true
        await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
        db.close()
      }, [sc, de])
      await page.reload({ waitUntil: 'domcontentloaded' })
      await settle(page)
      await go(page, { tool: 'Отчёт' })
      const m = await page.evaluate(() => {
        const g = document.querySelector('.segmented[aria-label="Период отчёта"]')
        if (!g) return { missing: true }
        const gr = g.getBoundingClientRect()
        const de = document.documentElement
        const parent = g.parentElement
        const pr = parent.getBoundingClientRect()
        const cs = getComputedStyle(parent)
        const btns = [...g.querySelectorAll('button')].map((b) => {
          const r = b.getBoundingClientRect()
          return { t: b.textContent.trim(), l: +r.left.toFixed(1), r: +r.right.toFixed(1), w: +r.width.toFixed(1) }
        })
        return {
          rootFont: getComputedStyle(de).fontSize,
          tap: getComputedStyle(de).getPropertyValue('--tap'),
          groupW: +gr.width.toFixed(1),
          groupL: +gr.left.toFixed(1),
          groupR: +gr.right.toFixed(1),
          parentCls: parent.className,
          parentW: +pr.width.toFixed(1),
          parentL: +pr.left.toFixed(1),
          parentWrap: cs.flexWrap,
          clientW: de.clientWidth,
          docScrollW: de.scrollWidth,
          bodyScrollW: document.body.scrollWidth,
          scrollsX: de.scrollWidth > de.clientWidth + 0.5,
          lastBtnClip: +(btns[btns.length - 1].r - de.clientWidth).toFixed(1),
          btns,
        }
      })
      rows.push({ width, sc, de, ...m })
      console.log(`${width} ${sc.padEnd(7)} ${de.padEnd(8)} root=${m.rootFont} group=${m.groupW} L=${m.groupL} R=${m.groupR} clientW=${m.clientW} scrollW=${m.docScrollW} scrollsX=${m.scrollsX} clipLast=${m.lastBtnClip}`)
      await ctx.close()
    }
  }
}
console.log('\n--- JSON ---')
console.log(JSON.stringify(rows, null, 1))
await browser.close()
