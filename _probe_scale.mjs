import { chromium } from 'playwright'
import { seed, settle, go, SCREENS, FROZEN } from './tools/visual.mjs'

const URL = process.env.URL ?? 'http://localhost:4173'
const SCALE = Number(process.env.SCALE ?? 1.3)
const W = Number(process.env.W ?? 360)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: W, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await settle(page)
await seed(page, FROZEN)
await page.reload({ waitUntil: 'domcontentloaded' })
await settle(page)
await page.evaluate((s) => { document.documentElement.style.fontSize = (16 * s) + 'px' }, SCALE)
await page.waitForTimeout(300)

for (const screen of SCREENS) {
  try {
    await go(page, screen)
    const r = await page.evaluate(() => {
      const cw = document.documentElement.clientWidth
      const bad = []
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect()
        if (b.width === 0 || b.height === 0) continue
        const over = b.right - cw
        if (over > 1) {
          // ближайший предок со скроллом?
          let p = el.parentElement, scrollable = false
          while (p && p !== document.body) {
            const ov = getComputedStyle(p).overflowX
            if (ov === 'auto' || ov === 'scroll') { scrollable = true; break }
            p = p.parentElement
          }
          if (!scrollable) bad.push({ sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''), over: +over.toFixed(1), text: (el.textContent||'').trim().slice(0, 40) })
        }
      }
      return { cw, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 12) }
    })
    console.log(`\n### ${screen.name}  scrollW=${r.scrollW}/${r.cw}`)
    for (const b of r.bad) console.log(`   +${b.over}px  ${b.sel}  «${b.text}»`)
    if (!r.bad.length) console.log('   — всё внутри')
  } catch (e) { console.log(`### ${screen.name}: ПРОПУЩЕН ${e.message.split('\n')[0]}`) }
}
await browser.close()
