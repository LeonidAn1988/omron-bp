import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { FROZEN, seed } from './visual.mjs'

const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/harm2'
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
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300)

const look = async (tag) => {
  const r = await page.evaluate(() => {
    const form = document.querySelector('form.card')
    const panel = form.querySelector('.form-actions')
    const b = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)] }
    const badge = form.querySelector('.card__head .badge')
    const warnEl = [...form.querySelectorAll('[role="status"]')].map(x => x.querySelector('.banner')).filter(Boolean)
    const wheels = [...form.querySelectorAll('.wheel__item[data-selected="true"]')].map(el => ({
      v: el.textContent, pending: el.dataset.pending === 'true', color: getComputedStyle(el).color, top: Math.round(el.getBoundingClientRect().top)
    }))
    const nav = document.querySelector('nav.tabs')
    // счётчик истории
    const hist = [...document.querySelectorAll('.card__head')].find(h => h.textContent.includes('История давления'))
    return {
      scrollY: Math.round(scrollY),
      badge: badge ? { text: badge.textContent.trim(), box: b(badge), visible: b(badge)[1] < innerHeight && b(badge)[0] > 0 } : null,
      panel: b(panel), nav: b(nav),
      banners: warnEl.map(el => ({ text: el.textContent.slice(0, 70), box: b(el) })),
      wheels,
      histHead: hist ? { text: hist.textContent.replace(/\s+/g,' ').trim(), box: b(hist) } : null,
    }
  })
  console.log('\n### ' + tag + '\n' + JSON.stringify(r, null, 1))
  return r
}

console.log('=== КРИЗ: выбираем 190 / 120 ===')
await page.locator('.wheel--y').nth(0).locator('.wheel__item', { hasText: /^190$/ }).first().click()
await page.waitForTimeout(500)
await page.locator('.wheel--y').nth(1).locator('.wheel__item', { hasText: /^120$/ }).first().click()
await page.waitForTimeout(700)
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300)
await look('190/120, scroll=0 — где предупреждение о кризе')
await page.screenshot({ path: `${OUT}/10-crisis-top.png` })
await page.evaluate(() => window.scrollBy(0, 250)); await page.waitForTimeout(300)
await look('190/120, scroll +250')
await page.screenshot({ path: `${OUT}/11-crisis-scrolled.png` })

console.log('\n=== ЧТО МЕНЯЕТСЯ НА ЭКРАНЕ ПОСЛЕ СОХРАНЕНИЯ (верхняя половина) ===')
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300)
await look('ДО сохранения (190/120 выбраны)')
await page.screenshot({ path: `${OUT}/20-before-save.png`, clip: { x: 0, y: 0, width: 375, height: 700 } })
await page.locator('.form-actions .btn').click()
await page.waitForTimeout(1000)
await look('ПОСЛЕ сохранения')
await page.screenshot({ path: `${OUT}/21-after-save.png`, clip: { x: 0, y: 0, width: 375, height: 700 } })

console.log('\n=== насколько далеко «История давления» ===')
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200)
await look('после сохранения, scroll=0')

await browser.close()
