import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 320, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
  const cur = await new Promise((res) => { const tx=db.transaction('meta','readonly'); const q=tx.objectStore('meta').get('settings'); q.onsuccess=()=>res(q.result||{}) })
  cur.textScale='xlarge'; cur.trackGlucose=true; cur.onboarded=true
  await new Promise((res, rej) => { const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
  db.close(); localStorage.setItem('textScale','xlarge')
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(500)
await go(page, { tool: 'Отчёт' })
await page.waitForTimeout(500)
// кто вылезает за 320
const over = await page.evaluate(() => {
  const w = document.documentElement.clientWidth
  return [...document.querySelectorAll('*')].map(e => { const r = e.getBoundingClientRect(); return { t: e.tagName + '.' + (e.className && e.className.toString ? e.className.toString().slice(0,40) : ''), right: Math.round(r.right), w: Math.round(r.width) } })
    .filter(x => x.right > w + 1).slice(0, 12)
})
console.log('вылезает за 320px:', JSON.stringify(over, null, 1))

// печать в ширине A4
await page.setViewportSize({ width: 794, height: 1123 })
await page.emulateMedia({ media: 'print' })
await page.waitForTimeout(400)
const p = await page.evaluate(() => {
  const out = []
  ;[...document.querySelectorAll('.report-facts')].forEach((t) => {
    const h = t.closest('.card')?.querySelector('h2')
    ;[...t.querySelectorAll('tr')].forEach((tr) => {
      const tds = tr.querySelectorAll('td'); if (tds.length<2) return
      const lines = (el)=>{const r=document.createRange();r.selectNodeContents(el);return new Set([...r.getClientRects()].filter(x=>x.width>0.5&&x.height>0.5).map(x=>Math.round(x.top))).size}
      out.push({ card: h?h.textContent.trim():'?', label: tds[0].textContent.trim(),
        LW: Math.round(tds[0].getBoundingClientRect().width), VW: Math.round(tds[1].getBoundingClientRect().width),
        LL: lines(tds[0]), VL: lines(tds[1]) })
    })
  })
  return { root: getComputedStyle(document.documentElement).fontSize, body: getComputedStyle(document.body).fontSize, rows: out }
})
console.log('\n=== ПЕЧАТЬ на ширине A4 (794px), настройка экрана «очень крупный» ===')
console.log('root:', p.root, 'body:', p.body)
p.rows.forEach(r => console.log(`  [${r.card}] "${r.label}" подпись ${r.LW}px/${r.LL}стр · значение ${r.VW}px/${r.VL}стр`))
await page.pdf({ path: `${OUT}/vred_otchet_print.pdf`, format: 'A4', margin: { top:'14mm',bottom:'14mm',left:'14mm',right:'14mm' }, printBackground: false })
await page.emulateMedia({ media: 'screen' })
await ctx.close(); await browser.close()
