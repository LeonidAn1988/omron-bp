import { chromium } from 'playwright'
const URL = 'http://127.0.0.1:4712/index.html'
const FROZEN = Date.UTC(2026, 7, 15, 7, 30)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', hasTouch: true, isMobile: true })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#root > *', { timeout: 20000 })
await page.waitForTimeout(400)
await page.evaluate(async ([now]) => {
  const H = 3600000, readings = []
  for (let i = 0; i < 40; i++) readings.push({ id: `bp-${i}`, kind: 'bp', ts: now - i * H * 8, user: 1, source: 'manual', sys: 128 + (i % 7), dia: 82 + (i % 4), bpm: 68 + (i % 5), ihb: false, mov: false })
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  await new Promise((res, rej) => { const tx = db.transaction(['readings','meta'],'readwrite'); tx.objectStore('readings').clear(); readings.forEach(r=>tx.objectStore('readings').put(r)); tx.objectStore('meta').put({onboarded:true},'settings'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
  db.close()
}, [FROZEN])
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(500)
await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
await page.waitForTimeout(600)
console.log(JSON.stringify(await page.evaluate(() => {
  const t = [...document.querySelectorAll('button[aria-label^="Удалить измерение"]')]
  const hist = [...document.querySelectorAll('.card')].find(c=>c.querySelector('h2')?.textContent?.includes('История'))
  return { docH: Math.round(document.documentElement.scrollHeight), rows: t.length,
    histTop: Math.round(hist.getBoundingClientRect().top+scrollY),
    trash10: Math.round(t[9].getBoundingClientRect().top+scrollY),
    trashLast: Math.round(t[t.length-1].getBoundingClientRect().top+scrollY) }
})))
// подтверждение перед удалением? ловим диалоги
let dialog = false
page.on('dialog', async (d) => { dialog = true; await d.dismiss() })
const btn = page.locator('button[aria-label^="Удалить измерение"]').nth(9)
const b0 = await btn.boundingBox()
await page.evaluate((y)=>window.scrollTo(0,y), b0.y - 450)
await page.waitForTimeout(300)
const bb = await btn.boundingBox()
await page.touchscreen.tap(bb.x+bb.width/2, bb.y+bb.height/2)
await page.waitForTimeout(700)
const after = await page.evaluate(() => ({
  rows: document.querySelectorAll('button[aria-label^="Удалить измерение"]').length,
  bannerHTML: (()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Вернуть'); return b? b.closest('.reveal').outerHTML.slice(0,400):null })(),
  liveRegions: [...document.querySelectorAll('[aria-live],[role="status"],[role="alert"]')].map(e=>({role:e.getAttribute('role'),live:e.getAttribute('aria-live'),txt:e.textContent.trim().slice(0,40),inert:e.closest('[inert]')!==null})),
}))
console.log('подтверждение (confirm-диалог):', dialog)
console.log('строк после тапа:', after.rows)
console.log('живые области на странице:', JSON.stringify(after.liveRegions, null, 1))
console.log('разметка баннера:', after.bannerHTML)
await browser.close()
