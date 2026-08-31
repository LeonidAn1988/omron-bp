import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from './visual.mjs'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
for (const [w, tL, dL, tag] of [[360,'Очень крупный','Просторно','360_xl_roomy'], [320,'Очень крупный','Просторно','320_xl_roomy']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto('http://localhost:5233', { waitUntil: 'domcontentloaded' })
  await seed(page, FROZEN); await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page); await go(page, { tool: 'Настройки' })
  await page.locator('[aria-label="Размер текста"] button', { hasText: new RegExp('^'+tL+'$') }).click()
  await page.waitForTimeout(120)
  await page.locator('[aria-label="Плотность вёрстки"] button', { hasText: new RegExp('^'+dL+'$') }).click()
  await page.waitForTimeout(300)
  await page.evaluate(() => window.scrollTo(0,0))
  const card = await page.evaluate(() => {
    const h2 = [...document.querySelectorAll('.card h2')].find(x => x.textContent.trim()==='Разделы')
    const r = h2.closest('.card').getBoundingClientRect()
    return { x: 0, y: Math.max(0, r.top-8), width: Math.min(window.innerWidth, r.right+40), height: r.height+16 }
  })
  await page.screenshot({ path: `${OUT}/_rfb_${tag}.png`, clip: card })
  await ctx.close()
}
await browser.close()
console.log('ok')
