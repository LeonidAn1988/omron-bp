import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

for (const scale of ['normal', 'xlarge']) {
 for (const glucose of [true, false]) {
  const ctx = await browser.newContext({ viewport:{width:412,height:915}, locale:'ru-RU', timezoneId:'Europe/Moscow', colorScheme:'light', deviceScaleFactor:2 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async ([s,g]) => {
    const db = await new Promise((res,rej)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
    const cur = await new Promise((res)=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>res(q.result||{})})
    cur.textScale=s; cur.trackGlucose=g; cur.onboarded=true
    await new Promise((res,rej)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})
    db.close(); localStorage.setItem('textScale', s)
  }, [scale, glucose])
  await page.reload({ waitUntil:'domcontentloaded' })
  await page.waitForSelector('nav.tabs',{timeout:20000}); await page.waitForTimeout(500)
  await go(page, { tool:'Прибор' }); await page.waitForTimeout(400)

  const r = await page.evaluate(() => {
    const cards=[...document.querySelectorAll('.card')]
    const last=cards[cards.length-1]
    // строим настоящий .log из 60 строк внутри карточки журнала
    const probe=document.createElement('div'); probe.className='log'; probe.tabIndex=0
    for(let i=0;i<60;i++){const l=document.createElement('div');l.className='log__line log__line--info';l.innerHTML='<span class="log__time">12:00:0'+(i%10)+'</span><span class="log__msg">строка обмена '+i+'</span>';probe.appendChild(l)}
    last.insertBefore(probe, last.querySelector('.muted'))
    const pr=probe.getBoundingClientRect()
    const lines=[...probe.querySelectorAll('.log__line')]
    const lh=lines[0].getBoundingClientRect().height
    const cs=getComputedStyle(probe)
    const inner=pr.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth)
    const full=Math.floor(inner/lh)
    const navH=(()=>{const n=document.querySelector('nav.tabs');const s=getComputedStyle(n);return {h:Math.round(n.getBoundingClientRect().height), pos:s.position}})()
    probe.remove()
    const cards2=[...document.querySelectorAll('.card')].map(c=>({h2:c.querySelector('h2')?.textContent.trim(),top:Math.round(c.getBoundingClientRect().top+scrollY),h:Math.round(c.getBoundingClientRect().height)}))
    const appPB=getComputedStyle(document.querySelector('.app')).paddingBottom
    return { logBoxH:Math.round(pr.height), lineH:+lh.toFixed(2), fontPx:cs.fontSize, padding:cs.padding, fullLines:full, navH, cards:cards2, doc:Math.round(document.documentElement.scrollHeight), appPaddingBottom:appPB }
  })
  console.log(`--- scale=${scale} glucose=${glucose} ---`)
  console.log(JSON.stringify(r))
  await ctx.close()
 }
}
await browser.close()
