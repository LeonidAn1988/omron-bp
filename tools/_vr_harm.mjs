import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 360, height: 800 },
  locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 3,
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
  cur.textScale = 'xlarge'; cur.trackGlucose = true; cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
  localStorage.setItem('textScale', 'xlarge')
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(600)
await go(page, { tool: 'Отчёт' })
await page.waitForTimeout(400)

const m = await page.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), w: +b.width.toFixed(1), t: +b.top.toFixed(1), h: +b.height.toFixed(1) } }
  const seg = document.querySelector('.segmented')
  const btns = seg ? [...seg.querySelectorAll('button')] : []
  const nav = document.querySelector('nav.tabs')
  const de = document.documentElement
  const last = btns[btns.length - 1]
  const lb = last.getBoundingClientRect()
  const visRight = Math.min(lb.right, innerWidth)
  const hitX = (lb.left + visRight) / 2
  const hitY = lb.top + lb.height / 2
  const hit = document.elementFromPoint(hitX, hitY)
  return {
    rootFont: getComputedStyle(de).fontSize,
    innerWidth,
    seg: r(seg),
    segDisplay: getComputedStyle(seg).display,
    btns: btns.map((b) => ({ t: b.textContent.trim(), pressed: b.getAttribute('aria-pressed'), ...r(b) })),
    docScrollW: de.scrollWidth, docClientW: de.clientWidth,
    bodyScrollW: document.body.scrollWidth,
    nav: r(nav), navPos: getComputedStyle(nav).position,
    lastBtnVisibleWidth: +(visRight - lb.left).toFixed(1),
    hitTag: hit ? hit.tagName + '/' + (hit.textContent || '').trim().slice(0, 20) : null,
    periodRow: [...document.querySelectorAll('.report-facts tr')].map((tr) => tr.textContent.trim()).find((t) => t.startsWith('Период')),
  }
})
console.log('=== ЭКРАН ОТЧЁТА, 360px, xlarge ===')
console.log(JSON.stringify(m, null, 2))

// клик по видимой части последней кнопки
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.segmented button')]
  const last = btns[btns.length - 1]
  const b = last.getBoundingClientRect()
  const x = (b.left + Math.min(b.right, innerWidth)) / 2
  const y = b.top + b.height / 2
  const el = document.elementFromPoint(x, y)
  if (el) el.click()
  return { x: +x.toFixed(1), y: +y.toFixed(1), tag: el ? el.tagName : null, text: el ? el.textContent.trim() : null }
})
await page.waitForTimeout(400)
const after = await page.evaluate(() => {
  const de = document.documentElement
  const nav = document.querySelector('nav.tabs')
  const b = nav.getBoundingClientRect()
  return {
    pressed: [...document.querySelectorAll('.segmented button')].map((x) => ({ t: x.textContent.trim(), p: x.getAttribute('aria-pressed') })),
    periodRow: [...document.querySelectorAll('.report-facts tr')].map((tr) => tr.textContent.trim()).find((t) => t.startsWith('Период')),
    docScrollW: de.scrollWidth, docClientW: de.clientWidth,
    nav: { l: +b.left.toFixed(1), r: +b.right.toFixed(1), w: +b.width.toFixed(1) },
  }
})
console.log('=== ПОСЛЕ КЛИКА ПО ОБРЕЗАННОЙ КНОПКЕ ===')
console.log(JSON.stringify({ clicked, after }, null, 2))

// горизонтальная прокрутка: уезжает ли нижняя навигация
const scrolled = await page.evaluate(() => {
  window.scrollTo(document.documentElement.scrollWidth, 0)
  const nav = document.querySelector('nav.tabs')
  const b = nav.getBoundingClientRect()
  const seg = document.querySelector('.segmented button:last-child').getBoundingClientRect()
  return { scrollX: window.scrollX, navLeft: +b.left.toFixed(1), navRight: +b.right.toFixed(1), navW: +b.width.toFixed(1), lastBtnRight: +seg.right.toFixed(1), innerWidth }
})
console.log('=== ПРОКРУТКА ВПРАВО ДО УПОРА ===')
console.log(JSON.stringify(scrolled, null, 2))
await page.screenshot({ path: `${OUT}/vr_harm_scrolled.png` })
await page.evaluate(() => window.scrollTo(0, 0))

// печать
await page.emulateMedia({ media: 'print' })
await page.waitForTimeout(300)
const print = await page.evaluate(() => {
  const seg = document.querySelector('.segmented')
  const de = document.documentElement
  return { segDisplay: seg ? getComputedStyle(seg).display : 'нет узла', docScrollW: de.scrollWidth, docClientW: de.clientWidth }
})
console.log('=== ПЕЧАТЬ (media: print) ===')
console.log(JSON.stringify(print, null, 2))
await page.emulateMedia({ media: 'screen' })

await ctx.close()
await browser.close()
