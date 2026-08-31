import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL='http://localhost:4321'
const OUT='/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const b = await chromium.launch()
for (const scale of ['normal','xlarge']) {
  const ctx = await b.newContext({ viewport:{width:390,height:900}, locale:'ru-RU', timezoneId:'Europe/Moscow', colorScheme:'dark', deviceScaleFactor:2 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async (s)=>{ const db=await new Promise((r,j)=>{const q=indexedDB.open('omron-bp',3);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})
    const cur=await new Promise((r)=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>r(q.result||{})})
    cur.textScale=s;cur.trackGlucose=true;cur.onboarded=true
    await new Promise((r,j)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=r;tx.onerror=()=>j(tx.error)})
    db.close();localStorage.setItem('textScale',s)}, scale)
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('nav.tabs',{timeout:20000}); await page.waitForTimeout(600)
  await go(page,{tool:'Отчёт'}); await page.waitForTimeout(600)
  for (const [name,css] of [['base',''],['fix','.report-facts td:first-child{width:auto;max-width:14ch}.report-facts td{hyphens:auto}']]) {
    await page.evaluate((c)=>{let e=document.getElementById('__p');if(!e){e=document.createElement('style');e.id='__p';document.head.appendChild(e)}e.textContent=c},css)
    await page.waitForTimeout(250)
    const cards = await page.locator('.card').all()
    await cards[0].screenshot({ path: `${OUT}/vred_c1_${scale}_${name}.png` })
    await cards[1].screenshot({ path: `${OUT}/vred_c2_${scale}_${name}.png` })
    await cards[3].screenshot({ path: `${OUT}/vred_c4_${scale}_${name}.png` })
  }
  await ctx.close()
}
await b.close()
