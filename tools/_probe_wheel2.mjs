import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL='http://localhost:5199'
const OUT='/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport:{width:360,height:800}, locale:'ru-RU', timezoneId:'Europe/Moscow', colorScheme:'dark', deviceScaleFactor:2, hasTouch:true, isMobile:true })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1000)
await seed(page, FROZEN)
await page.evaluate(async ()=>{ const db=await new Promise((r,j)=>{const q=indexedDB.open('omron-bp',3);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})
 const cur=await new Promise((r)=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>r(q.result||{})})
 cur.textScale='xlarge'; cur.onboarded=true
 await new Promise((r,j)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=r;tx.onerror=()=>j(tx.error)}); db.close()
 localStorage.setItem('textScale','xlarge')})
await page.reload({waitUntil:'domcontentloaded'})
await page.waitForSelector('nav.tabs',{timeout:20000}); await page.waitForTimeout(600)
await go(page,{tab:'Давление'}); await page.waitForTimeout(600)

const read = async () => page.evaluate(()=>[...document.querySelectorAll('.wheel')].map(w=>({
  l:w.querySelector('.wheel__label').textContent.trim(),
  now:w.querySelector('.wheel__list').getAttribute('aria-valuenow'),
  txt:w.querySelector('.wheel__list').getAttribute('aria-valuetext'),
  sel:w.querySelector(".wheel__item[data-selected='true']")?.textContent,
  pending:!!w.querySelector("[data-pending='true']"),
})))
console.log('стартовое состояние:', JSON.stringify(await read()))

// 1. промах вниз на строку: тап по соседнему значению «121»
const box = await page.locator('.wheel--y').first().locator('.wheel__box').boundingBox()
const selBox = await page.locator('.wheel--y').first().locator(".wheel__item[data-selected='true']").boundingBox()
console.log('box', box, 'sel', selBox)
// тапаем на 20px ниже центра выбранного — то есть промах ровно на границу
await page.mouse.click(selBox.x+selBox.width/2, selBox.y+selBox.height/2+25)
await page.waitForTimeout(700)
console.log('после промаха на 25px вниз:', JSON.stringify(await read()))
await page.screenshot({path:`${OUT}/w_mistap.png`, clip:{x:0,y:Math.max(0,box.y-90),width:360,height:420}})

// 2. тап по обрезанному краевому значению горизонтального барабана
const px = await page.locator('.wheel--x').first()
const first = await px.locator('.wheel__item').first().boundingBox()
const items = await px.locator('.wheel__item').all()
// найдём видимый крайний слева
const pxbox = await px.locator('.wheel__box').boundingBox()
let target=null
for (const it of items){ const b=await it.boundingBox(); if(b && b.x+b.width>pxbox.x && b.x<pxbox.x+8){ target={b, t: await it.textContent()}; break } }
console.log('обрезанный слева элемент:', target && target.t, target && target.b)
if(target){ await page.mouse.click(target.b.x+target.b.width-6, target.b.y+target.b.height/2); await page.waitForTimeout(800)
  console.log('после тапа по обрезанному:', JSON.stringify(await read()))
  await page.screenshot({path:`${OUT}/w_edge_tap.png`, clip:{x:0,y:Math.max(0,pxbox.y-60),width:360,height:260}}) }
await browser.close()
