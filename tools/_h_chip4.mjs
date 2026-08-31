import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL='http://localhost:5199'
const OUT='/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser=await chromium.launch()
const ctx=await browser.newContext({viewport:{width:360,height:780},locale:'ru-RU',timezoneId:'Europe/Moscow',colorScheme:'light',deviceScaleFactor:2,isMobile:true,hasTouch:true})
const page=await ctx.newPage()
await page.clock.install({time:new Date(FROZEN)})
await page.goto(URL,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(900)
await seed(page,FROZEN)
await page.evaluate(async()=>{const db=await new Promise((r2,j)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>r2(r.result);r.onerror=()=>j(r.error)});const cur=await new Promise(r2=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>r2(q.result||{})});cur.onboarded=true;await new Promise((r2,j)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=r2;tx.onerror=()=>j(tx.error)});db.close()})
await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('nav.tabs',{timeout:20000}); await page.waitForTimeout(400)
await go(page,{tab:'Аптечка',click:'Добавить препарат'}); await page.waitForTimeout(400)
const input=page.locator('.suggest input').first(); await input.click(); await input.fill('Индапамид'); await page.waitForTimeout(900)
await page.locator('.suggest__item').nth(0).dispatchEvent('mousedown'); await page.waitForTimeout(400)
const chips=page.locator('.chips[aria-label="Формы выпуска из реестра"] .chip')
const bb=await chips.nth(await chips.count()-1).boundingBox()
await page.touchscreen.tap(Math.min(bb.x+40,340), bb.y+bb.height/2); await page.waitForTimeout(400)
// прокрутим к строке «Форма:»
await page.evaluate(()=>{const e=[...document.querySelectorAll('.muted')].find(x=>x.textContent.trim().startsWith('Форма:')); e&&e.scrollIntoView({block:'center'})})
await page.waitForTimeout(300)
await page.screenshot({path:`${OUT}/h4_echo.png`})
// и снимок «страница уехала вбок» + где навигация
await page.evaluate(()=>{window.scrollTo(9999,0)}); await page.waitForTimeout(300)
await page.screenshot({path:`${OUT}/h4_panned.png`})
console.log('ok', await page.evaluate(()=>({x:scrollX, sw:document.documentElement.scrollWidth, nav:(()=>{const n=document.querySelector('nav.tabs').getBoundingClientRect();return [Math.round(n.left),Math.round(n.right)]})()})))
await ctx.close(); await browser.close()
