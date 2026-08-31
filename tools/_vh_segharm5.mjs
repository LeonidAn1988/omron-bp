import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = 'http://localhost:4399'
const browser = await chromium.launch()
async function prep({ width, scale, density }) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000); await seed(page, FROZEN)
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  await page.evaluate(async ({s,d}) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp',3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
    const cur = await new Promise((res)=>{ const tx=db.transaction('meta','readonly'); const q=tx.objectStore('meta').get('settings'); q.onsuccess=()=>res(q.result||{}) })
    cur.textScale=s; cur.density=d; cur.theme='dark'; cur.trackGlucose=true
    await new Promise((res,rej)=>{ const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
    db.close()
  }, {s:scale,d:density})
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  return { ctx, page }
}
const HIT = (label) => {
  const g = [...document.querySelectorAll('.segmented--fill')].find((x) => x.getAttribute('aria-label') === label)
  if (!g) return null
  return [...g.querySelectorAll('button')].map((b) => {
    const node = [...b.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
    const text = node.textContent; const vis=[],hid=[]
    for (let i=0;i<text.length;i++){ const rg=document.createRange(); rg.setStart(node,i); rg.setEnd(node,i+1)
      const cr=rg.getBoundingClientRect(); if(!cr.width){vis.push(text[i]);continue}
      const cx=cr.left+cr.width*0.75, cy=(cr.top+cr.bottom)/2
      if (cy<0||cy>innerHeight) { hid.push('?'); continue }
      const top=document.elementFromPoint(cx,cy); (top===b||b.contains(top))?vis.push(text[i]):hid.push(text[i]) }
    return `${b.textContent.trim()} -> "${vis.join('')}" (срезано: "${hid.join('')}")${b.getAttribute('aria-pressed')==='true'?' [ВЫБРАНО]':''}`
  })
}
for (const cfg of [
  { width: 375, scale: 'normal', density: 'normal' },
  { width: 375, scale: 'large', density: 'normal' },
  { width: 412, scale: 'xlarge', density: 'roomy' },
]) {
  const { ctx, page } = await prep(cfg)
  await go(page, { tool: 'Настройки' })
  console.log(`\n=== ${cfg.width}px / text=${cfg.scale} / density=${cfg.density}`)
  for (const label of ['Стартовый экран','Размер текста','Плотность вёрстки']) {
    await page.evaluate((l)=>[...document.querySelectorAll('.segmented--fill')].find((x)=>x.getAttribute('aria-label')===l).scrollIntoView({block:'center'}), label)
    await page.waitForTimeout(200)
    console.log(' ', label, JSON.stringify(await page.evaluate(HIT, label), null, 0))
  }
  await page.locator('header button', { hasText: 'Настройки' }).first().click(); await page.waitForTimeout(200)
  await go(page, { tab: 'Аптечка' })
  await page.evaluate(()=>document.querySelector('.segmented--fill').scrollIntoView({block:'center'})); await page.waitForTimeout(200)
  console.log('  Фильтр', JSON.stringify(await page.evaluate(HIT,'Что показывать'), null, 0))
  await ctx.close()
}
await browser.close()
