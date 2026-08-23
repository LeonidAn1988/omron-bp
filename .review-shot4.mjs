import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/obzorshots'
const URL = 'http://localhost:5199'
const browser = await chromium.launch()

for (const zoom of [100, 130, 160]) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 780 },
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
  await page.addStyleTag({ content: `html { font-size: ${zoom}% !important; }` })
  await go(page, { tab: 'Обзор' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/zoom-${zoom}.png`, fullPage: true })
  const res = await page.evaluate(() => {
    const doc = { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }
    const bad = []
    for (const el of document.querySelectorAll('.stack *')) {
      const cs = getComputedStyle(el)
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue
      if (el.scrollWidth > el.clientWidth + 1)
        bad.push({ cls: String(el.className).slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth, t: (el.textContent || '').trim().slice(0, 40) })
    }
    const leadTop = document.querySelector('.lead > .card')?.getBoundingClientRect().top
    return { doc, bad: bad.slice(0, 12), leadTop: Math.round(leadTop ?? -1) }
  })
  console.log(zoom, JSON.stringify(res, null, 1))
  await ctx.close()
}
await browser.close()
