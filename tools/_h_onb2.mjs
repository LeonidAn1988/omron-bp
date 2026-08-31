import { chromium } from 'playwright'
const URL='http://localhost:5199'
const OUT='/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const b=await chromium.launch()
const ctx=await b.newContext({viewport:{width:412,height:915},locale:'ru-RU',timezoneId:'Europe/Moscow',colorScheme:'dark',deviceScaleFactor:2,hasTouch:true,isMobile:true})
const p=await ctx.newPage()
await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1400)

// СЦЕНАРИЙ «СЫН НАСТРАИВАЕТ ТЕЛЕФОН ОТЦУ»
console.log('=== шаг 1: сын видит первый вопрос ===')
console.log(await p.evaluate(()=>document.querySelector('h2').textContent.trim()))
await p.click('button:has-text("Дальше")'); await p.waitForTimeout(500)
console.log('=== шаг 2: сын видит ВТОРОЙ вопрос (тот самый, «про размер текста») ===')
console.log(await p.evaluate(()=>({
  h2: document.querySelector('h2').textContent.trim(),
  кнопкиРазмера: [...document.querySelectorAll('.segmented button')].map(e=>e.textContent.trim()),
  образец: document.querySelector('.sample')?.innerText.replace(/\n/g,' | '),
})))
await p.screenshot({path:OUT+'/h_onb_step2.png'})
// сын выбирает «Очень крупный» за отца
await p.click('.segmented button:has-text("Очень крупный")'); await p.waitForTimeout(400)
await p.click('button:has-text("Готово")'); await p.waitForTimeout(1200)
const st=await p.evaluate(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('omron-bp',3);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const c=await new Promise(r=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>r(q.result)});db.close();return {onboarded:c.onboarded,textScale:c.textScale}})
console.log('=== после «Готово»: что записано ===', JSON.stringify(st))
console.log('=== data-text на корне ===', await p.evaluate(()=>document.documentElement.dataset.text||'(нет)'))
console.log('=== приложение открылось ===', await p.evaluate(()=>({hasNav:!!document.querySelector('nav.tabs'),nav:document.querySelector('nav.tabs')?.innerText.replace(/\n/g,' / ')})))
await b.close()
