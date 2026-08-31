import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const OUT='/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const FIX=`.report-drugs,.report-adherence{table-layout:auto}
.report-drugs th,.report-drugs td,.report-adherence th,.report-adherence td{min-width:0}
.report-drugs th,.report-adherence th{hyphens:manual;overflow-wrap:normal}
.report-adherence td:nth-child(3){white-space:nowrap}
.report-drugs th:nth-child(1),.report-drugs td:nth-child(1),.report-drugs th:nth-child(2),.report-drugs td:nth-child(2),
.report-adherence th:nth-child(1),.report-adherence td:nth-child(1),.report-adherence th:nth-child(2),.report-adherence td:nth-child(2),
.report-adherence th:nth-child(3),.report-adherence td:nth-child(3){width:auto}`
const b=await chromium.launch()
const c=await b.newContext({viewport:{width:360,height:900},locale:'ru-RU',timezoneId:'Europe/Moscow',colorScheme:'light',deviceScaleFactor:2})
const p=await c.newPage(); await p.clock.install({time:new Date(FROZEN)})
await p.goto('http://localhost:5199',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1000)
await seed(p,FROZEN)
await p.evaluate(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('omron-bp',3);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})
const cur=await new Promise(r=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>r(q.result||{})})
cur.textScale='xlarge';cur.density='roomy';cur.onboarded=true
await new Promise((r,j)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close()
localStorage.setItem('textScale','xlarge');localStorage.setItem('density','roomy')})
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForSelector('nav.tabs',{timeout:20000}); await p.waitForTimeout(400)
await go(p,{tool:'Отчёт'}); await p.waitForTimeout(600)
await p.addStyleTag({content:FIX}); await p.waitForTimeout(400)
const box = await p.evaluate(()=>{const t=document.querySelector('.report-drugs');const cd=t.closest('.card')
const tr=t.getBoundingClientRect(), cr=cd.getBoundingClientRect()
return {tableRight:Math.round(tr.right), cardRight:Math.round(cr.right), viewportW:innerWidth, cardTop:Math.round(cr.top+scrollY), cardLeft:Math.round(cr.left)}})
console.log(JSON.stringify(box))
await p.evaluate((y)=>window.scrollTo(0,y-40), box.cardTop)
await p.waitForTimeout(300)
await p.screenshot({path:`${OUT}/um_page_posle.png`})
await b.close()
