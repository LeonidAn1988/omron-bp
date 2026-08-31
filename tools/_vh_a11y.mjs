import { chromium } from 'playwright'
import { seed, go, settle, FROZEN, SCREENS } from './visual.mjs'
const URL = 'http://localhost:4833'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 360, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 3, hasTouch: true, isMobile: true })
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
// доступное имя кнопок фильтра
const names = []
for (const t of ['Все', 'Кончаются', 'Просрочены']) {
  const l = page.locator('.segmented--fill[aria-label="Что показывать"] button', { hasText: new RegExp('^' + t + '$') }).first()
  names.push({ text: (await l.textContent()).trim(), aria: await l.getAttribute('aria-label'), role: await l.evaluate((e)=>e.tagName), pressed: await l.getAttribute('aria-pressed') })
}
console.log('ДОСТУПНЫЕ ИМЕНА:', JSON.stringify(names))

// обходим все экраны: где-нибудь текст уезжает за вьюпорт?
const CLIP = () => {
  const vw = document.documentElement.clientWidth; const bad = []
  const walk = (n) => {
    if (n.nodeType === 3 && n.textContent.trim()) {
      const rg = document.createRange(); rg.selectNodeContents(n)
      for (const r of rg.getClientRects()) if (r.width > 0 && r.right > vw + 0.5) bad.push({ t: n.textContent.trim().slice(0, 30), over: +(r.right - vw).toFixed(1) })
    } else n.childNodes?.forEach(walk)
  }
  walk(document.body)
  return { bad, scrollsX: document.documentElement.scrollWidth > vw + 1, sw: document.documentElement.scrollWidth, cw: vw }
}
for (const s of SCREENS) {
  try { await go(page, s); await page.waitForTimeout(350); const r = await page.evaluate(CLIP); console.log(s.name, '| scrollsX', r.scrollsX, r.sw + '/' + r.cw, '| обрезано:', JSON.stringify(r.bad)) } catch (e) { console.log(s.name, 'ERR', String(e).split('\n')[0].slice(0, 70)) }
}
await browser.close()
