import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from './visual.mjs'
const URL='http://localhost:4399'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport:{width:360,height:900}, locale:'ru-RU', timezoneId:'Europe/Moscow', colorScheme:'dark', deviceScaleFactor:2, hasTouch:true, isMobile:true })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1800)
await seed(page, FROZEN)
await page.evaluate(()=>{localStorage.setItem('textScale','xlarge');localStorage.setItem('density','roomy')})
await page.evaluate(async ()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('omron-bp',3);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const cur=await new Promise((r)=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>r(q.result||{})});cur.textScale='xlarge';cur.density='roomy';cur.trackGlucose=true;cur.onboarded=true;await new Promise((r,j)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close()})
await page.reload({waitUntil:'domcontentloaded'}); await settle(page)
await go(page,{tool:'Отчёт'}); await page.waitForTimeout(400)
console.log(JSON.stringify(await page.evaluate(()=>{
  const de=document.documentElement, b=document.body
  return { se: document.scrollingElement===de?'html':'body',
    htmlOverflowX:getComputedStyle(de).overflowX, bodyOverflowX:getComputedStyle(b).overflowX,
    htmlSW:de.scrollWidth, htmlCW:de.clientWidth, bodySW:b.scrollWidth, bodyCW:b.clientWidth,
    rootSW:document.getElementById('root')?.scrollWidth, rootCW:document.getElementById('root')?.clientWidth,
    appOverflow:(()=>{const a=document.querySelector('.app');const c=getComputedStyle(a);return {ox:c.overflowX, sw:a.scrollWidth, cw:a.clientWidth}})() }
})))
// пробуем колесом
await page.mouse.move(180, 400)
await page.mouse.wheel(400, 0)
await page.waitForTimeout(500)
console.log('после wheel:', JSON.stringify(await page.evaluate(()=>({sl:document.scrollingElement.scrollLeft, sx:window.scrollX}))))
// пробуем pageX через keyboard End? проверим свайпом
await page.touchscreen.tap(180, 400)
await page.evaluate(()=>{ window.scrollBy(200,0) }); await page.waitForTimeout(400)
console.log('после scrollBy:', JSON.stringify(await page.evaluate(()=>({sl:document.scrollingElement.scrollLeft, sx:window.scrollX}))))
// а фокус клавиатурой — уводит ли к кнопке
await page.evaluate(()=>{const b=[...document.querySelectorAll('.segmented.no-print button')].pop(); b.focus(); b.scrollIntoView({block:'nearest',inline:'nearest'})})
await page.waitForTimeout(400)
console.log('после focus+scrollIntoView:', JSON.stringify(await page.evaluate(()=>{const b=[...document.querySelectorAll('.segmented.no-print button')].pop();const r=b.getBoundingClientRect();return {sl:document.scrollingElement.scrollLeft, sx:window.scrollX, btnR:+r.right.toFixed(1), vw:document.documentElement.clientWidth, fully:r.right<=document.documentElement.clientWidth+0.5}})))
await browser.close()
