import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 360, height: 780 },
  locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2,
  isMobile: true, hasTouch: true,
})
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.onboarded = true; cur.textScale = 'normal'
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
  localStorage.setItem('textScale','normal')
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(600)

await go(page, { tab: 'Аптечка', click: 'Добавить препарат' })
await page.waitForTimeout(500)

// набираем ИНДАПАМИД
const input = page.locator('.suggest input').first()
await input.click()
await input.fill('Индапамид')
await page.waitForTimeout(900)

const opts = await page.locator('.suggest__item').allTextContents()
console.log('=== подсказки ===')
opts.slice(0,10).forEach((t,i)=>console.log(i, JSON.stringify(t.slice(0,90))))

// выбираем тот, у которого 4 варианта — ищем точное «ИНДАПАМИД»
const idx = opts.findIndex(t => t.trim().toUpperCase().startsWith('ИНДАПАМИД') && !t.includes('Реневал') && !t.includes('Фармасинтез') && !t.includes('ретард'))
console.log('берём индекс', idx)
await page.locator('.suggest__item').nth(idx < 0 ? 0 : idx).dispatchEvent('mousedown')
await page.waitForTimeout(600)

const m = await page.evaluate(() => {
  const de = document.documentElement
  const chips = [...document.querySelectorAll('.chip')]
  const box = (el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) } }
  const card = document.querySelector('.card')
  return {
    innerWidth,
    docScrollWidth: de.scrollWidth,
    docClientWidth: de.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    cardBox: card ? box(card) : null,
    rootFont: getComputedStyle(de).fontSize,
    chips: chips.map(c => ({ text: c.textContent.trim().slice(0,80), ...box(c), pressed: c.getAttribute('aria-pressed'),
       ws: getComputedStyle(c).whiteSpace, ov: getComputedStyle(c).overflow })),
    chipsBoxes: [...document.querySelectorAll('.chips')].map(c => ({ ...box(c), ov: getComputedStyle(c).overflowX, sw: c.scrollWidth, cw: c.clientWidth })),
    formEcho: [...document.querySelectorAll('.muted')].map(e=>e.textContent.trim()).filter(t=>t.startsWith('Форма:')),
  }
})
console.log('=== замеры ===')
console.log(JSON.stringify(m, null, 2))

await page.screenshot({ path: `${OUT}/h_chip_360.png`, fullPage: false })
// проверим горизонтальный скролл реально
const scrolled = await page.evaluate(() => { window.scrollTo(9999, 0); return { x: window.scrollX, docSW: document.documentElement.scrollWidth } })
console.log('после scrollTo(9999,0):', JSON.stringify(scrolled))
await page.screenshot({ path: `${OUT}/h_chip_360_scrolled.png` })
await ctx.close()
await browser.close()
