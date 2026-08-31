import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from './visual.mjs'

const URL = 'http://localhost:5233'
const browser = await chromium.launch()
const widths = [320, 360, 390]
const texts = [['Обычный','normal'], ['Крупный','large'], ['Очень крупный','xlarge']]
const dens = [['Плотно','compact'], ['Обычно','normal'], ['Просторно','roomy']]

const measure = () => {
  const h2 = [...document.querySelectorAll('.card h2')].find(x => x.textContent.trim() === 'Разделы')
  const card = h2.closest('.card')
  const stack = [...card.querySelectorAll('.stack')].find(s => s.querySelector('label.badge'))
  const cs = getComputedStyle(card)
  const cb = card.getBoundingClientRect()
  const contentRight = cb.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth)
  const labels = [...stack.querySelectorAll('label.badge')].map(l => {
    const note = l.querySelector('.fact__note')
    const span = l.querySelector('span')
    const r = l.getBoundingClientRect(), nr = note.getBoundingClientRect()
    const range = document.createRange(); range.selectNodeContents(note)
    const textRight = Math.max(...[...range.getClientRects()].map(x => x.right))
    return {
      t: span?.firstChild?.textContent?.trim(), note: note.textContent.trim(),
      ws: getComputedStyle(l).whiteSpace, wsNote: getComputedStyle(note).whiteSpace,
      labRight: +r.right.toFixed(2), noteRight: +nr.right.toFixed(2), textRight: +textRight.toFixed(2),
      labW: +r.width.toFixed(2),
    }
  })
  return {
    rootFs: getComputedStyle(document.documentElement).fontSize,
    spaceUnit: getComputedStyle(document.documentElement).getPropertyValue('--space-unit').trim(),
    cardRight: +cb.right.toFixed(2), contentRight: +contentRight.toFixed(2),
    stackScroll: stack.scrollWidth, stackClient: stack.clientWidth,
    cardScroll: card.scrollWidth, cardClient: card.clientWidth,
    bodyScroll: document.body.scrollWidth, docScroll: document.documentElement.scrollWidth,
    docClient: document.documentElement.clientWidth,
    labels,
  }
}

const rows = []
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await seed(page, FROZEN)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await go(page, { tool: 'Настройки' })
  for (const [tLabel, tKey] of texts) {
    for (const [dLabel, dKey] of dens) {
      await page.locator('[aria-label="Размер текста"] button', { hasText: new RegExp('^' + tLabel + '$') }).click()
      await page.waitForTimeout(120)
      await page.locator('[aria-label="Плотность вёрстки"] button', { hasText: new RegExp('^' + dLabel + '$') }).click()
      await page.waitForTimeout(250)
      const res = await page.evaluate(measure)
      rows.push({ w, text: tKey, d: dKey, ...res })
    }
  }
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(rows, null, 1))
