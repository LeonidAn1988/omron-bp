import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL='http://localhost:4477'
const OUT='/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const b=await chromium.launch()
const ctx=await b.newContext({viewport:{width:360,height:800},locale:'ru-RU',timezoneId:'Europe/Moscow',colorScheme:'dark',deviceScaleFactor:3,hasTouch:true,isMobile:true})
const p=await ctx.newPage()
await p.clock.install({time:new Date(FROZEN)})
await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1200)
await seed(p,FROZEN)
await p.evaluate(async()=>{const db=await new Promise((r2,rj)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>r2(r.result);r.onerror=()=>rj(r.error)});const cur=await new Promise(res=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>res(q.result||{})});cur.textScale='normal';cur.trackGlucose=true;cur.onboarded=true;await new Promise((res,rj)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=res;tx.onerror=()=>rj(tx.error)});db.close()})
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForSelector('nav.tabs',{timeout:20000}); await p.waitForTimeout(500)
await go(p,{tool:'Отчёт'}); await p.waitForTimeout(600)
await p.evaluate(()=>{const c=[...document.querySelectorAll('.card')].find(x=>x.querySelector('h2')?.textContent.includes('Все измерения'));window.scrollTo(0,c.getBoundingClientRect().top+scrollY-40)})
await p.waitForTimeout(400)
await p.screenshot({path:`${OUT}/hv_list.png`})
// Обзор
await go(p,{tab:'Обзор'}); await p.waitForTimeout(500)
console.log('ОБЗОР:', (await p.evaluate(()=>document.body.innerText)).replace(/\n+/g,' | ').slice(0,700))
await ctx.close(); await b.close()
