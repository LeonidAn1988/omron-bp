import { chromium } from 'playwright'
import { FROZEN, seed } from './visual.mjs'
const URL = 'http://localhost:5199'
const run = async (textScale, density, tag) => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 375, height: 805 }, deviceScaleFactor: 3.25, isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark' })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction(['meta'],'readonly'); const g = tx.objectStore('meta').get('settings'); g.onsuccess = () => res(g.result || {}) })
    await new Promise((res, rej) => { const tx = db.transaction(['meta'],'readwrite'); tx.objectStore('meta').put({ ...cur, onboarded: true, textScale: s.t, density: s.d }, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, { t: textScale, d: density })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 15000 }); await page.waitForTimeout(600)
  await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click(); await page.waitForTimeout(500)

  const geo = () => page.evaluate(() => {
    const form = document.querySelector('form.card'); const panel = form.querySelector('.form-actions')
    const b = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)] }
    const nav = b(document.querySelector('nav.tabs'))
    const al = form.querySelector('[role="alert"] .banner'); const st = form.querySelector('[role="status"][aria-live] .banner')
    const free = el => { if (!el) return null; const r = el.getBoundingClientRect(); const p = panel.getBoundingClientRect(); const n = document.querySelector('nav.tabs').getBoundingClientRect()
      let px = 0; for (let y = Math.ceil(r.top); y < r.bottom; y++) { if (y < 0 || y > innerHeight) continue; if (y >= p.top && y <= p.bottom) continue; if (y >= n.top && y <= n.bottom) continue; px++ } return px }
    return { pos: getComputedStyle(panel).position, panel: b(panel), nav, formBottom: Math.round(form.getBoundingClientRect().bottom),
      alert: b(al), alertH: al ? Math.round(al.getBoundingClientRect().height) : null, alertFree: free(al),
      saved: b(st), savedH: st ? Math.round(st.getBoundingClientRect().height) : null, savedFree: free(st) }
  })

  console.log(`\n===== ${tag} =====`)
  // 1. пустой сабмит → ошибка
  await page.locator('.form-actions .btn').click(); await page.waitForTimeout(700)
  await page.evaluate(() => window.scrollTo(0,0)); await page.waitForTimeout(200)
  console.log('sticky, есть ОШИБКА:', JSON.stringify(await geo()))
  await page.addStyleTag({ content: '.form-actions{position:static !important}' }); await page.waitForTimeout(300)
  await page.evaluate(() => window.scrollTo(0,0)); await page.waitForTimeout(200)
  console.log('static, есть ОШИБКА:', JSON.stringify(await geo()))
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('nav.tabs'); await page.waitForTimeout(600)
  await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click(); await page.waitForTimeout(500)
  // 2. успешная запись → подтверждение
  await page.locator('.wheel--y').nth(0).locator('.wheel__item', { hasText: /^121$/ }).first().click(); await page.waitForTimeout(400)
  await page.locator('.wheel--y').nth(1).locator('.wheel__item', { hasText: /^81$/ }).first().click(); await page.waitForTimeout(700)
  await page.locator('.form-actions .btn').click(); await page.waitForTimeout(900)
  await page.evaluate(() => window.scrollTo(0,0)); await page.waitForTimeout(200)
  console.log('sticky, есть ПОДТВЕРЖДЕНИЕ:', JSON.stringify(await geo()))
  await page.addStyleTag({ content: '.form-actions{position:static !important}' }); await page.waitForTimeout(300)
  await page.evaluate(() => window.scrollTo(0,0)); await page.waitForTimeout(200)
  console.log('static, есть ПОДТВЕРЖДЕНИЕ:', JSON.stringify(await geo()))
  await browser.close()
}
await run('xlarge', 'roomy', 'очень крупный + просторно')
await run('normal', 'cozy', 'обычный текст + плотно')
