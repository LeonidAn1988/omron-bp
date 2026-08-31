import { chromium } from 'playwright'
const URL='http://localhost:5199', FROZEN=new Date('2026-08-15T10:30:00').getTime()
async function seed(page){ await page.evaluate(async()=>{
  const meds=[{id:'m1',name:'Конкор',dose:'5 мг',inn:'Бисопролол',form:'Таблетки',maker:'Мерк',packSize:30,left:12,perDay:null,expires:Date.UTC(2027,4,31),times:['08:00','20:00'],perTime:1,taken:[]}]
  const db=await new Promise((r,j)=>{const q=indexedDB.open('omron-bp',3);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})
  await new Promise((r,j)=>{const tx=db.transaction(['medicines','meta'],'readwrite');meds.forEach(m=>tx.objectStore('medicines').put(m));tx.objectStore('meta').put({onboarded:true},'settings');tx.oncomplete=r;tx.onerror=()=>j(tx.error)})
  db.close() })}
const who=(p)=>p.evaluate(()=>{const a=document.activeElement;return a?a.tagName+(a.className?'.'+String(a.className).split(' ')[0]:'')+(a.innerText?` «${a.innerText.trim().slice(0,24)}»`:''):'null'})
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:375,height:812},locale:'ru-RU',hasTouch:true,isMobile:true})
const p=await ctx.newPage(); await p.clock.install({time:new Date(FROZEN)})
await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700); await seed(p)
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForSelector('nav.tabs',{timeout:20000})
await p.locator('nav.tabs button',{hasText:'Аптечка'}).first().click(); await p.waitForTimeout(300)
await p.locator('.pills button, .pills a').filter({hasText:'Конкор'}).first().click(); await p.waitForTimeout(300)
console.log('1. открыли карточку, фокус:', await who(p))
await p.locator('button',{hasText:'Поправить остаток'}).first().click(); await p.waitForTimeout(300)
console.log('2. открыли правку остатка (autoFocus), фокус:', await who(p))
await p.locator('button',{hasText:'Отмена'}).first().click(); await p.waitForTimeout(300)
console.log('3. нажали Отмена, фокус:', await who(p))
await p.locator('button',{hasText:'Поправить остаток'}).first().click(); await p.waitForTimeout(250)
await p.locator('button',{hasText:'Сохранить'}).first().click(); await p.waitForTimeout(500)
console.log('4. нажали Сохранить, фокус:', await who(p))
await p.locator('button',{hasText:'К списку'}).first().click(); await p.waitForTimeout(400)
console.log('5. вернулись к списку, фокус:', await who(p))
// для сравнения — как в дневнике давления
await p.locator('nav.tabs button',{hasText:'Давление'}).first().click(); await p.waitForTimeout(400)
console.log('6. вкладка Давление, фокус:', await who(p))
await b.close()
