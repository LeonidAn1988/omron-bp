import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:5199'
const browser = await chromium.launch()
const cases = [[360,'small','normal'],[360,'normal','normal'],[393,'normal','normal'],[407,'normal','normal'],[407,'xlarge','roomy']]
for (const [w, scale, density] of cases) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, locale:'ru-RU', timezoneId:'Europe/Moscow', colorScheme:'dark', deviceScaleFactor:2, ignoreHTTPSErrors:true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1500)
  await seed(page, FROZEN)
  await page.evaluate(async ([s,d]) => {
    const db = await new Promise((res,rej)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
    const cur = await new Promise((res)=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>res(q.result||{})})
    cur.textScale=s; cur.density=d; cur.trackGlucose=true; cur.onboarded=true
    await new Promise((res,rej)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})
    db.close(); localStorage.setItem('textScale', s)
  }, [scale,density])
  await page.reload({ waitUntil:'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout:20000 }); await page.waitForTimeout(600)
  await go(page, { tool:'Настройки' }); await page.waitForTimeout(400)
  const m = await page.evaluate(() => [...document.querySelectorAll('.segmented--fill')].map(g => {
    const gr = g.getBoundingClientRect()
    return { label:g.getAttribute('aria-label'), gr:+gr.right.toFixed(1), gw:+gr.width.toFixed(1),
      b:[...g.querySelectorAll('button')].map(b=>{
        const br=b.getBoundingClientRect(); const rng=document.createRange(); rng.selectNodeContents(b)
        const rs=[...rng.getClientRects()]; const inkR=Math.max(...rs.map(r=>r.right))
        return { t:b.textContent.trim(), past:+(inkR-br.right).toFixed(1), pastGroup:+(inkR-gr.right).toFixed(1), lines:rs.length }
      }) }
  }))
  console.log('### w='+w+' '+scale+' '+density)
  for (const g of m) { console.log('  ['+g.label+'] w='+g.gw)
    for (const b of g.b) console.log('    '+JSON.stringify(b.t)+' lines='+b.lines+' pastBtn='+b.past+(b.past>0.5?' CLIP':'')+(b.pastGroup>0.5?' PAST_GROUP='+b.pastGroup:'')) }
  await ctx.close()
}
await browser.close()
