import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4877'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/dz'
const browser = await chromium.launch()
for (const [w, sc, de] of [[360,'large','roomy'],[360,'large','normal'],[375,'large','roomy']]) {
  const ctx = await browser.newContext({ viewport:{width:w,height:820}, locale:'ru-RU', timezoneId:'Europe/Moscow',
    colorScheme:'dark', deviceScaleFactor:3, hasTouch:true, isMobile:true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(900)
  await seed(page, FROZEN)
  await page.evaluate(async ([a,b])=>{
    const db=await new Promise((res,rej)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
    const cur=await new Promise((res)=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>res(q.result||{})})
    cur.textScale=a; cur.density=b; cur.onboarded=true
    await new Promise((res,rej)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})
    db.close()
  },[sc,de])
  await page.reload({waitUntil:'domcontentloaded'}); await settle(page)
  await go(page,{tool:'Отчёт'})
  await page.screenshot({ path:`${OUT}/otchet-${w}-${sc}-${de}.png` })
  await ctx.close()
}
await browser.close()
