import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const URL = 'http://localhost:4291'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

for (const mode of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: mode })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs, main, .app', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(800)
  await seed(page, FROZEN)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.evaluate((m) => document.documentElement.setAttribute('data-theme', m), mode)
  await page.waitForTimeout(200)
  await go(page, { name: 'Отчёт врачу', tool: 'Отчёт' })
  for (const bgOn of [false, true]) {
    await page.pdf({ path: `${OUT}/pr_${mode}_bg${bgOn ? 'on' : 'off'}.pdf`, format: 'A4', printBackground: bgOn })
  }
  await ctx.close()
}
await browser.close()
console.log('ok')
