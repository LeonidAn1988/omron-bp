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

const NAV = () => {
  const nav = document.querySelector('nav.tabs')
  const r = nav.getBoundingClientRect()
  const app = nav.closest('.app'); const ar = app.getBoundingClientRect()
  const cs = getComputedStyle(nav)
  return {
    navL:+r.left.toFixed(1), navR:+r.right.toFixed(1), navW:+r.width.toFixed(1),
    navScrollW: nav.scrollWidth, navClientW: nav.clientWidth, overflowX: cs.overflowX, position: cs.position,
    appL:+ar.left.toFixed(1), appR:+ar.right.toFixed(1), appW:+ar.width.toFixed(1),
    docScrollW: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth,
    tabs: [...nav.querySelectorAll('button.tab')].map(b=>{const q=b.getBoundingClientRect();return {t:b.textContent.trim(),l:+q.left.toFixed(1),r:+q.right.toFixed(1)}}),
  }
}
console.log('ДАВЛЕНИЕ:', JSON.stringify(await page.evaluate(NAV), null, 1))
await go(page,{tool:'Отчёт'}); await page.waitForTimeout(400)
console.log('ОТЧЁТ:', JSON.stringify(await page.evaluate(NAV), null, 1))
// а если убрать переполнение сегментеда — исчезнет ли переполнение навигации?
await page.addStyleTag({content:'.segmented{flex-wrap:wrap;max-width:100%}.segmented button{white-space:normal;overflow-wrap:break-word}'})
await page.waitForTimeout(400)
console.log('ОТЧЁТ ПОСЛЕ ПРАВКИ:', JSON.stringify(await page.evaluate(NAV), null, 1))
await browser.close()
