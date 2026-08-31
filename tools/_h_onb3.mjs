import { chromium } from 'playwright'
import { seed, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL='http://localhost:5199'
const OUT='/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const b=await chromium.launch()
const ctx=await b.newContext({viewport:{width:412,height:915},locale:'ru-RU',timezoneId:'Europe/Moscow',colorScheme:'dark',deviceScaleFactor:2,hasTouch:true,isMobile:true})
const p=await ctx.newPage()
await p.clock.install({time:new Date(FROZEN)})
await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1200)
await seed(p, FROZEN)
// «сын прошёл знакомство и оставил обычный размер» — ровно случай из находки
await p.evaluate(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('omron-bp',3);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const c=await new Promise(r=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>r(q.result||{})});c.onboarded=true;c.textScale='normal';await new Promise((r,j)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(c,'settings');tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close()})
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForSelector('nav.tabs',{timeout:20000}); await p.waitForTimeout(800)

console.log('=== старт: экран отца, размер «Обычный» ===')
console.log(JSON.stringify(await p.evaluate(()=>({
  верхняяПолоса: document.querySelector('.topbar')?.innerText.replace(/\n/g,' / '),
  нижняяПолоса: document.querySelector('nav.tabs')?.innerText.replace(/\n/g,' / '),
})),null,2))

// ТАП 1 — «Настройки»
const t0=Date.now()
await p.click('button:has-text("Настройки")'); await p.waitForTimeout(700)
const box=await p.evaluate(()=>{
  const lab=[...document.querySelectorAll('.tile__label')].find(e=>e.textContent.trim()==='Размер текста')
  if(!lab) return null
  const r=lab.getBoundingClientRect()
  return {надписьЕсть:true, yОтВерхаЭкрана:Math.round(r.top), высотаОкна:window.innerHeight, виднаБезПрокрутки:r.top>=0&&r.top<window.innerHeight, всеговысотаСтраницы:Math.round(document.documentElement.scrollHeight)}
})
console.log('=== ТАП 1 — вкладка «Настройки» ===')
console.log(JSON.stringify(box,null,2))
// прокрутка до блока
await p.evaluate(()=>{const lab=[...document.querySelectorAll('.tile__label')].find(e=>e.textContent.trim()==='Размер текста');lab.scrollIntoView({block:'center'})})
await p.waitForTimeout(500)
await p.screenshot({path:OUT+'/h_onb_settings_size.png'})
// ТАП 2 — «Очень крупный»
const btns=await p.$$('.segmented[aria-label="Размер текста"] button')
console.log('кнопок размера:', btns.length, await Promise.all(btns.map(async x=>(await x.innerText()).trim())))
for(const x of btns){ if((await x.innerText()).trim()==='Очень крупный'){ await x.click(); break } }
await p.waitForTimeout(700)
console.log('=== ТАП 2 — «Очень крупный» ===')
console.log(JSON.stringify(await p.evaluate(()=>({
  dataText: document.documentElement.dataset.text||'(нет)',
  rootFontSize: getComputedStyle(document.documentElement).fontSize,
})),null,2))
console.log('всего тапов от рабочего экрана до крупного шрифта: 2, секунд:', ((Date.now()-t0)/1000).toFixed(1))
await p.screenshot({path:OUT+'/h_onb_after_xl.png'})
await b.close()
