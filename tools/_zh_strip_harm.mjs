// Проверка находки про ленту дней: сколько остановок Tab, что делают стрелки,
// какие есть обходные пути (заголовки, ориентиры) на экране «Приём».
import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from './visual.mjs'

const URL = process.env.URL ?? 'http://localhost:5343'

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 900 },
  locale: 'ru-RU',
  timezoneId: 'Europe/Moscow',
})
const page = await context.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(600)
await seed(page, FROZEN)
await page.reload({ waitUntil: 'domcontentloaded' })
await settle(page)
await go(page, { tab: 'Приём' })
await page.waitForTimeout(600)

// 1. Сколько кнопок в ленте и какова структура заголовков/ориентиров
const structure = await page.evaluate(() => {
  const strip = document.querySelector('.daystrip')
  const headings = [...document.querySelectorAll('h1,h2,h3')]
    .filter((h) => h.offsetParent !== null || h.getClientRects().length)
    .map((h) => `${h.tagName}: ${h.textContent.trim().slice(0, 40)}`)
  const landmarks = [...document.querySelectorAll('main,nav,header,footer,[role=main],[role=navigation],[role=banner]')].map(
    (n) => `${n.tagName.toLowerCase()}${n.getAttribute('aria-label') ? ' «' + n.getAttribute('aria-label') + '»' : ''}`,
  )
  return {
    stripDays: strip ? strip.querySelectorAll('.daystrip__day').length : null,
    stripRole: strip ? strip.getAttribute('role') : null,
    stripOverflow: strip ? getComputedStyle(strip).overflowX : null,
    headings,
    landmarks,
  }
})

// 2. Полный обход Tab: считаем остановки и запоминаем, где лента и где «Принял»
await page.evaluate(() => window.scrollTo(0, 0))
await page.locator('body').click({ position: { x: 5, y: 5 } })
const order = []
for (let i = 0; i < 130; i++) {
  await page.keyboard.press('Tab')
  const info = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return { tag: 'body' }
    return {
      tag: el.tagName.toLowerCase(),
      cls: el.className && typeof el.className === 'string' ? el.className : '',
      role: el.getAttribute('role'),
      text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30),
    }
  })
  order.push(info)
  if (info.tag === 'body' && i > 5) break
}
const stripIdx = order.map((o, i) => ((o.cls || "").includes('daystrip__day') ? i + 1 : -1)).filter((i) => i > 0)
const prinyalIdx = order.findIndex((o) => (o.text || "") === "Принял") + 1
const prinyalVseIdx = order.findIndex((o) => (o.text || "").startsWith('Принял всё')) + 1

// 3. Что делают стрелки на выбранном дне
await page.evaluate(() => {
  const sel = document.querySelector('.daystrip__day[aria-selected="true"]')
  sel.focus()
})
const before = await page.evaluate(() => ({
  scroll: Math.round(document.querySelector('.daystrip').scrollLeft),
  focus: document.activeElement.innerText.replace(/\s+/g, ' ').trim(),
  selected: document.querySelector('.daystrip__day[aria-selected="true"]').innerText.replace(/\s+/g, ' ').trim(),
  h2: document.querySelector('.intake__head h2').textContent,
}))
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(400)
const afterRight = await page.evaluate(() => ({
  scroll: Math.round(document.querySelector('.daystrip').scrollLeft),
  focus: document.activeElement.innerText.replace(/\s+/g, ' ').trim(),
  selected: document.querySelector('.daystrip__day[aria-selected="true"]').innerText.replace(/\s+/g, ' ').trim(),
  h2: document.querySelector('.intake__head h2').textContent,
}))
await page.keyboard.press('ArrowRight')
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(400)
const after3 = await page.evaluate(() => ({
  scroll: Math.round(document.querySelector('.daystrip').scrollLeft),
  focus: document.activeElement.innerText.replace(/\s+/g, ' ').trim(),
}))

// 4. Shift+Tab от нижней навигации: короткий путь назад?
// и Tab из последней кнопки ленты
console.log(JSON.stringify({ structure, totalStops: order.length, stripStops: [stripIdx[0], stripIdx[stripIdx.length - 1]], stripCount: stripIdx.length, prinyalIdx, prinyalVseIdx, firstStops: order.slice(0, 10).map((o) => o.text || o.tag), before, afterRight, after3 }, null, 2))

await browser.close()
