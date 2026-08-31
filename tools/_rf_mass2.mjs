import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = process.env.U || 'http://localhost:5199'
const browser = await chromium.launch()
const out = {}
for (const scale of ['normal','xlarge']) {
 for (const card of ['Конкор','Омега-3']) {
  const ctx = await browser.newContext({ viewport:{width:375,height:812}, locale:'ru-RU', timezoneId:'Europe/Moscow', colorScheme:'dark', deviceScaleFactor:2, ignoreHTTPSErrors:true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil:'domcontentloaded' })
  await page.waitForTimeout(1500)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res,rej)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
    const cur = await new Promise((res)=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>res(q.result||{})})
    cur.textScale=s; cur.onboarded=true; cur.theme='auto'
    await new Promise((res,rej)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})
    db.close(); if(s==='normal') localStorage.removeItem('textScale'); else localStorage.setItem('textScale',s)
  }, scale)
  await page.reload({ waitUntil:'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout:20000 })
  await page.waitForTimeout(600)
  await go(page, { tab:'Аптечка', open: card })
  await page.waitForTimeout(500)
  const m = await page.evaluate(() => {
    const rows=[...document.querySelectorAll('.detail__row')]
    const res = rows.map(r=>{
      const dt=r.querySelector('dt'), dd=r.querySelector('dd')
      if(!dt) return null
      const rr=dt.getBoundingClientRect()
      // измеряем реальную ширину текста
      const rng=document.createRange(); rng.selectNodeContents(dt)
      const tb=rng.getBoundingClientRect()
      const ddr=dd?dd.getBoundingClientRect():null
      return {
        label: dt.textContent.trim(),
        trackW: +rr.width.toFixed(2),
        textW: +tb.width.toFixed(2),
        overflow: +(tb.right-rr.right).toFixed(2),
        intoDd: ddr? +(tb.right-ddr.left).toFixed(2) : null,
        fs: getComputedStyle(dt).fontSize,
        ow: getComputedStyle(dt).overflowWrap,
        lines: +(tb.height/parseFloat(getComputedStyle(dt).lineHeight)).toFixed(2),
      }
    }).filter(Boolean)
    const facts=[...document.querySelectorAll('.facts')].map(f=>({
      cols:getComputedStyle(f).gridTemplateColumns,
      dts:[...f.querySelectorAll('dt')].map(d=>{
        const r=d.getBoundingClientRect(); const rng=document.createRange(); rng.selectNodeContents(d); const t=rng.getBoundingClientRect()
        return {t:d.textContent.trim(), w:+r.width.toFixed(1), tw:+t.width.toFixed(1), ov:+(t.right-r.right).toFixed(1), ow:getComputedStyle(d).overflowWrap}
      })
    }))
    return { root:getComputedStyle(document.documentElement).fontSize, rows:res, facts,
      rowCols: rows[0]? getComputedStyle(rows[0]).gridTemplateColumns : null }
  })
  out[scale+'/'+card]=m
  await ctx.close()
 }
}
await browser.close()
console.log(JSON.stringify(out,null,1))
