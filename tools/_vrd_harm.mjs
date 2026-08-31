import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()

const combos = [
  { w: 375, text: 'xlarge', density: 'roomy' },
  { w: 375, text: 'xlarge', density: 'compact' },
  { w: 375, text: 'normal', density: 'normal' },
]

for (const { w, text, density } of combos) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 812 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await seed(page, FROZEN)
  await page.evaluate(async ({ t, d }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = t; cur.density = d; cur.trackGlucose = true; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
    localStorage.setItem('textScale', t)
    if (d === 'normal') localStorage.removeItem('density'); else localStorage.setItem('density', d)
  }, { t: text, d: density })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(500)
  await go(page, { tab: 'Приём' })
  await page.waitForTimeout(500)

  const m = await page.evaluate(() => {
    const R = (el) => { const r = el.getBoundingClientRect(); return { l: +r.left.toFixed(1), r: +r.right.toFixed(1), w: +r.width.toFixed(1), t: +r.top.toFixed(1), b: +r.bottom.toFixed(1) } }
    const rows = [...document.querySelectorAll('.dose')].map((li) => {
      const time = li.querySelector('.dose__time')
      const body = li.querySelector('.dose__body')
      const name = li.querySelector('.dose__name')
      const btn = li.querySelector(':scope > .btn')
      const auto = li.querySelector('.dose__auto')
      const nb = name ? R(name) : null
      const bb = btn ? R(btn) : (auto ? R(auto) : null)
      // геометрическое пересечение имени с кнопкой/подписью
      let overlap = null
      if (nb && bb) {
        const ox = Math.min(nb.r, bb.r) - Math.max(nb.l, bb.l)
        const oy = Math.min(nb.b, bb.b) - Math.max(nb.t, bb.t)
        overlap = { x: +ox.toFixed(1), y: +oy.toFixed(1), real: ox > 0 && oy > 0 }
      }
      // что реально видно в точке центра имени
      let hitCenter = null, hitRightEdge = null
      if (nb) {
        const cy = (nb.t + nb.b) / 2
        const e1 = document.elementFromPoint((nb.l + nb.r) / 2, cy)
        const e2 = document.elementFromPoint(Math.min(nb.r - 2, innerWidth - 2), cy)
        hitCenter = e1 ? e1.className || e1.tagName : null
        hitRightEdge = e2 ? (e2.className || e2.tagName) : null
      }
      return {
        name: name ? name.textContent.trim() : null,
        rowBox: R(li),
        time: time ? R(time) : null,
        body: body ? R(body) : null,
        nameBox: nb,
        nameLines: name ? name.getClientRects().length : null,
        btnOrAuto: bb,
        which: btn ? 'btn' : (auto ? 'auto' : null),
        overlap,
        hitCenter, hitRightEdge,
        overflowPastBody: nb && body ? +(nb.r - R(body).r).toFixed(1) : null,
        clippedByAncestor: (() => {
          if (!name) return null
          let p = name.parentElement
          while (p && p !== document.body) {
            const cs = getComputedStyle(p)
            if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return p.className + ':' + cs.overflow
            p = p.parentElement
          }
          return 'none'
        })(),
      }
    })
    return {
      rootFont: getComputedStyle(document.documentElement).fontSize,
      docScrollW: document.documentElement.scrollWidth,
      innerW: innerWidth,
      pageHasHScroll: document.documentElement.scrollWidth > innerWidth,
      rows,
    }
  })
  console.log(`\n===== w=${375} text=${text} density=${density} =====`)
  console.log(JSON.stringify(m, null, 1))

  // снимок карточек с многими временами
  const cards = await page.locator('.card').all()
  for (let i = 0; i < cards.length; i++) {
    const has = await cards[i].locator('.dose__time').count()
    if (has > 0) {
      await cards[i].screenshot({ path: `${OUT}/_vrdh_${text}_${density}_card${i}.png` })
    }
  }
  await page.screenshot({ path: `${OUT}/_vrdh_${text}_${density}_full.png`, fullPage: true })
  await ctx.close()
}
await browser.close()
