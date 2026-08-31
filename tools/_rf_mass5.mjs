import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const OUT='/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const b = await chromium.launch()
for (const w of [360,375]) {
  const ctx = await b.newContext({ viewport:{width:w,height:812}, locale:'ru-RU', colorScheme:'dark', deviceScaleFactor:3, ignoreHTTPSErrors:true })
  const p = await ctx.newPage(); await p.clock.install({ time:new Date(FROZEN) })
  await p.goto('http://localhost:5199',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1400)
  await seed(p, FROZEN)
  await p.evaluate(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('omron-bp',3);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const c=await new Promise(r=>{const t=db.transaction('meta','readonly');const q=t.objectStore('meta').get('settings');q.onsuccess=()=>r(q.result||{})});c.textScale='xlarge';c.onboarded=true;await new Promise((r,j)=>{const t=db.transaction('meta','readwrite');t.objectStore('meta').put(c,'settings');t.oncomplete=r;t.onerror=()=>j(t.error)});db.close();localStorage.setItem('textScale','xlarge')})
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForSelector('nav.tabs',{timeout:20000}); await p.waitForTimeout(600)
  await go(p,{tab:'Аптечка',open:'Конкор'}); await p.waitForTimeout(500)
  const el = await p.evaluateHandle(()=>[...document.querySelectorAll('.detail__row')].find(r=>r.querySelector('dt')?.textContent.trim()==='Производитель')?.closest('.card'))
  await el.asElement().screenshot({ path:`${OUT}/_rfm_card_${w}.png` })
  await ctx.close()
}
await b.close(); console.log('ok')
