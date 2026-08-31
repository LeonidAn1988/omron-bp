import { chromium } from 'playwright'
import { seed, go, settle, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4833'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/vred_h'
const browser = await chromium.launch()
const w = 360
const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 3, hasTouch: true, isMobile: true })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.textScale = 'xlarge'; cur.density = 'roomy'; cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
await go(page, { tab: 'Аптечка' })
const seg = page.locator('.segmented--fill[aria-label="Что показывать"]').first()
for (const label of ['Кончаются', 'Просрочены']) {
  await seg.locator('button', { hasText: new RegExp('^' + label + '$') }).first().click()
  await page.waitForTimeout(350)
  await seg.scrollIntoViewIfNeeded(); await page.waitForTimeout(200)
  const bb = await seg.boundingBox()
  await page.screenshot({ path: `${OUT}/press-${label}.png`, clip: { x: 0, y: Math.max(0, bb.y - 8), width: w, height: bb.height + 130 } })
}
// светлая тема тоже — вдруг перекрытие читается иначе
await ctx.close()
const ctx2 = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 3, hasTouch: true, isMobile: true })
const p2 = await ctx2.newPage()
await p2.clock.install({ time: new Date(FROZEN) })
await p2.goto(URL, { waitUntil: 'domcontentloaded' }); await p2.waitForTimeout(1200)
await seed(p2, FROZEN)
await p2.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.textScale = 'xlarge'; cur.density = 'roomy'; cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await p2.reload({ waitUntil: 'domcontentloaded' }); await settle(p2)
await go(p2, { tab: 'Аптечка' })
const s2 = p2.locator('.segmented--fill[aria-label="Что показывать"]').first()
await s2.scrollIntoViewIfNeeded(); await p2.waitForTimeout(200)
const b2 = await s2.boundingBox()
await p2.screenshot({ path: `${OUT}/light-filter.png`, clip: { x: 0, y: Math.max(0, b2.y - 8), width: w, height: b2.height + 16 } })
await ctx2.close()
await browser.close()
console.log('ok')
