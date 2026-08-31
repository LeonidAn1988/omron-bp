/** Какая CSS-ширина у снимка с телефона: сверяем доли кнопки «Добавить». */
import { chromium } from 'playwright'
const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()
const browser = await chromium.launch()
for (const scale of ['normal', 'xlarge']) {
  for (const width of [340, 360, 375, 390, 400, 407, 412, 430]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', hasTouch: true, isMobile: true })
    const page = await ctx.newPage()
    await page.clock.install({ time: new Date(FROZEN) })
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(900)
    await page.evaluate(async (s) => {
      const db = await new Promise((res) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result) })
      await new Promise((res) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ onboarded: true, textScale: s, density: 'normal' }, 'settings'); tx.oncomplete = res })
      db.close()
    }, scale)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('nav.tabs', { timeout: 20000 })
    await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
    await page.waitForTimeout(400)
    const m = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Добавить')
      const r = b.getBoundingClientRect()
      const h1 = document.querySelector('.topbar h1') || document.querySelector('h1')
      const hr = h1.getBoundingClientRect()
      return { l: +(r.left / innerWidth).toFixed(4), w: +(r.width / innerWidth).toFixed(4), h1l: +(hr.left / innerWidth).toFixed(4) }
    })
    console.log(`${scale.padEnd(7)} ${String(width).padStart(3)}px  «Добавить» left=${m.l} width=${m.w}   h1 left=${m.h1l}`)
    await ctx.close()
  }
}
console.log('\nсо снимка ek4  (обычный):      left≈0.0874  width≈0.8254   h1 left≈0.0376')
console.log('со снимка ek4k (очень крупный): left≈0.1095  width≈0.7810   h1 left≈0.0465')
await browser.close()
