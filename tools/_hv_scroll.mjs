import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from './visual.mjs'
const URL='http://localhost:4399'
const browser = await chromium.launch()
async function open(scale, density) {
  const ctx = await browser.newContext({ viewport:{width:360,height:900}, locale:'ru-RU', timezoneId:'Europe/Moscow', colorScheme:'dark', deviceScaleFactor:2, hasTouch:true, isMobile:true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1800)
  await seed(page, FROZEN)
  await page.evaluate(([s,d])=>{localStorage.setItem('textScale',s);localStorage.setItem('density',d)},[scale,density])
  await page.evaluate(async ([s,d])=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('omron-bp',3);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const cur=await new Promise((r)=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>r(q.result||{})});cur.textScale=s;cur.density=d;cur.trackGlucose=true;cur.onboarded=true;await new Promise((r,j)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close()},[scale,density])
  await page.reload({waitUntil:'domcontentloaded'}); await settle(page)
  await go(page,{tool:'Отчёт'}); await page.waitForTimeout(400)
  return { ctx, page }
}
for (const [s,d] of [['large','roomy'],['xlarge','roomy']]) {
  const { ctx, page } = await open(s,d)
  const before = await page.evaluate(()=>{const b=[...document.querySelectorAll('.segmented.no-print button')].pop();const r=b.getBoundingClientRect();const vw=document.documentElement.clientWidth;return {vw, doc:document.documentElement.scrollWidth, scrollX:window.scrollX, btnL:+r.left.toFixed(1), btnR:+r.right.toFixed(1), visible:+(Math.min(r.right,vw)-Math.max(r.left,0)).toFixed(1), minTap:getComputedStyle(document.documentElement).getPropertyValue('--tap')}})
  await page.evaluate(()=>{document.scrollingElement.scrollLeft = 9999})
  await page.waitForTimeout(400)
  const after = await page.evaluate(()=>{const b=[...document.querySelectorAll('.segmented.no-print button')].pop();const r=b.getBoundingClientRect();const vw=document.documentElement.clientWidth;const h=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);return {scrollLeft:document.scrollingElement.scrollLeft, btnL:+r.left.toFixed(1), btnR:+r.right.toFixed(1), fullyVisible:r.left>=-0.5&&r.right<=vw+0.5, hitIsButton:h===b||b.contains(h)}})
  // клик после прокрутки
  const box = await page.evaluate(()=>{const b=[...document.querySelectorAll('.segmented.no-print button')].pop();const r=b.getBoundingClientRect();return {x:(r.left+r.right)/2,y:(r.top+r.bottom)/2}})
  await page.mouse.click(box.x, box.y); await page.waitForTimeout(500)
  const res = await page.evaluate(()=>{const b=[...document.querySelectorAll('.segmented.no-print button')].pop();const el=[...document.querySelectorAll('.report-facts td')].find(e=>e.textContent.includes('всё время')||e.textContent.trim().startsWith('за '));return {pressed:b.getAttribute('aria-pressed'), period: el?el.textContent.trim().slice(0,80):null}})
  console.log(`\n=== 360 / ${s} / ${d}`)
  console.log(' до прокрутки :', JSON.stringify(before))
  console.log(' после прокрутки:', JSON.stringify(after))
  console.log(' клик:', JSON.stringify(res))
  await ctx.close()
}
await browser.close()
