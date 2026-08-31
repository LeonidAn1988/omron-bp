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
const MEASURE = () => {
  const s = document.querySelector('.stats-strip')
  const rows = {}
  for (const c of s.children) { const r=c.getBoundingClientRect(); (rows[Math.round(r.top)] ||= []).push(c.querySelector('.tile__value').getBoundingClientRect().top) }
  let worst = 0
  for (const tops of Object.values(rows)) worst = Math.max(worst, Math.max(...tops)-Math.min(...tops))
  return { stripH: +s.getBoundingClientRect().height.toFixed(1),
           pageH: document.documentElement.scrollHeight,
           worstSpread: +worst.toFixed(1),
           cols: getComputedStyle(s).gridTemplateColumns.split(' ').filter(x=>x!=='0px').length }
}
const FIX = `.stats-strip .tile__label { min-height: calc(2 * var(--lh-base) * 1em) }`
const out = {}
for (const [scale, density] of [['normal','normal'], ['xlarge','roomy'], ['xlarge','normal']]) {
  for (const width of [320, 360, 390, 406, 430, 768, 1280]) {
    const { ctx, page } = await prep(width, scale, density)
    await go(page, { tab: 'Обзор' }); await page.waitForTimeout(300)
    const before = await page.evaluate(MEASURE)
    await page.addStyleTag({ content: FIX }); await page.waitForTimeout(200)
    const after = await page.evaluate(MEASURE)
    out[`${scale}/${density}@${width}`] = { cols: before.cols,
      spreadBefore: before.worstSpread, spreadAfter: after.worstSpread,
      stripBefore: before.stripH, stripAfter: after.stripH,
      addedStripPx: +(after.stripH - before.stripH).toFixed(1),
      addedPagePx: after.pageH - before.pageH }
    await ctx.close()
  }
}
console.log(JSON.stringify(out, null, 1))
await browser.close()
