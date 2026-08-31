/** Переключатель периода на графике — единственный --fill рядом с данными о здоровье. */
import { chromium } from 'playwright'
import { seed, go, settle, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4711'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/vrd2'
const browser = await chromium.launch()

for (const [w, sc, de] of [[320, 'xlarge', 'roomy'], [360, 'xlarge', 'roomy']]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    colorScheme: 'light', deviceScaleFactor: 3, hasTouch: true, isMobile: true,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async ([a, b]) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = a; cur.density = b; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, [sc, de])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await go(page, { tab: 'Давление' })
  const seg = page.locator('.segmented--fill[aria-label="Период"]').first()
  await seg.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  const bx = await seg.boundingBox()
  await page.screenshot({ path: `${OUT}/z-period-${w}-${sc}-${de}.png`, clip: { x: Math.max(0, bx.x - 8), y: bx.y - 8, width: Math.min(w, bx.width + 32), height: bx.height + 16 } })
  const m = await page.evaluate(() => {
    const s = document.querySelector('.segmented--fill[aria-label="Период"]')
    return [...s.querySelectorAll('button')].map((b) => {
      const bb = b.getBoundingClientRect()
      const r = document.createRange(); r.selectNodeContents(b)
      const rects = [...r.getClientRects()]
      return { t: b.textContent.trim(), w: +bb.width.toFixed(1), over: +(Math.max(...rects.map((x) => x.right)) - bb.right).toFixed(1) }
    })
  })
  console.log(w, sc, de, JSON.stringify(m))
  await ctx.close()
}
await browser.close()
