import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const URL = 'http://localhost:5199'
const browser = await chromium.launch()
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
await go(page, { tab: 'Обзор' })
await page.waitForTimeout(300)

const audit = await page.evaluate(() => {
  const stack = document.querySelector('.stack')
  const small = []
  for (const el of stack.querySelectorAll('button, a, input, [role="button"], [tabindex]')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    if (r.height < 44 || r.width < 44)
      small.push({ tag: el.tagName, cls: el.className, text: (el.textContent || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) })
  }
  const pointerNonInteractive = []
  for (const el of stack.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if (cs.cursor === 'pointer' && !el.closest('button, a, label, [role="button"]'))
      pointerNonInteractive.push({ cls: el.className, text: (el.textContent || '').trim().slice(0, 30) })
  }
  // порядок блоков экрана
  const order = [...stack.children].map((el) => ({ cls: el.className, text: (el.textContent || '').trim().slice(0, 45) }))
  // заголовки
  const heads = [...stack.querySelectorAll('h1,h2,h3')].map((h) => `${h.tagName}: ${h.textContent}`)
  return { small, pointerNonInteractive, order, heads }
})
console.log(JSON.stringify(audit, null, 1))
await browser.close()
