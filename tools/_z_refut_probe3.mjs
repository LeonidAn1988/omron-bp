import { chromium } from 'playwright'
const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-31T16:25:00').getTime()
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const HEIGHT = Number(process.env.H ?? 794)
const TEXT = process.env.TEXT ?? 'xlarge'
const DENS = process.env.DENS ?? 'roomy'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 375, height: HEIGHT }, deviceScaleFactor: 3.25,
  isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', ignoreHTTPSErrors: true })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200)
await page.evaluate(async ([text, dens]) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction(['meta'], 'readonly'); const g = tx.objectStore('meta').get('settings'); g.onsuccess = () => res(g.result || {}); g.onerror = () => res({}) })
  await new Promise((res, rej) => { const tx = db.transaction(['meta'], 'readwrite')
    tx.objectStore('meta').put({ ...cur, trackGlucose: false, onboarded: true, seenIntro: true, theme: 'dark', textScale: text, density: dens }, 'settings')
    tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close() }, [TEXT, DENS])
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 }); await page.waitForTimeout(800)
await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click(); await page.waitForTimeout(500)

// выбрать значения на барабанах клавиатурой (spinbutton), не трогая раскладку
const wheels = page.locator('form.card .wheel__list')
await wheels.nth(0).focus(); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200)
await wheels.nth(1).focus(); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200)
console.log('значения:', await page.locator('form.card .wheel__list').nth(0).getAttribute('aria-valuetext'),
  '/', await page.locator('form.card .wheel__list').nth(1).getAttribute('aria-valuetext'))
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200)
await page.locator('form.card button[type=submit]').click()
await page.waitForTimeout(900)
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300)

const r = await page.evaluate(() => {
  const b = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { t: +r.top.toFixed(1), b: +r.bottom.toFixed(1) } }
  const form = document.querySelector('form.card')
  const panel = form.querySelector('.form-actions')
  const nav = document.querySelector('nav.tabs')
  const found = [...form.querySelectorAll('div,section')].filter((e) => /Записано:/.test(e.textContent || '') && e.children.length <= 3)
  const el = found[found.length - 1]
  const box = el ? b(el) : null
  let seen = null
  if (box) { const rr = el.getBoundingClientRect()
    const navTop = nav.getBoundingClientRect().top
    const lim = Math.min(innerHeight, navTop, panel.getBoundingClientRect().top > rr.top ? Infinity : panel.getBoundingClientRect().top)
    seen = +(Math.max(0, Math.min(rr.bottom, Math.min(innerHeight, navTop)) - Math.max(rr.top, 0))).toFixed(1)
    // сколько закрыто панелью
    const p = panel.getBoundingClientRect()
    const under = +(Math.max(0, Math.min(rr.bottom, p.bottom) - Math.max(rr.top, p.top))).toFixed(1)
    seen = { высотаБаннера: +rr.height.toFixed(1), видноДоНавигации: seen, подПанелью: under, навСверху: +navTop.toFixed(1) }
  }
  return { innerHeight, scrollY: Math.round(scrollY), panel: b(panel), навигация: b(nav),
    подтверждение: box, текст: el ? (el.textContent||'').trim().slice(0,60) : null, метрика: seen,
    scrollMax: Math.round(document.documentElement.scrollHeight - innerHeight) }
})
console.log(JSON.stringify(r, null, 1))
await page.screenshot({ path: `${OUT}/repro_saved.png` })
await browser.close()
