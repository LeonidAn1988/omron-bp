import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4477'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
for (const scale of ['normal','xlarge']) {
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 3, hasTouch: true, isMobile: true })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await seed(page, FROZEN)
await page.evaluate(async (s) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.textScale = s; cur.trackGlucose = true; cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close(); localStorage.setItem('textScale', s)
}, scale)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(500)
await go(page, { tool: 'Отчёт' })
await page.waitForTimeout(600)
// прокрутить так, чтобы карточка «по времени суток» была в кадре целиком
await page.evaluate(() => {
  const c = [...document.querySelectorAll('.card')].find(x => x.querySelector('h2')?.textContent.includes('времени суток'))
  window.scrollTo(0, c.getBoundingClientRect().top + scrollY - 90)
})
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/hv_view_${scale}.png` })
// кто распирает страницу вбок
const wide = await page.evaluate(() => {
  const cw = document.documentElement.clientWidth
  const bad = []
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.right > cw + 1 && r.width > 0) bad.push({ tag: el.tagName, cls: (el.className||'').toString().slice(0,40), right: Math.round(r.right), w: Math.round(r.width), txt: (el.textContent||'').trim().slice(0,30) })
  }
  return { cw, sw: document.documentElement.scrollWidth, bad: bad.slice(0, 8) }
})
console.log(scale, 'client', wide.cw, 'scroll', wide.sw, JSON.stringify(wide.bad))
await ctx.close()
}
await browser.close()
