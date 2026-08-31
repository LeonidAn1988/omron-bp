import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 360, height: 800 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
  colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true, isMobile: true,
})
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(900)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(600)
await go(page, { tab: 'Давление' })
await page.waitForTimeout(900)

const snap = () => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) } }
  const wl = [...document.querySelectorAll('form.card .wheel')].find(w => w.querySelector('.wheel__label').textContent.trim() === 'Верхнее')
  const box = r(wl.querySelector('.wheel__box'))
  const alert = r(document.querySelector('form.card [role=alert]'))
  const act = r(document.querySelector('form.card .form-actions'))
  const coveredPx = Math.max(0, Math.min(alert.bottom, act.bottom) - Math.max(alert.top, act.top))
  const belowFold = Math.max(0, alert.bottom - innerHeight)
  return { scrollY: Math.round(scrollY), sysWheel: box, alert, actions: act,
    alertCoveredPx: Math.round(coveredPx), alertCoveredPct: Math.round(100*coveredPx/alert.h),
    alertBelowFoldPx: Math.round(belowFold),
    alertReadablePx: Math.round(alert.h - coveredPx - belowFold),
    wheelOnScreen: box.top >= 0 && box.bottom <= innerHeight }
}

// прокручиваем вниз, барабан за экраном, жмём кнопку
await page.evaluate(() => {
  const wl = [...document.querySelectorAll('form.card .wheel')].find(w => w.querySelector('.wheel__label').textContent.trim() === 'Верхнее')
  window.scrollTo(0, scrollY + wl.querySelector('.wheel__box').getBoundingClientRect().bottom + 20)
})
await page.waitForTimeout(300)
await page.locator('form.card button[type=submit]').first().click()
await page.waitForTimeout(1200)
console.log('ДО правки (прокручено, барабан за экраном):')
console.log(JSON.stringify(await page.evaluate(snap), null, 2))
await page.screenshot({ path: `${OUT}/rfw3_scrolled_before.png` })

// применяем предложенную правку
await page.evaluate(() => {
  const wl = [...document.querySelectorAll('form.card .wheel')].find(w => w.querySelector('.wheel__label').textContent.trim() === 'Верхнее')
  const list = wl.querySelector('.wheel__list')
  list.focus()
  list.scrollIntoView({ block: 'center' })
})
await page.waitForTimeout(700)
console.log('ПОСЛЕ предложенной правки focus() + scrollIntoView({block:center}):')
console.log(JSON.stringify(await page.evaluate(snap), null, 2))
console.log('activeElement:', await page.evaluate(() => document.activeElement.className))
await page.screenshot({ path: `${OUT}/rfw3_scrolled_after.png` })
await browser.close()
