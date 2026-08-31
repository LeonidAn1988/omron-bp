import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/vrchart2'

const cases = [
  { tag: 'normal', scale: 'normal', w: 412 },
  { tag: 'xlarge', scale: 'xlarge', w: 412 },
  { tag: 'xlarge-360', scale: 'xlarge', w: 360 },
]

const browser = await chromium.launch()
for (const c of cases) {
  const ctx = await browser.newContext({
    viewport: { width: c.w, height: 1400 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 4,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  // добавим измерения во все четыре части суток, иначе столбик один и подписи
  // по X не сталкиваются просто потому, что их одна пара
  await page.evaluate(async (now) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const DAY = 86_400_000
    const d0 = new Date(now); d0.setHours(0,0,0,0)
    let id = 900000
    await new Promise((resolve, reject) => {
      const tx = db.transaction('readings', 'readwrite')
      const store = tx.objectStore('readings')
      for (let i = -20; i <= 0; i++) {
        for (const [h, sys, dia] of [[7, 138, 88], [14, 128, 82], [19, 133, 85], [1, 121, 76]]) {
          store.put({ id: 'x' + (id++), kind: 'bp', user: 1, source: 'manual', ihb: false, mov: false,
            ts: d0.getTime() + i * DAY + h * 3_600_000, sys: sys + (i % 5), dia: dia + (i % 3), bpm: 70 + (i % 7) })
        }
      }
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s; cur.trackGlucose = true; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
    localStorage.setItem('textScale', s)
  }, c.scale)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(400)
  await go(page, { tab: 'Обзор' })
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    for (const sel of ['nav.tabs', 'header', '.sticky', '.fab']) {
      for (const el of document.querySelectorAll(sel)) el.style.display = 'none'
    }
  })
  await page.waitForTimeout(200)

  const cards = await page.locator('.card').all()
  for (const card of cards) {
    const svg = card.locator('svg').first()
    if (await svg.count() === 0) continue
    const title = ((await card.locator('h2').first().textContent().catch(() => '')) || 'c').trim().replace(/[^\wА-Яа-яЁё]+/g, '_')
    await svg.screenshot({ path: `${OUT}/${c.tag}__${title}.png` })
  }
  await ctx.close()
}
await browser.close()
