import { chromium } from 'playwright'
import { seedAll } from './_zz_seedlib.mjs'
const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-31T16:24:00').getTime()
const dir = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const dump = () => {
  const nl = (el) => { const r = document.createRange(); r.selectNodeContents(el)
    return [...new Set([...r.getClientRects()].map(x => Math.round(x.top)))].length }
  const t = (sel) => { const tb = document.querySelector(sel); if (!tb) return null
    return [...tb.querySelectorAll('tr')].map(tr => [...tr.children].map(c =>
      `${c.tagName}:${(c.childNodes[0]?.textContent||'').trim().slice(0,14)}=${nl(c)}л`).join('  ')) }
  return { drugs: t('.report-drugs'), adh: t('.report-adherence') }
}
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 375, height: 831 }, deviceScaleFactor: 3.25,
  locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1000)
await seedAll(page, FROZEN)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 })
await page.evaluate(() => { document.documentElement.setAttribute('data-theme','dark'); document.documentElement.setAttribute('data-text','xlarge'); document.documentElement.setAttribute('data-density','roomy') })
await page.locator('header button', { hasText: 'Отчёт' }).first().click()
await page.waitForTimeout(700)
const r = await page.evaluate(dump)
console.log('DRUGS:'); r.drugs.forEach(x => console.log('  ', x))
console.log('ADHERENCE:'); r.adh.forEach(x => console.log('  ', x))
for (const [sel, tag] of [['.report-drugs','drugs'],['.report-adherence','adh']]) {
  const el = await page.$(sel); await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(200)
  await el.screenshot({ path: `${dir}/dev375-${tag}.png` })
}
await browser.close()
