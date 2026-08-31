import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport:{width:375,height:812}, locale:'ru-RU', colorScheme:'dark', ignoreHTTPSErrors:true })
const p = await ctx.newPage()
await p.clock.install({ time:new Date(FROZEN) })
await p.goto('http://localhost:5199',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1400)
await seed(p, FROZEN)
await p.evaluate(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('omron-bp',3);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const c=await new Promise(r=>{const t=db.transaction('meta','readonly');const q=t.objectStore('meta').get('settings');q.onsuccess=()=>r(q.result||{})});c.textScale='xlarge';c.onboarded=true;await new Promise((r,j)=>{const t=db.transaction('meta','readwrite');t.objectStore('meta').put(c,'settings');t.oncomplete=r;t.onerror=()=>j(t.error)});db.close();localStorage.setItem('textScale','xlarge')})
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForSelector('nav.tabs',{timeout:20000}); await p.waitForTimeout(600)
await go(p,{tool:'Настройки'}); await p.waitForTimeout(500)
console.log(JSON.stringify(await p.evaluate(()=>{
  const cb=document.querySelector('.card input[type=checkbox]')
  const s=getComputedStyle(cb)
  const lab=cb.closest('label'); const ls=getComputedStyle(lab)
  return {cbFontSize:s.fontSize, cbFontFamily:s.fontFamily.slice(0,30), labelFontSize:ls.fontSize,
    labelMinH:ls.minHeight, labelH:+lab.getBoundingClientRect().height.toFixed(1),
    tap:getComputedStyle(document.documentElement).getPropertyValue('--tap'),
    cbBox:+cb.getBoundingClientRect().width.toFixed(2)+'x'+ +cb.getBoundingClientRect().height.toFixed(2)}
}),null,1))
await b.close()
