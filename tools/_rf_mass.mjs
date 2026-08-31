import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = process.env.U || 'https://localhost:5199'
const browser = await chromium.launch()
const out = {}
for (const [scale, dens] of [['small','compact'],['normal','normal'],['large','normal'],['xlarge','roomy'],['xlarge','normal']]) {
  const ctx = await browser.newContext({ viewport:{width:375,height:812}, locale:'ru-RU', timezoneId:'Europe/Moscow', colorScheme:'dark', deviceScaleFactor:3.25, ignoreHTTPSErrors:true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil:'domcontentloaded' })
  await page.waitForTimeout(1500)
  await seed(page, FROZEN)
  await page.evaluate(async ([s,d]) => {
    const db = await new Promise((res,rej)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
    const cur = await new Promise((res)=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>res(q.result||{})})
    cur.textScale=s; cur.density=d; cur.onboarded=true; cur.theme='auto'
    await new Promise((res,rej)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})
    db.close()
    if(s==='normal') localStorage.removeItem('textScale'); else localStorage.setItem('textScale',s)
    if(d==='normal') localStorage.removeItem('density'); else localStorage.setItem('density',d)
  }, [scale,dens])
  await page.reload({ waitUntil:'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout:20000 })
  await page.waitForTimeout(600)
  await go(page, { tool:'Настройки' })
  await page.waitForTimeout(500)
  const m = await page.evaluate(() => {
    const R = document.documentElement
    const cb = document.querySelector('.card input[type="checkbox"]')
    const lab = cb ? cb.closest('label') : null
    const span = lab ? lab.querySelector('span') : null
    const r = cb ? cb.getBoundingClientRect() : null
    const btnSm = document.querySelector('.btn--sm')
    return {
      rootFs: getComputedStyle(R).fontSize,
      dataText: R.getAttribute('data-text'), dataDens: R.getAttribute('data-density'),
      bodyFs: getComputedStyle(document.body).fontSize,
      cbW: r? +r.width.toFixed(2):null, cbH: r? +r.height.toFixed(2):null,
      cbCss: cb? getComputedStyle(cb).width+' x '+getComputedStyle(cb).height : null,
      labelFs: span? getComputedStyle(span).fontSize : null,
      labelLh: span? getComputedStyle(span).lineHeight : null,
      btnSmMinH: btnSm? getComputedStyle(btnSm).minHeight : null,
      btnSmH: btnSm? +btnSm.getBoundingClientRect().height.toFixed(1):null,
      btnSmFs: btnSm? getComputedStyle(btnSm).fontSize:null,
    }
  })
  out[scale+'/'+dens] = m
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(out,null,1))
