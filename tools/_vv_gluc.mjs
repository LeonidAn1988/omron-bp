import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = 'http://localhost:4477'
const browser = await chromium.launch()
async function prep(width, scale, density) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200); await seed(page, FROZEN)
  await page.evaluate(async ([s, d]) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp',3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
    const cur = await new Promise((res)=>{ const tx=db.transaction('meta','readonly'); const q=tx.objectStore('meta').get('settings'); q.onsuccess=()=>res(q.result||{}) })
    cur.textScale = s; cur.density = d; cur.onboarded = true
    await new Promise((res,rej)=>{ const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
    db.close()
  }, [scale, density])
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  return { ctx, page }
}
const M = () => {
  const all = [...document.querySelectorAll('.stats-strip')]
  return all.map((s) => {
    const rows = {}
    for (const c of s.children) { const r=c.getBoundingClientRect(); (rows[Math.round(r.top)] ||= []).push({ l:c.querySelector('.tile__label').textContent.trim(), t:c.querySelector('.tile__value').getBoundingClientRect().top }) }
    return Object.entries(rows).map(([y,cs]) => ({ y, spread: +(Math.max(...cs.map(c=>c.t))-Math.min(...cs.map(c=>c.t))).toFixed(1), cells: cs.map(c=>c.l) }))
  })
}
const out = {}
for (const [scale, density] of [['normal','normal'], ['xlarge','roomy'], ['xlarge','normal']]) {
  for (const width of [320, 360, 390, 406, 430]) {
    const { ctx, page } = await prep(width, scale, density)
    await go(page, { tab: 'Обзор' }); await page.waitForTimeout(300)
    out[`${scale}/${density}@${width}`] = await page.evaluate(M)
    await ctx.close()
  }
}
console.log(JSON.stringify(out))
await browser.close()
