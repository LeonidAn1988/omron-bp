import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = process.env.U || 'http://localhost:5199'
const browser = await chromium.launch()
const out = {}
for (const w of [320,360,375,390,414]) {
  const ctx = await browser.newContext({ viewport:{width:w,height:812}, locale:'ru-RU', timezoneId:'Europe/Moscow', colorScheme:'dark', deviceScaleFactor:2, ignoreHTTPSErrors:true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil:'domcontentloaded' })
  await page.waitForTimeout(1400)
  await seed(page, FROZEN)
  await page.evaluate(async () => {
    const db = await new Promise((res,rej)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
    const cur = await new Promise((res)=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>res(q.result||{})})
    cur.textScale='xlarge'; cur.onboarded=true; cur.theme='auto'
    await new Promise((res,rej)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})
    db.close(); localStorage.setItem('textScale','xlarge')
  })
  await page.reload({ waitUntil:'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout:20000 })
  await page.waitForTimeout(600)
  await go(page, { tab:'Аптечка', open:'Конкор' })
  await page.waitForTimeout(500)
  const m = await page.evaluate(() => {
    const rows=[...document.querySelectorAll('.detail__row')]
    const r = rows.find(x=>x.querySelector('dt')?.textContent.trim()==='Производитель')
    if(!r) return {err:'no row'}
    const dt=r.querySelector('dt'), dd=r.querySelector('dd')
    const rr=dt.getBoundingClientRect(), ddr=dd.getBoundingClientRect()
    const rng=document.createRange(); rng.selectNodeContents(dt); const tb=rng.getBoundingClientRect()
    // где реально начинается текст значения
    const rng2=document.createRange(); rng2.selectNodeContents(dd); const tb2=rng2.getBoundingClientRect()
    return {
      cols: getComputedStyle(r).gridTemplateColumns, gap: getComputedStyle(r).columnGap,
      trackW:+rr.width.toFixed(2), textW:+tb.width.toFixed(2),
      pastTrack:+(tb.right-rr.right).toFixed(2),
      intoDdBox:+(tb.right-ddr.left).toFixed(2),
      intoDdText:+(tb.right-tb2.left).toFixed(2),
      rowClips: getComputedStyle(r).overflow,
      cardClips: getComputedStyle(r.closest('.card')||document.body).overflow,
    }
  })
  out['w'+w]=m
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(out,null,1))
