/** Решающая проверка: двойное касание по «Удалить» — стирает ли препарат. */
import { chromium } from 'playwright'
const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()

async function seed(page, now, scale, density) {
  await page.evaluate(async ([now, scale, density]) => {
    const DAY = 86400000
    const midnight = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime() }
    const day0 = midnight(now); const at = (o,h)=>day0+o*DAY+h*3600000
    const marks = []; for(let i=-20;i<=0;i++){ if(i!==-5) marks.push(at(i,8)); if(i<0&&i!==-12) marks.push(at(i,20)) }
    const medicines = [
      { id:'m1', name:'Конкор', dose:'5 мг', inn:'Бисопролол', form:'Таблетки, покрытые пленочной оболочкой',
        maker:'Мерк КГаА', packSize:30, left:12, perDay:null, expires:Date.UTC(2027,4,31),
        times:['08:00','20:00'], perTime:1, meal:'after', taken:marks, leftAt: now-3*DAY },
      { id:'m4', name:'Лозартан', dose:'50 мг', inn:'Лозартан', form:'Таблетки', maker:'Озон',
        packSize:30, left:25, perDay:null, expires:Date.UTC(2027,7,31), times:['21:00'], perTime:1, taken:[] },
    ]
    const db = await new Promise((res,rej)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
    await new Promise((res,rej)=>{
      const tx=db.transaction(['medicines','meta'],'readwrite')
      medicines.forEach(m=>tx.objectStore('medicines').put(m))
      tx.objectStore('meta').put({onboarded:true,textScale:scale,density},'settings')
      tx.oncomplete=res; tx.onerror=()=>rej(tx.error)
    })
    db.close()
  }, [now, scale, density])
}
const countMeds = (page) => page.evaluate(async () => {
  const db = await new Promise((res,rej)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
  const names = await new Promise((res,rej)=>{const tx=db.transaction('medicines','readonly');const q=tx.objectStore('medicines').getAll();q.onsuccess=()=>res(q.result.map(m=>m.name));q.onerror=()=>rej(q.error)})
  db.close(); return names
})

const browser = await chromium.launch()
const rows = []
for (const [scale, density] of [['normal','normal'],['large','normal'],['xlarge','normal'],['normal','roomy'],['xlarge','roomy'],['normal','compact']]) {
for (const gap of [120, 250, 400]) {
  const ctx = await browser.newContext({ viewport:{width:375,height:812}, locale:'ru-RU', timezoneId:'Europe/Moscow', hasTouch:true, isMobile:true, deviceScaleFactor:1 })
  const page = await ctx.newPage()
  await page.clock.install({ time:new Date(FROZEN) })
  await page.goto(URL,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(700)
  await seed(page, FROZEN, scale, density)
  await page.reload({waitUntil:'domcontentloaded'})
  await page.waitForSelector('nav.tabs',{timeout:20000})
  await page.locator('nav.tabs button',{hasText:'Аптечка'}).first().click(); await page.waitForTimeout(300)
  await page.locator('.pills button, .pills a').filter({hasText:'Конкор'}).first().click(); await page.waitForTimeout(300)

  // ставим кнопку в середину экрана — как человек, который её видит
  const del = page.locator('button.btn--danger', { hasText:'Удалить' }).first()
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button.btn--danger')].find(b=>b.innerText.trim()==='Удалить')
    const r = b.getBoundingClientRect()
    window.scrollBy(0, r.top + r.height/2 - innerHeight/2)
  })
  await page.waitForTimeout(250)
  const bb = await del.boundingBox()
  const x = +(bb.x + bb.width/2).toFixed(1), y = +(bb.y + bb.height/2).toFixed(1)
  const scrollBefore = await page.evaluate(()=>Math.round(scrollY))

  // ДВА настоящих касания по одной точке
  await page.touchscreen.tap(x, y)
  await page.waitForTimeout(gap)
  const mid = await page.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);const b=e&&e.closest('button,a');return {under:b?b.innerText.trim():(e?e.tagName:null), sy:Math.round(scrollY)}},[x,y])
  await page.touchscreen.tap(x, y)
  await page.waitForTimeout(600)

  const names = await countMeds(page)
  const body = (await page.evaluate(()=>document.body.innerText)).slice(0,160).replace(/\s+/g,' ')
  rows.push({ scale, density, gap, tap:[x,y], scrollBefore, underAfter1: mid.under, scrollAfter1: mid.sy,
    konkorGone: !names.includes('Конкор'), names, screen: body.slice(0,80) })
  await ctx.close()
}}
await browser.close()
for (const r of rows) console.log(`${r.scale}/${r.density} пауза ${r.gap}мс  тап(${r.tap})  после 1-го под пальцем: «${r.underAfter1}»  скролл ${r.scrollBefore}->${r.scrollAfter1}  КОНКОР УДАЛЁН: ${r.konkorGone}  осталось: ${r.names.join('|')}`)
console.log('\nУдалено двойным касанием:', rows.filter(r=>r.konkorGone).length, 'из', rows.length)
