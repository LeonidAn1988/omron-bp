/* Насколько узок коридор дефекта: ширины × шрифт × плотность. */
import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const NAMES = ['Периндоприл', 'Аторвастатин']

const browser = await chromium.launch()
const rows = []
for (const w of [320, 360, 375, 390, 412, 430]) {
  for (const text of ['normal', 'large', 'xlarge']) {
    for (const density of ['normal', 'roomy']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 812 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light' })
      const page = await ctx.newPage()
      await page.clock.install({ time: new Date(FROZEN) })
      await page.goto(URL, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(600)
      await seed(page, FROZEN)
      await page.evaluate(async ({ t, d, names }) => {
        const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
        const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
        cur.textScale = t; cur.density = d; cur.trackGlucose = true; cur.onboarded = true
        await new Promise((res, rej) => {
          const tx = db.transaction(['meta','medicines'], 'readwrite')
          tx.objectStore('meta').put(cur, 'settings')
          names.forEach((n, i) => tx.objectStore('medicines').put({
            id: `x${i}`, name: n, dose: '10 мг', inn: n, form: 'Таблетки', maker: 'Озон',
            packSize: 30, left: 20, perDay: null, expires: Date.UTC(2027, 7, 31),
            times: ['20:00', '21:00'], perTime: 1, taken: [],
          }))
          tx.oncomplete = res; tx.onerror = () => rej(tx.error)
        })
        db.close()
        localStorage.setItem('textScale', t)
        if (d === 'normal') localStorage.removeItem('density'); else localStorage.setItem('density', d)
      }, { t: text, d: density, names: NAMES })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector('nav.tabs', { timeout: 20000 })
      await page.waitForTimeout(300)
      await go(page, { tab: 'Приём' })
      await page.waitForTimeout(400)
      const r = await page.evaluate(() => {
        let worst = null
        for (const li of document.querySelectorAll('.dose')) {
          const name = li.querySelector('.dose__name'); const btn = li.querySelector(':scope > .btn')
          if (!name || !btn) continue
          const n = name.getBoundingClientRect(), t = btn.getBoundingClientRect()
          const vClash = Math.min(n.bottom, t.bottom) - Math.max(n.top, t.top) > 0
          const ov = +(n.right - t.left).toFixed(1)
          if (vClash && ov > 0 && (!worst || ov > worst.ov)) worst = { nm: name.textContent, ov }
        }
        return worst
      })
      rows.push({ w, text, density, worst: r })
      await ctx.close()
    }
  }
}
for (const r of rows) {
  console.log(`${String(r.w).padStart(4)}  ${r.text.padEnd(7)} ${r.density.padEnd(7)}  ${r.worst ? `ПЕРЕКРЫТИЕ ${r.worst.ov}px  (${r.worst.nm})` : 'чисто'}`)
}
await browser.close()
