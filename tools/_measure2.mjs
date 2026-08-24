import { chromium } from 'playwright'
const URL='http://localhost:5288'
const FROZEN=new Date('2026-08-15T10:30:00').getTime()

async function run({name, crisis, backupWarn, medAlert, zoom=1, W=360, H=780}) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({viewport:{width:W,height:H},locale:'ru-RU',timezoneId:'Europe/Moscow',colorScheme:'light'})
  const page = await ctx.newPage()
  await page.clock.install({time:new Date(FROZEN)})
  await page.goto(URL,{waitUntil:'domcontentloaded'})
  await page.waitForSelector('nav.tabs',{timeout:15000}); await page.waitForTimeout(300)
  await page.evaluate(async ([now,crisis,backupWarn,medAlert])=>{
    const DAY=86400000
    const m=(ts)=>{const d=new Date(ts);d.setHours(0,0,0,0);return d.getTime()}
    const day0=m(now); const at=(o,h)=>day0+o*DAY+h*3600000
    const medicines = medAlert ? [
      {id:'m1',name:'Конкор',dose:'5 мг',inn:'Бисопролол',form:'Таблетки',maker:'Мерк КГаА',packSize:30,left:2,perDay:null,expires:Date.UTC(2027,4,31),times:['08:00','20:00'],perTime:1,meal:'after',taken:[],leftAt:now-3*DAY},
    ] : [
      {id:'m1',name:'Конкор',dose:'5 мг',inn:'Бисопролол',form:'Таблетки',maker:'Мерк КГаА',packSize:30,left:29,perDay:null,expires:Date.UTC(2030,4,31),times:['08:00','20:00'],perTime:1,meal:'after',taken:[],leftAt:now-3*DAY},
    ]
    const readings=[]
    for(let i=-29;i<=-1;i++) readings.push({id:`bp-${i}`,kind:'bp',ts:at(i,8)+600000,user:1,source:'manual',sys:128+((i%7)+7)%7,dia:82+((i%4)+4)%4,bpm:68+((i%5)+5)%5,ihb:false,mov:false})
    readings.push(crisis
      ? {id:'bp-0',kind:'bp',ts:at(0,8)+600000,user:1,source:'manual',sys:194,dia:126,bpm:88,ihb:false,mov:false}
      : {id:'bp-0',kind:'bp',ts:at(0,8)+600000,user:1,source:'manual',sys:130,dia:83,bpm:70,ihb:false,mov:false})
    const count=readings.length+medicines.length
    const settings = backupWarn
      ? {backupLastAt: now-9*DAY, backupLastCount: count-1}
      : {backupLastAt: now-1*DAY, backupLastCount: count}
    const db=await new Promise((res,rej)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
    await new Promise((res,rej)=>{const tx=db.transaction(['medicines','readings','meta'],'readwrite')
      medicines.forEach(x=>tx.objectStore('medicines').put(x)); readings.forEach(x=>tx.objectStore('readings').put(x))
      tx.objectStore('meta').put(settings,'settings'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error)})
    db.close()
  },[FROZEN,crisis,backupWarn,medAlert])
  await page.reload({waitUntil:'domcontentloaded'})
  await page.waitForSelector('nav.tabs',{timeout:15000}); await page.waitForTimeout(500)
  if(zoom!==1){await page.evaluate(z=>{document.documentElement.style.fontSize=`${16*z}px`},zoom); await page.waitForTimeout(300)}
  await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(150)
  const r=await page.evaluate(()=>{
    const box=el=>{const b=el.getBoundingClientRect();return {top:Math.round(b.top+scrollY),h:Math.round(b.height)}}
    const bs=[...document.querySelectorAll('.banner')].map(b=>({cls:b.className.replace('banner banner--',''),...box(b)}))
    const lead=document.querySelector('.lead .card')
    const tabs=document.querySelector('nav.tabs')
    return {vh:innerHeight, tabsTop: tabs?box(tabs).top:null, banners:bs, leadTop: lead?box(lead).top:null}
  })
  console.log(name, JSON.stringify(r))
  await browser.close()
}
await run({name:'A worst(crisis+backup+med) 360x780 zoom1  ', crisis:true, backupWarn:true, medAlert:true})
await run({name:'B backup+med, no crisis 360x780 zoom1      ', crisis:false, backupWarn:true, medAlert:true})
await run({name:'C backup only 360x780 zoom1               ', crisis:false, backupWarn:true, medAlert:false})
await run({name:'D none 360x780 zoom1                      ', crisis:false, backupWarn:false, medAlert:false})
await run({name:'E worst 360x780 zoom1.3                   ', crisis:true, backupWarn:true, medAlert:true, zoom:1.3})
await run({name:'F two-yellow no-crisis zoom1.3 360x780     ', crisis:false, backupWarn:true, medAlert:true, zoom:1.3})
await run({name:'G two-yellow no-crisis 407x900 (real dev)  ', crisis:false, backupWarn:true, medAlert:true, W:407, H:900})
await run({name:'H worst 407x900                            ', crisis:true, backupWarn:true, medAlert:true, W:407, H:900})
