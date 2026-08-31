// Точный замер: что делают стрелки, когда фокус на кнопке дня.
import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from './visual.mjs'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
const page = await context.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(process.env.URL ?? 'http://localhost:5343', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(600)
await seed(page, FROZEN)
await page.reload({ waitUntil: 'domcontentloaded' })
await settle(page)
await go(page, { tab: 'Приём' })
await page.waitForTimeout(600)
await page.evaluate(() => document.querySelector('.daystrip__day[aria-selected="true"]').focus())
const read = () => page.evaluate(() => {
  const s = document.querySelector('.daystrip')
  return { scrollLeft: Math.round(s.scrollLeft), max: Math.round(s.scrollWidth - s.clientWidth), focus: document.activeElement.innerText.replace(/\s+/g,' ').trim() }
})
const log = [{ step: 'старт', ...(await read()) }]
for (const key of ['ArrowRight','ArrowRight','ArrowRight','ArrowLeft','ArrowLeft']) {
  await page.keyboard.press(key)
  await page.waitForTimeout(500)
  log.push({ step: key, ...(await read()) })
}
console.log(JSON.stringify(log, null, 2))
await browser.close()
