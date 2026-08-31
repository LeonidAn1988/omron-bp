import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { FROZEN, seed } from './visual.mjs'

const URL = 'http://localhost:5199'
const OUT = process.env.OUT || '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/harm_sticky'
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

console.log('text=', await page.evaluate(() => document.documentElement.dataset.text),
            'density=', await page.evaluate(() => document.documentElement.dataset.density),
            'coarse=', await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
            'vw/vh=', await page.evaluate(() => innerWidth + 'x' + innerHeight))

await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
await page.waitForTimeout(500)
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(300)

const probe = async (tag) => {
  const r = await page.evaluate(() => {
    const form = document.querySelector('form.card')
    const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)] }
    const panel = form.querySelector('.form-actions')
    const sum = form.querySelector('details summary')
    const alertEl = form.querySelector('[role="alert"] .banner, [role="alert"]')
    const statusEl = form.querySelector('[role="status"][aria-live] .banner')
    // видимость текста: доля высоты элемента, не перекрытая панелью и внутри окна
    const cover = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect(); const p = panel.getBoundingClientRect()
      const visTop = Math.max(b.top, 0), visBot = Math.min(b.bottom, innerHeight)
      const inWin = Math.max(0, visBot - visTop)
      const ovTop = Math.max(visTop, p.top), ovBot = Math.min(visBot, p.bottom)
      const ov = Math.max(0, ovBot - ovTop)
      return { h: Math.round(b.height), inWindow: Math.round(inWin), underPanel: Math.round(ov), free: Math.round(inWin - ov) }
    }
    const hitAt = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      const x = Math.round(b.left + b.width/2), y = Math.round(b.top + b.height/2)
      if (y < 0 || y > innerHeight) return 'вне окна'
      const h = document.elementFromPoint(x, y)
      return h ? (h.tagName + '.' + (typeof h.className === 'string' ? h.className : '')) : null
    }
    const cs = getComputedStyle(panel)
    return {
      scrollY: Math.round(scrollY), scrollMax: Math.round(document.documentElement.scrollHeight - innerHeight),
      panel: box(panel), panelPos: cs.position, panelBottom: cs.bottom,
      summary: box(sum), summaryHit: hitAt(sum), summaryCover: cover(sum),
      alertText: alertEl ? alertEl.textContent.slice(0,80) : null, alertBox: box(alertEl), alertCover: cover(alertEl), alertHit: hitAt(alertEl),
      statusText: statusEl ? statusEl.textContent.slice(0,80) : null, statusBox: box(statusEl), statusCover: cover(statusEl),
      btnHit: hitAt(form.querySelector('.form-actions .btn')),
    }
  })
  console.log('\n### ' + tag); console.log(JSON.stringify(r, null, 1))
  return r
}

const count = () => page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const all = await new Promise((res) => { const tx = db.transaction(['readings'],'readonly'); const g = tx.objectStore('readings').getAll(); g.onsuccess = () => res(g.result || []) })
  db.close()
  return all.filter(x => x.source === 'manual').map(x => `${x.sys}/${x.dia}@${new Date(x.ts).toISOString().slice(0,16)}`)
})

console.log('\n=== 1. Исходный экран, scroll=0 ===')
await probe('scroll=0, форма пустая')
await page.screenshot({ path: `${OUT}/01-start.png` })

console.log('\n=== 2. Жмём «Добавить» с пустыми значениями (ошибка) ===')
await page.locator('.form-actions .btn').click()
await page.waitForTimeout(600)
await probe('после пустого сабмита')
await page.screenshot({ path: `${OUT}/02-error.png` })
console.log('прочитано вслух (role=alert текст целиком):', await page.evaluate(() => document.querySelector('form.card [role="alert"]')?.textContent))

console.log('\n=== 3. Выбираем 121/81 и сохраняем ===')
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200)
await page.locator('.wheel--y .wheel__item', { hasText: /^121$/ }).first().click()
await page.waitForTimeout(500)
await page.locator('.wheel--y').nth(1).locator('.wheel__item', { hasText: /^81$/ }).first().click()
await page.waitForTimeout(600)
console.log('до сохранения:', await count())
await page.locator('.form-actions .btn').click()
await page.waitForTimeout(900)
console.log('после сохранения:', await count())
const afterSave = await probe('после успешного сохранения, scroll не трогали')
await page.screenshot({ path: `${OUT}/03-saved.png` })

console.log('\n=== 4. Человек не увидел подтверждения и жмёт «Добавить» ещё раз ===')
await page.locator('.form-actions .btn').click()
await page.waitForTimeout(900)
console.log('записей после второго нажатия:', await count())
await probe('после второго нажатия')
await page.screenshot({ path: `${OUT}/04-second-press.png` })

console.log('\n=== 5. Достижимо ли подтверждение прокруткой ===')
await page.evaluate(() => window.scrollBy(0, 200)); await page.waitForTimeout(300)
await probe('scroll +200')
await page.screenshot({ path: `${OUT}/05-scrolled.png` })

await browser.close()
