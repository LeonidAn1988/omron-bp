import { chromium } from 'playwright'
const URL='http://localhost:5199', FROZEN=new Date('2026-08-15T10:30:00').getTime()
const OUT='/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/'
async function seed(page){ await page.evaluate(async()=>{
  const meds=[{id:'m1',name:'Конкор',dose:'5 мг',inn:'Бисопролол',form:'Таблетки',maker:'Мерк',packSize:30,left:12,perDay:null,expires:Date.UTC(2027,4,31),times:['08:00','20:00'],perTime:1,taken:[]}]
  const db=await new Promise((r,j)=>{const q=indexedDB.open('omron-bp',3);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})
  await new Promise((r,j)=>{const tx=db.transaction(['medicines','meta'],'readwrite');meds.forEach(m=>tx.objectStore('medicines').put(m));tx.objectStore('meta').put({onboarded:true},'settings');tx.oncomplete=r;tx.onerror=()=>j(tx.error)})
  db.close() })}
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:375,height:812},locale:'ru-RU',hasTouch:true,isMobile:true,deviceScaleFactor:2})
const p=await ctx.newPage(); await p.clock.install({time:new Date(FROZEN)})
await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700); await seed(p)
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForSelector('nav.tabs',{timeout:20000})
await p.locator('nav.tabs button',{hasText:'Аптечка'}).first().click(); await p.waitForTimeout(300)
await p.locator('.pills button, .pills a').filter({hasText:'Конкор'}).first().click(); await p.waitForTimeout(300)
const del=p.locator('button.btn--danger',{hasText:'Удалить'}).first()
await del.scrollIntoViewIfNeeded(); await p.waitForTimeout(300)
const bb=await del.boundingBox()
const clip={x:0,y:Math.max(0,bb.y-70),width:375,height:170}
await p.screenshot({path:OUT+'ref_del_before.png',clip})
const bbDoc=await p.evaluate(()=>{const e=[...document.querySelectorAll('button.btn--danger')].find(b=>b.innerText.trim()==='Удалить');const r=e.getBoundingClientRect();return {t:r.top,l:r.left}})
await del.click(); await p.waitForTimeout(350)
await p.screenshot({path:OUT+'ref_del_after.png',clip})
console.log('до :', JSON.stringify(bbDoc))
console.log('после:', JSON.stringify(await p.evaluate(()=>{const e=[...document.querySelectorAll('button.btn--danger')].find(b=>b.innerText.trim()==='Удалить насовсем');const r=e.getBoundingClientRect();return {t:r.top,l:r.left}})))
await b.close()
