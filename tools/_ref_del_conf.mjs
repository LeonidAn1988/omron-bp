import { chromium } from 'playwright'
const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()

async function seed(page, now, scale, density) {
  await page.evaluate(async ([now, scale, density]) => {
    const DAY = 86400000
    const midnight = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime() }
    const day0 = midnight(now)
    const at = (o,h) => day0 + o*DAY + h*3600000
    const marks = []
    for (let i=-20;i<=0;i++){ if(i!==-5) marks.push(at(i,8)); if(i<0&&i!==-12) marks.push(at(i,20)) }
    const medicines = [
      { id:'m1', name:'Конкор', dose:'5 мг', inn:'Бисопролол', form:'Таблетки, покрытые пленочной оболочкой',
        maker:'Мерк КГаА', packSize:30, left:12, perDay:null, expires:Date.UTC(2027,4,31),
        times:['08:00','20:00'], perTime:1, meal:'after', taken:marks, leftAt: now-3*DAY },
      { id:'m4', name:'Лозартан', dose:'50 мг', inn:'Лозартан', form:'Таблетки', maker:'Озон',
        packSize:30, left:25, perDay:null, expires:Date.UTC(2027,7,31), times:['21:00'], perTime:1, taken:[] },
    ]
    const db = await new Promise((res,rej)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
    await new Promise((res,rej)=>{
      const tx = db.transaction(['medicines','meta'],'readwrite')
      medicines.forEach(m=>tx.objectStore('medicines').put(m))
      tx.objectStore('meta').put({ onboarded:true, textScale:scale, density }, 'settings')
      tx.oncomplete=res; tx.onerror=()=>rej(tx.error)
    })
    db.close()
  }, [now, scale, density])
}

const R = (b) => b ? { x:+b.x.toFixed(1), y:+b.y.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1) } : null

const browser = await chromium.launch()
const out = []
for (const width of [320, 360, 375, 390, 412, 430]) {
for (const scale of ['normal','large','xlarge']) {
for (const density of ['compact','normal','roomy']) {
  const ctx = await browser.newContext({ viewport:{width,height:900}, locale:'ru-RU', timezoneId:'Europe/Moscow', hasTouch:true, isMobile:true, deviceScaleFactor:1 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil:'domcontentloaded' })
  await page.waitForTimeout(700)
  await seed(page, FROZEN, scale, density)
  await page.reload({ waitUntil:'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout:20000 })
  await page.locator('nav.tabs button', { hasText:'Аптечка' }).first().click()
  await page.waitForTimeout(300)
  await page.locator('.pills li button, .pills button').filter({ hasText:'Конкор' }).first().click()
  await page.waitForTimeout(300)

  const del = page.locator('button.btn--danger', { hasText:'Удалить' }).first()
  await del.scrollIntoViewIfNeeded()
  await page.waitForTimeout(150)
  const before = R(await del.boundingBox())
  // что лежит в центре кнопки "Удалить"
  const cx = before.x + before.w/2, cy = before.y + before.h/2
  const hitBefore = await page.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return e?(e.closest('button,a')?.innerText||e.tagName):null},[cx,cy])

  await del.click()
  await page.waitForTimeout(250)
  const conf = page.locator('button.btn--danger', { hasText:'Удалить насовсем' }).first()
  const after = R(await conf.boundingBox())
  const hitAfter = await page.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return e?(e.closest('button,a')?.innerText||e.tagName):null},[cx,cy])

  const sameX = Math.abs(before.x-after.x) < 0.5
  const sameY = Math.abs(before.y-after.y) < 0.5
  const overlaps = hitAfter && hitAfter.includes('насовсем')
  out.push({ width, scale, density, before, after, sameX, sameY, hitBefore, hitAfter, overlaps })
  await ctx.close()
}}}
await browser.close()
console.log(JSON.stringify(out, null, 1))
const bad = out.filter(o=>o.overlaps)
console.log('\nПЕРЕКРЫТИЕ (подтверждение под пальцем):', bad.length, 'из', out.length)
for (const o of out) console.log(`${o.width} ${o.scale}/${o.density}  Удалить ${o.before.x},${o.before.y} ${o.before.w}x${o.before.h}  ->  насовсем ${o.after.x},${o.after.y} ${o.after.w}x${o.after.h}  sameXY=${o.sameX&&o.sameY}  подПальцем=${o.hitAfter}`)
