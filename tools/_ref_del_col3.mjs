/** Полный перебор: пересекается ли ВИДИМЫЙ глиф кнопки с ВИДИМЫМ текстом строки. */
import { chromium } from 'playwright'

const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()

async function seed(page, now, scale, density) {
  await page.evaluate(async ([now, scale, density]) => {
    const DAY = 86400000
    const midnight = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime() }
    const day0 = midnight(now)
    const at = (o, h) => day0 + o * DAY + h * 3600000
    const readings = []
    const combos = [[134,85],[128,82],[145,92],[165,105],[185,115],[118,76],[139,89],[132,88]]
    combos.forEach(([sys,dia],k) => readings.push({
      id: `bpx-${k}`, kind: 'bp', ts: at(-k, 8) + 600000, user: 1, source: 'manual',
      sys, dia, bpm: 72, ihb: k % 3 === 0, mov: k % 4 === 0, arm: k % 2 ? 'left' : 'right',
      note: k === 1 ? 'после прогулки' : undefined,
    }))
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    await new Promise((res, rej) => {
      const tx = db.transaction(['readings', 'meta'], 'readwrite')
      readings.forEach((r) => tx.objectStore('readings').put(r))
      tx.objectStore('meta').put({ onboarded: true, textScale: scale, density }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, [now, scale, density])
}

const browser = await chromium.launch()
const findings = []
for (const width of [320, 360, 375, 390, 412, 430, 640, 900]) {
  for (const scale of ['normal', 'large', 'xlarge']) {
    for (const density of ['compact', 'normal', 'roomy']) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', hasTouch: true, isMobile: true, deviceScaleFactor: 1 })
      const page = await ctx.newPage()
      await page.clock.install({ time: new Date(FROZEN) })
      await page.goto(URL, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(900)
      await seed(page, FROZEN, scale, density)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector('nav.tabs', { timeout: 20000 })
      await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
      await page.waitForTimeout(400)

      const r = await page.evaluate(() => {
        const inter = (a, b) => {
          const l = Math.max(a.left, b.left), r = Math.min(a.right, b.right)
          const t = Math.max(a.top, b.top), bo = Math.min(a.bottom, b.bottom)
          return (r > l && bo > t) ? { w: +(r - l).toFixed(1), h: +(bo - t).toFixed(1) } : null
        }
        const bad = []
        let rowsSeen = 0
        const rows = [...document.querySelectorAll('.readings-table tbody tr')].filter((tr) => !tr.dataset.editor)
        for (const tr of rows) {
          rowsSeen++
          const glyphs = [...tr.querySelectorAll("td[data-col='del'] svg")].map((s) => ({ el: s, box: s.getBoundingClientRect(), who: s.closest('button').className }))
          if (!glyphs.length) continue
          for (const td of tr.querySelectorAll('td')) {
            if (td.dataset.col === 'del') continue
            if (getComputedStyle(td).display === 'none') continue
            const rng = document.createRange(); rng.selectNodeContents(td)
            for (const b of rng.getClientRects()) {
              if (b.width === 0 || b.height === 0) continue
              for (const g of glyphs) {
                const i = inter(g.box, b)
                if (i) bad.push({ col: td.dataset.col, txt: td.innerText.trim().replace(/\s+/g,' ').slice(0,30), who: g.who, i, glyph: { l: +g.box.left.toFixed(1), r: +g.box.right.toFixed(1), t: +g.box.top.toFixed(1), b: +g.box.bottom.toFixed(1) }, rect: { l: +b.left.toFixed(1), r: +b.right.toFixed(1), t: +b.top.toFixed(1), b: +b.bottom.toFixed(1) } })
              }
            }
          }
        }
        // отдельно: перехватывает ли кнопка нажатие по хвосту подписи категории
        let steal = null
        for (const tr of rows) {
          const badge = tr.querySelector("td[data-col='cat'] .badge")
          if (!badge) continue
          const b = badge.getBoundingClientRect()
          if (b.top < 0 || b.bottom > innerHeight) continue
          const el = document.elementFromPoint(b.right - 2, (b.top + b.bottom) / 2)
          if (el && el.closest && el.closest("td[data-col='del']")) { steal = { cat: badge.innerText.trim().replace(/\s+/g,' '), at: +(b.right - 2).toFixed(1) }; break }
        }
        const isList = getComputedStyle(rows[0]).display === 'flex'
        return { rowsSeen, bad, steal, isList, docOverflow: document.documentElement.scrollWidth > innerWidth }
      })

      const tag = `${width}px / ${scale} / ${density}`
      const line = `${tag.padEnd(28)} строк:${String(r.rowsSeen).padStart(2)} список:${r.isList ? 'да' : 'нет'} гориз.вылет:${r.docOverflow ? 'ДА' : 'нет'} наложений глифа на текст: ${r.bad.length}${r.steal ? '  перехват нажатия по «' + r.steal.cat + '»' : ''}`
      console.log(line)
      if (r.bad.length) { findings.push({ tag, bad: r.bad.slice(0, 4) }) }
      await ctx.close()
    }
  }
}
console.log('\n===== случаи с настоящим наложением =====')
console.log(findings.length ? JSON.stringify(findings, null, 1) : 'нет ни одного')
await browser.close()
