/** Худшие пересечения глифа с текстом — с площадью и снимком. */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/refdel2'
mkdirSync(OUT, { recursive: true })

async function seed(page, now, scale, density) {
  await page.evaluate(async ([now, scale, density]) => {
    const DAY = 86400000
    const midnight = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime() }
    const day0 = midnight(now)
    const at = (o, h) => day0 + o * DAY + h * 3600000
    const combos = [[134,85],[128,82],[145,92],[165,105],[185,115],[118,76],[139,89],[132,88]]
    const readings = combos.map(([sys,dia],k) => ({
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

const cases = [
  [300, 'normal', 'normal'], [305, 'normal', 'normal'], [300, 'normal', 'compact'],
  [300, 'normal', 'roomy'], [375, 'normal', 'normal'],
]
const browser = await chromium.launch()
for (const [width, scale, density] of cases) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN, scale, density)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 30000 })
  await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
  await page.waitForTimeout(500)

  const worst = await page.evaluate(() => {
    const inter = (a, b) => {
      const l = Math.max(a.left, b.left), r = Math.min(a.right, b.right)
      const t = Math.max(a.top, b.top), bo = Math.min(a.bottom, b.bottom)
      return (r > l && bo > t) ? { w: +(r - l).toFixed(2), h: +(bo - t).toFixed(2) } : null
    }
    const rows = [...document.querySelectorAll('.readings-table tbody tr')].filter((tr) => !tr.dataset.editor)
    let best = null
    rows.forEach((tr, ri) => {
      const glyphs = [...tr.querySelectorAll("td[data-col='del'] svg")]
      for (const td of tr.querySelectorAll('td')) {
        if (td.dataset.col === 'del' || getComputedStyle(td).display === 'none') continue
        const rng = document.createRange(); rng.selectNodeContents(td)
        for (const b of rng.getClientRects()) {
          if (!b.width || !b.height) continue
          for (const g of glyphs) {
            const i = inter(g.getBoundingClientRect(), b)
            if (i && (!best || i.w * i.h > best.area)) best = { ri, col: td.dataset.col, txt: td.innerText.trim().replace(/\s+/g,' ').slice(0,40), who: g.closest('button').className, ...i, area: +(i.w * i.h).toFixed(1) }
          }
        }
      }
    })
    return best
  })

  const tag = `${width}-${scale}-${density}`
  console.log(`${tag.padEnd(24)} худшее пересечение глифа с текстовой строкой: ${worst ? `${worst.w}×${worst.h}px (площадь ${worst.area}) — «${worst.txt}» (${worst.col}, ${worst.who})` : 'нет'}`)
  if (worst) {
    const tr = page.locator('.readings-table tbody tr').nth(worst.ri)
    await tr.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await page.waitForTimeout(200)
    const bb = await tr.boundingBox()
    await page.screenshot({ path: `${OUT}/${tag}.png`, clip: { x: 0, y: Math.max(0, bb.y - 8), width, height: Math.min(240, bb.height + 20) } })
  }
  await ctx.close()
}
await browser.close()
