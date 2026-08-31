import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { FROZEN, seed } from './visual.mjs'

const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/harm3'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 375, height: 805 },
  deviceScaleFactor: 3.25, isMobile: true, hasTouch: true,
  locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark',
})
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction(['meta'],'readonly'); const g = tx.objectStore('meta').get('settings'); g.onsuccess = () => res(g.result || {}) })
  await new Promise((res, rej) => { const tx = db.transaction(['meta'],'readwrite'); tx.objectStore('meta').put({ ...cur, onboarded: true, textScale: 'xlarge', density: 'roomy' }, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 })
await page.waitForTimeout(600)
await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
await page.waitForTimeout(500)

// выбираем криз, чтобы был и badge, и предупреждение
await page.locator('.wheel--y').nth(0).locator('.wheel__item', { hasText: /^190$/ }).first().click()
await page.waitForTimeout(400)
await page.locator('.wheel--y').nth(1).locator('.wheel__item', { hasText: /^120$/ }).first().click()
await page.waitForTimeout(700)
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300)

const snap = async (tag) => {
  const r = await page.evaluate(() => {
    const form = document.querySelector('form.card')
    const panel = form.querySelector('.form-actions')
    const b = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)] }
    const sum = form.querySelector('details summary')
    const warn = [...form.querySelectorAll('[role="status"] .banner')][0]
    return {
      pos: getComputedStyle(panel).position,
      panel: b(panel), summary: b(sum), warn: b(warn),
      formBottom: Math.round(form.getBoundingClientRect().bottom),
      docH: Math.round(document.documentElement.scrollHeight),
      innerH: innerHeight,
      summaryHit: (() => { const r = sum.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); return e ? e.tagName + '.' + (typeof e.className === 'string' ? e.className : '') : null })(),
      btnVisible: (() => { const r = panel.querySelector('.btn').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })(),
      btnBox: b(panel.querySelector('.btn')),
    }
  })
  console.log(tag + ' → ' + JSON.stringify(r))
  return r
}

console.log('\n--- КАК СЕЙЧАС (sticky) ---')
await snap('sticky, scroll=0')
await page.screenshot({ path: `${OUT}/30-sticky.png` })

console.log('\n--- ПРЕДЛАГАЕМАЯ ПРАВКА: position: static для coarse ---')
await page.addStyleTag({ content: '.form-actions { position: static !important; }' })
await page.waitForTimeout(400)
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200)
await snap('static, scroll=0')
await page.screenshot({ path: `${OUT}/31-static.png` })

console.log('\n--- static: докуда надо прокрутить, чтобы увидеть кнопку ---')
for (const y of [0, 100, 200, 300]) {
  await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(200)
  await snap(`static, scroll=${y}`)
}
await page.screenshot({ path: `${OUT}/32-static-scrolled.png` })

await browser.close()
