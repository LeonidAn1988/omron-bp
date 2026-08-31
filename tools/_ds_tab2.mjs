import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4477'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(500)
await go(page, { tab: 'Приём' })
await page.waitForTimeout(600)

// порядок в DOM всех фокусируемых
const domOrder = await page.evaluate(() => {
  const sel = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])'
  return [...document.querySelectorAll(sel)].map((e,i) => ({ i: i+1, tag: e.tagName, role: e.getAttribute('role')||'', day: e.classList.contains('daystrip__day'), txt: (e.innerText||e.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim().slice(0,34) }))
})
console.log('ФОКУСИРУЕМЫХ В DOM:', domOrder.length)
console.log('НЕ-ДНИ:'); domOrder.filter(e=>!e.day).forEach(e=>console.log(' ', e.i, e.tag, e.role, '|', e.txt))
const days = domOrder.filter(e=>e.day)
console.log('ДНЕЙ:', days.length, 'позиции', days[0].i, '…', days[days.length-1].i)
const pr = domOrder.find(e=>/^Принял/.test(e.txt))
console.log('ПЕРВАЯ «Принял» В ПОРЯДКЕ ОБХОДА:', pr ? `${pr.i} (${pr.txt})` : 'нет')

// живой обход Tab с самого верха: ставим точку начала на h1 (не фокусируемый)
await page.evaluate(() => { const h1 = document.querySelector('h1'); h1.click() })
const stops = []
for (let i=0;i<120;i++){
  await page.keyboard.press('Tab')
  const d = await page.evaluate(() => { const a=document.activeElement; return a===document.body?{tag:'BODY'}:{tag:a.tagName, role:a.getAttribute('role')||'', day:a.classList.contains('daystrip__day'), txt:(a.innerText||a.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim().slice(0,34)} })
  if (d.tag==='BODY'){ console.log('ВЫХОД ИЗ ДОКУМЕНТА НА ШАГЕ', i+1); break }
  stops.push({i:i+1,...d})
}
console.log('ЖИВОЙ ОБХОД, остановок:', stops.length)
const ld = stops.filter(s=>s.day)
console.log('  дни:', ld.length, 'позиции', ld.length? `${ld[0].i}…${ld[ld.length-1].i}`:'-')
const lp = stops.find(s=>/^Принял/.test(s.txt))
console.log('  первая «Принял» на шаге:', lp? lp.i : 'нет')
stops.filter(s=>!s.day).forEach(s=>console.log('   ', s.i, s.tag, s.role, '|', s.txt))
await browser.close()
