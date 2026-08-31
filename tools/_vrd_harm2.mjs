import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 3,
  hasTouch: true, isMobile: true,
})
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.textScale = 'xlarge'; cur.density = 'roomy'; cur.trackGlucose = true; cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
  localStorage.setItem('textScale', 'xlarge'); localStorage.setItem('density', 'roomy')
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(500)
await go(page, { tab: 'Приём' })
await page.waitForTimeout(500)

// 1. точная геометрия столкновения
const geo = await page.evaluate(() => {
  const out = []
  for (const li of document.querySelectorAll('.dose')) {
    const name = li.querySelector('.dose__name')
    const btn = li.querySelector(':scope > .btn')
    const auto = li.querySelector('.dose__auto')
    const tail = btn || auto
    if (!name || !tail) continue
    const n = name.getBoundingClientRect(), t = tail.getBoundingClientRect()
    // ширина последней буквы имени, чтобы понять «сколько символов съедено»
    const r = document.createRange()
    const tn = name.firstChild
    const glyphs = []
    for (let i = 0; i < tn.length; i++) {
      r.setStart(tn, i); r.setEnd(tn, i + 1)
      const g = r.getBoundingClientRect()
      glyphs.push({ ch: tn.data[i], l: +g.left.toFixed(1), r: +g.right.toFixed(1) })
    }
    const covered = glyphs.filter((g) => g.r > t.left + 1 && g.l < t.right)
    const partly = glyphs.filter((g) => g.r > t.left + 1 && g.l < t.left + 1)
    out.push({
      name: name.textContent, tail: btn ? 'кнопка Принял' : 'подпись «списывается само»',
      nameRight: +n.right.toFixed(1), tailLeft: +t.left.toFixed(1),
      xOverlap: +(n.right - t.left).toFixed(1),
      yOverlap: +(Math.min(n.bottom, t.bottom) - Math.max(n.top, t.top)).toFixed(1),
      coveredGlyphs: covered.map((g) => g.ch).join(''),
      partlyCovered: partly.map((g) => g.ch).join(''),
      totalGlyphs: glyphs.length,
    })
  }
  return out
})
console.log('=== геометрия столкновения ===')
console.log(JSON.stringify(geo, null, 1))

// 2. попадает ли тап в кнопку в зоне наложения
const hit = await page.evaluate(() => {
  const out = []
  for (const li of document.querySelectorAll('.dose')) {
    const btn = li.querySelector(':scope > .btn')
    const name = li.querySelector('.dose__name')
    if (!btn) continue
    const b = btn.getBoundingClientRect()
    const probe = (x, y) => { const e = document.elementFromPoint(x, y); return e ? (e.tagName + '.' + (e.className || '')) : 'null' }
    out.push({
      row: name.textContent,
      btnBox: { l: +b.left.toFixed(1), t: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) },
      leftEdge: probe(b.left + 2, b.top + b.height / 2),
      center: probe(b.left + b.width / 2, b.top + b.height / 2),
      topLeft: probe(b.left + 2, b.top + 2),
      inView: b.top >= 0 && b.bottom <= innerHeight,
    })
  }
  return out
})
console.log('=== попадание тапа ===')
console.log(JSON.stringify(hit, null, 1))

// 3. реальный клик по левому краю кнопки «Принял» в конфликтной строке
const before = await page.evaluate(() => [...document.querySelectorAll('.dose')].map((li) => ({
  n: li.querySelector('.dose__name').textContent, done: li.dataset.done === 'true',
})))
const loz = page.locator('.dose', { hasText: 'Лозартан' }).first()
await loz.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
const box = await loz.locator('.btn').boundingBox()
await page.mouse.click(box.x + 3, box.y + box.height / 2)   // самый левый край, где лежит буква «н»
await page.waitForTimeout(700)
const after = await page.evaluate(() => [...document.querySelectorAll('.dose')].map((li) => ({
  n: li.querySelector('.dose__name').textContent, done: li.dataset.done === 'true',
})))
console.log('=== клик в левый край кнопки (зона наложения) ===')
console.log('до :', JSON.stringify(before))
console.log('пос:', JSON.stringify(after))

await page.screenshot({ path: `${OUT}/_vrdh2_after_click.png`, fullPage: true })
await ctx.close()
await browser.close()
