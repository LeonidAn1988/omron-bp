import { chromium } from 'playwright'
const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-31T16:25:00').getTime()
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const HEIGHT = Number(process.env.H ?? 794)
const TEXT = process.env.TEXT ?? 'xlarge'
const DENS = process.env.DENS ?? 'roomy'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 375, height: HEIGHT }, deviceScaleFactor: 3.25,
  isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
  colorScheme: 'dark', ignoreHTTPSErrors: true,
})
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await page.evaluate(async ([text, dens]) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction(['meta'], 'readonly'); const g = tx.objectStore('meta').get('settings'); g.onsuccess = () => res(g.result || {}); g.onerror = () => res({}) })
  await new Promise((res, rej) => { const tx = db.transaction(['meta'], 'readwrite')
    tx.objectStore('meta').put({ ...cur, trackGlucose: false, onboarded: true, seenIntro: true, theme: 'dark', textScale: text, density: dens }, 'settings')
    tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
}, [TEXT, DENS])
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 })
await page.waitForTimeout(800)
await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
await page.waitForTimeout(500)
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(300)

const R = () => page.evaluate(() => {
  const b = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { t: +r.top.toFixed(1), b: +r.bottom.toFixed(1) } }
  const form = document.querySelector('form.card')
  const panel = form.querySelector('.form-actions')
  const banners = [...form.querySelectorAll('.banner, [role="alert"], [role="status"]')]
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.height === 0) return 'скрыт'
    const x = Math.round(r.left + r.width/2)
    const probe = []
    for (const yy of [r.top+4, (r.top+r.bottom)/2, r.bottom-4]) {
      if (yy < 0 || yy > innerHeight) { probe.push('вне'); continue }
      const el2 = document.elementFromPoint(x, Math.round(yy))
      probe.push(el2 ? (el === el2 || el.contains(el2) || el2.contains(el) ? 'видно' : 'закрыто:' + el2.tagName.toLowerCase()) : '?')
    }
    return probe.join('/')
  }
  return { scrollY: Math.round(scrollY), innerHeight, panel: b(panel),
    banners: banners.map((el) => ({ txt: (el.textContent||'').trim().slice(0, 46), box: b(el), vis: vis(el) })) }
})

// 1. Ошибка: очистить верхнее и нажать «Добавить»
await page.evaluate(() => window.scrollTo(0, 0))
console.log('=== ДО ===', JSON.stringify(await R()))

// сбросить значение верхнего давления — снять выбор барабана нельзя, поэтому
// пишем прямо в скрытый input, если он есть; иначе жмём с пустым
const cleared = await page.evaluate(() => {
  const inp = document.querySelector('form.card input')
  return inp ? { tag: inp.tagName, type: inp.type, role: inp.getAttribute('role'), val: inp.value } : null
})
console.log('первый input формы:', JSON.stringify(cleared))

await page.locator('form.card button[type=submit]').click()
await page.waitForTimeout(700)
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200)
console.log('=== ПОСЛЕ НАЖАТИЯ ===', JSON.stringify(await R(), null, 1))
await page.screenshot({ path: `${OUT}/repro_after_submit.png` })
await browser.close()
