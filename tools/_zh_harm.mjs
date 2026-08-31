/**
 * Угол «вред»: может ли обрезка подписи в .segmented--fill привести человека
 * к ошибке — не к косметике, а к неверному выбору или потере данных.
 *
 * Меряем по всей матрице: ширина × размер текста × плотность × дневник сахара.
 * Для каждой кнопки — сколько пикселей текста вылезло за её рамку и какая
 * часть подписи остаётся видимой (сосед рисует фон поверх).
 */
import { chromium } from 'playwright'
import { seed, go, settle, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4711'
const browser = await chromium.launch()

const rows = []
for (const w of [320, 360, 393, 407]) {
  for (const sc of ['small', 'normal', 'large', 'xlarge']) {
    for (const gl of [false, true]) {
      const de = 'normal'
      const ctx = await browser.newContext({
        viewport: { width: w, height: 1400 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
        colorScheme: 'light', deviceScaleFactor: 2, hasTouch: true, isMobile: true,
      })
      const page = await ctx.newPage()
      await page.clock.install({ time: new Date(FROZEN) })
      await page.goto(URL, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(900)
      await seed(page, FROZEN)
      await page.evaluate(async ([a, b, g]) => {
        const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
        const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
        cur.textScale = a; cur.density = b; cur.onboarded = true; cur.trackGlucose = g
        await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
        db.close()
      }, [sc, de, gl])
      await page.reload({ waitUntil: 'domcontentloaded' })
      await settle(page)
      await go(page, { tool: 'Настройки' })
      await page.waitForTimeout(300)

      const data = await page.evaluate(() => {
        const out = []
        for (const s of document.querySelectorAll('.segmented--fill')) {
          const sb = s.getBoundingClientRect()
          // карточка-родитель
          const card = s.closest('.card')
          const cb = card ? card.getBoundingClientRect() : null
          const cs = card ? getComputedStyle(card) : null
          const inner = cb ? { l: cb.left + parseFloat(cs.paddingLeft), r: cb.right - parseFloat(cs.paddingRight) } : null
          const btns = [...s.querySelectorAll('button')].map((b) => {
            const bb = b.getBoundingClientRect()
            const r = document.createRange(); r.selectNodeContents(b)
            const rects = [...r.getClientRects()]
            const tr = Math.max(...rects.map((x) => x.right))
            const tl = Math.min(...rects.map((x) => x.left))
            return {
              t: b.textContent.trim(),
              on: b.getAttribute('aria-pressed') === 'true',
              w: +bb.width.toFixed(1),
              overR: +(tr - bb.right).toFixed(1),
              overL: +(bb.left - tl).toFixed(1),
              lines: rects.length,
              // сколько символов подписи реально видно: обрезаем по правой рамке
              // кнопки (следующий сосед рисует свой фон поверх)
              vis: (() => {
                const node = [...b.childNodes].find((n) => n.nodeType === 3)
                if (!node) return b.textContent.trim()
                const txt = node.textContent
                let acc = ''
                for (let i = 0; i < txt.length; i++) {
                  const rr = document.createRange(); rr.setStart(node, i); rr.setEnd(node, i + 1)
                  const cr = rr.getBoundingClientRect()
                  if (cr.right <= bb.right + 0.6) acc += txt[i]
                }
                return acc
              })(),
            }
          })
          out.push({
            label: s.getAttribute('aria-label'),
            groupW: +sb.width.toFixed(1),
            outCardR: inner ? +(sb.right - inner.r).toFixed(1) : null,
            // самый правый пиксель текста относительно правой границы группы
            textPastGroup: +(Math.max(...btns.map((b, i) => (i === btns.length - 1 ? b.overR : -999))) ).toFixed(1),
            btns,
          })
        }
        return out
      })
      rows.push({ w, sc, gl, data })
      await ctx.close()
    }
  }
}
await browser.close()

for (const r of rows) {
  const bad = r.data.filter((g) => g.btns.some((b) => b.overR > 0.6))
  if (!bad.length) { console.log(`${r.w} ${r.sc} сахар=${r.gl ? 'вкл' : 'выкл'}  — обрезки НЕТ`); continue }
  console.log(`${r.w} ${r.sc} сахар=${r.gl ? 'вкл' : 'выкл'}`)
  for (const g of bad) {
    console.log(`   [${g.label}] группа=${g.groupW} за карточку=${g.outCardR} текст за группой=${g.textPastGroup}`)
    for (const b of g.btns) console.log(`      ${b.on ? '*' : ' '} "${b.t}" w=${b.w} over=${b.overR} видно="${b.vis}"`)
  }
}
