import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL='http://localhost:5199'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport:{width:360,height:800}, locale:'ru-RU', timezoneId:'Europe/Moscow', colorScheme:'dark', deviceScaleFactor:2, hasTouch:true, isMobile:true })
const page = await ctx.newPage(); await page.clock.install({time:new Date(FROZEN)})
await page.goto(URL,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(900); await seed(page,FROZEN)
await page.evaluate(async ()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('omron-bp',3);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})
 const cur=await new Promise((r)=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>r(q.result||{})})
 cur.textScale='xlarge';cur.density='roomy';cur.onboarded=true
 await new Promise((r,j)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close()
 localStorage.setItem('textScale','xlarge');localStorage.setItem('density','roomy')})
await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('nav.tabs',{timeout:20000}); await page.waitForTimeout(600)
await go(page,{tab:'Давление'}); await page.waitForTimeout(600)
await page.waitForSelector('.wheel__list', {timeout:10000})
const n = await page.locator('.wheel__list').count(); console.log('барабанов:', n)

const measure = async (tag)=> page.evaluate((tag)=>{
  const out=[]
  for (const w of document.querySelectorAll('.wheel')){
    const box=w.querySelector('.wheel__box').getBoundingClientRect()
    const sel=w.querySelector("[data-selected='true']"); if(!sel) continue
    const range=document.createRange(); range.selectNodeContents(sel); const tr=range.getBoundingClientRect()
    out.push({l:w.querySelector('.wheel__label').textContent.trim(), v:sel.textContent,
      glyphCut:{l:Math.round(Math.max(0,box.left-tr.left)),r:Math.round(Math.max(0,tr.right-box.right)),t:Math.round(Math.max(0,box.top-tr.top)),b:Math.round(Math.max(0,tr.bottom-box.bottom))}})
  }
  return {tag, out}
},tag)

// прокручиваем каждый барабан в крайние положения напрямую, минуя smooth
for (const [tag, frac] of [['минимум',0],['максимум',1]]){
  await page.evaluate((f)=>{ document.querySelectorAll('.wheel').forEach(w=>{ const l=w.querySelector('.wheel__list')
    if(w.className.includes('wheel--x')) l.scrollLeft = f? l.scrollWidth : 0; else l.scrollTop = f? l.scrollHeight : 0 }) }, frac)
  await page.waitForTimeout(1200)
  console.log(JSON.stringify(await measure(tag)))
}
await browser.close()
