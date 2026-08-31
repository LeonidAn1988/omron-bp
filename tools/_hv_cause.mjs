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

const M = () => ({ doc: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth,
  navW: +document.querySelector('nav.tabs').getBoundingClientRect().width.toFixed(1),
  apt: (()=>{const b=[...document.querySelectorAll('nav.tabs button.tab')].pop();const r=b.getBoundingClientRect();return {l:+r.l||+r.left.toFixed(1), r:+r.right.toFixed(1), visible:+(Math.min(r.right,360)-Math.max(r.left,0)).toFixed(1)}})() })

console.log('как есть           ', JSON.stringify(await page.evaluate(M)))

// можно ли нажать «Аптечка» при переполнении
const clickAptechka = async () => {
  const box = await page.evaluate(()=>{const b=[...document.querySelectorAll('nav.tabs button.tab')].pop();const r=b.getBoundingClientRect();const vw=document.documentElement.clientWidth;return {x:(Math.max(r.left,0)+Math.min(r.right,vw))/2, y:(r.top+r.bottom)/2, hit:(()=>{const h=document.elementFromPoint((Math.max(r.left,0)+Math.min(r.right,vw))/2,(r.top+r.bottom)/2);return h===b||b.contains(h)})()}})
  await page.mouse.click(box.x, box.y); await page.waitForTimeout(600)
  const now = await page.evaluate(()=>{const b=[...document.querySelectorAll('nav.tabs button.tab')].pop();return {pressed:b.getAttribute('aria-pressed')||b.className, h1:document.querySelector('h1,h2')?.textContent.trim().slice(0,40), body:document.body.innerText.slice(0,120).replace(/\n/g,' | ')}})
  return { box, now }
}
console.log('клик по «Аптечка»  ', JSON.stringify(await clickAptechka()))

await go(page,{tool:'Отчёт'}); await page.waitForTimeout(400)
// снимаем сегментед полностью — что останется от переполнения
await page.addStyleTag({content:'.segmented.no-print{display:none !important}'})
await page.waitForTimeout(400)
console.log('без переключателя  ', JSON.stringify(await page.evaluate(M)))
// и без навигации тоже
await page.addStyleTag({content:'nav.tabs{display:none !important}'})
await page.waitForTimeout(400)
console.log('без него и без nav ', JSON.stringify(await page.evaluate(()=>({doc:document.documentElement.scrollWidth, vw:document.documentElement.clientWidth}))))
// только правка из находки, nav виден
await page.reload({waitUntil:'domcontentloaded'}); await settle(page); await go(page,{tool:'Отчёт'}); await page.waitForTimeout(400)
await page.addStyleTag({content:'.segmented{flex-wrap:wrap;max-width:100%}.segmented button{white-space:normal;overflow-wrap:break-word}'})
await page.waitForTimeout(400)
console.log('правка из находки  ', JSON.stringify(await page.evaluate(M)))
await page.addStyleTag({content:'nav.tabs{display:none !important}'})
await page.waitForTimeout(300)
console.log('правка + nav скрыт ', JSON.stringify(await page.evaluate(()=>({doc:document.documentElement.scrollWidth, vw:document.documentElement.clientWidth}))))
await browser.close()
