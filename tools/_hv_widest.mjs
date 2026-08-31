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
const WIDEST = () => {
  const vw = document.documentElement.clientWidth
  const out = []
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.right > vw + 0.5) {
      const cs = getComputedStyle(el)
      // пропускаем тех, чей переполняющий предок — скроллер
      let sc = el.parentElement, inScroller = false
      while (sc && sc !== document.body) { const c = getComputedStyle(sc); if (c.overflowX==='auto'||c.overflowX==='scroll') { inScroller = true; break } sc = sc.parentElement }
      out.push({ tag: el.tagName.toLowerCase()+(el.className?'.'+String(el.className).split(' ').join('.'):''), right:+r.right.toFixed(1), inScroller, pos: cs.position })
    }
  })
  out.sort((a,b)=>b.right-a.right)
  return out.filter(o=>!o.inScroller).slice(0,8)
}
for (const [s,d] of [['xlarge','roomy'],['large','roomy'],['small','compact']]) {
  const { ctx, page } = await open(s,d)
  console.log(`\n=== ${s}/${d}  doc=${await page.evaluate(()=>document.documentElement.scrollWidth)}`)
  console.log(JSON.stringify(await page.evaluate(WIDEST), null, 1))
  await page.addStyleTag({content:'.segmented.no-print{display:none !important}'}); await page.waitForTimeout(300)
  console.log(`--- без переключателя doc=${await page.evaluate(()=>document.documentElement.scrollWidth)}`)
  console.log(JSON.stringify(await page.evaluate(WIDEST), null, 1))
  await ctx.close()
}
await browser.close()
