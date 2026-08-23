import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/shots'
const URL = 'http://localhost:5199'

const widths = [
  { w: 360, name: '360' },
  { w: 320, name: '320' },
  { w: 1280, name: '1280' },
]

const browser = await chromium.launch()
for (const { w, name } of widths) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 900 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    colorScheme: 'dark',
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await seed(page, FROZEN)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.waitForTimeout(200)
  await go(page, { tab: 'Обзор' })
  await page.screenshot({ path: `${OUT}/obzor-${name}.png`, fullPage: true })

  // геометрия ключевых блоков
  const geo = await page.evaluate(() => {
    const pick = (sel) =>
      [...document.querySelectorAll(sel)].map((el) => {
        const r = el.getBoundingClientRect()
        return { sel, text: (el.textContent || '').trim().slice(0, 70), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      })
    const overflow = [...document.querySelectorAll('*')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto' && getComputedStyle(el).overflowX !== 'scroll')
      .map((el) => ({ cls: el.className, sw: el.scrollWidth, cw: el.clientWidth, text: (el.textContent||'').trim().slice(0,50) }))
    return {
      doc: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
      lead: pick('.lead > .card'),
      strip: pick('.stats-strip > div'),
      overflow,
    }
  })
  console.log(name, JSON.stringify(geo, null, 1))
  await ctx.close()
}
await browser.close()
