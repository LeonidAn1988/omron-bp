import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from './visual.mjs'
const URL='http://localhost:4399'
const browser = await chromium.launch()
for (const mobile of [true,false]) {
  const ctx = await browser.newContext({ viewport:{width:360,height:900}, locale:'ru-RU', timezoneId:'Europe/Moscow', colorScheme:'dark', deviceScaleFactor:2, hasTouch:mobile, isMobile:mobile })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1800)
  await seed(page, FROZEN)
  await page.evaluate(()=>{localStorage.setItem('textScale','xlarge');localStorage.setItem('density','roomy')})
  await page.evaluate(async ()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('omron-bp',3);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const cur=await new Promise((r)=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>r(q.result||{})});cur.textScale='xlarge';cur.density='roomy';cur.trackGlucose=true;cur.onboarded=true;await new Promise((r,j)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close()})
  await page.reload({waitUntil:'domcontentloaded'}); await settle(page)
  await go(page,{tool:'Отчёт'}); await page.waitForTimeout(400)
  const r = await page.evaluate(async ()=>{
    const de=document.documentElement
    window.scrollBy(0,300); await new Promise(r=>setTimeout(r,200))
    const vy = window.scrollY
    window.scrollTo(0,0); await new Promise(r=>setTimeout(r,200))
    window.scrollBy(300,0); await new Promise(r=>setTimeout(r,250))
    const vx = window.scrollX
    return { mobileLike: navigator.maxTouchPoints, sw:de.scrollWidth, cw:de.clientWidth, verticalScrolled:vy, horizontalScrolled:vx, vvScale: visualViewport.scale, vvWidth:+visualViewport.width.toFixed(1), innerWidth: window.innerWidth }
  })
  console.log(`isMobile=${mobile}:`, JSON.stringify(r))
  await ctx.close()
}
await browser.close()
