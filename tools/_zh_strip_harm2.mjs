// Калибровка: сколько остановок Tab на других экранах, и обратный путь Shift+Tab.
import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from './visual.mjs'

const URL = process.env.URL ?? 'http://localhost:5343'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
const page = await context.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(600)
await seed(page, FROZEN)
await page.reload({ waitUntil: 'domcontentloaded' })
await settle(page)

const desc = () =>
  page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'body'
    return (
      (el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : el.tagName.toLowerCase()) +
      ' | ' +
      (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)
    )
  })

const out = {}
for (const tab of ['Обзор', 'Давление', 'Приём', 'Аптечка']) {
  await go(page, { tab })
  await page.waitForTimeout(500)
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  let n = 0
  for (let i = 0; i < 300; i++) {
    await page.keyboard.press('Tab')
    const d = await desc()
    if (d === 'body' && i > 5) break
    n++
  }
  out[tab] = n
}

// Обратный путь на «Приёме»: от начала документа Shift+Tab
await go(page, { tab: 'Приём' })
await page.waitForTimeout(500)
await page.locator('body').click({ position: { x: 5, y: 5 } })
const back = []
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('Shift+Tab')
  back.push(await desc())
}
console.log(JSON.stringify({ tabStopsPerScreen: out, shiftTabFromStart: back }, null, 2))
await browser.close()
