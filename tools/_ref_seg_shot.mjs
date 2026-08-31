import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const OUT='/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
for (const [w,scale,density] of [[360,'normal','normal'],[360,'xlarge','roomy']]) {
  const ctx = await browser.newContext({ viewport:{width:w,height:900}, locale:'ru-RU', timezoneId:'Europe/Moscow', colorScheme:'dark', deviceScaleFactor:3, ignoreHTTPSErrors:true })
  const page = await ctx.newPage(); await page.clock.install({ time:new Date(FROZEN) })
  await page.goto('http://localhost:5199',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1500)
  await seed(page, FROZEN)
  await page.evaluate(async ([s,d])=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const cur=await new Promise(res=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>res(q.result||{})});cur.textScale=s;cur.density=d;cur.trackGlucose=true;cur.onboarded=true;await new Promise((res,rej)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close();localStorage.setItem('textScale',s)},[scale,density])
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('nav.tabs',{timeout:20000}); await page.waitForTimeout(600)
  await go(page,{tool:'Настройки'}); await page.waitForTimeout(400)
  for (const lbl of ['Стартовый экран','Размер текста']) {
    const el = page.locator(`.segmented--fill[aria-label="${lbl}"]`)
    await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(200)
    const bb = await el.boundingBox()
    const name = lbl==='Размер текста'?'razmer':'start'
    await page.screenshot({ path:`${OUT}/refshot_${scale}_${name}.png`, clip:{x:Math.max(0,bb.x-14), y:bb.y-8, width:Math.min(w-Math.max(0,bb.x-14), bb.width+40), height:bb.height+16} })
  }
  await ctx.close()
}
await browser.close()
console.log('ok')
