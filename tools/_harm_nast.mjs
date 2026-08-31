import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = process.env.U || 'http://localhost:5244'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const res = {}
for (const [scale, scheme] of [['normal','dark'],['normal','light'],['xlarge','dark']]) {
  const ctx = await browser.newContext({ viewport:{width:360,height:800}, locale:'ru-RU', timezoneId:'Europe/Moscow', colorScheme:scheme, deviceScaleFactor:2, ignoreHTTPSErrors:true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil:'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res,rej)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
    const cur = await new Promise((res)=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>res(q.result||{})})
    cur.textScale=s; cur.onboarded=true; cur.theme='auto'
    await new Promise((res,rej)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})
    db.close(); if(s==='normal') localStorage.removeItem('textScale'); else localStorage.setItem('textScale',s)
  }, scale)
  await page.reload({ waitUntil:'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout:20000 })
  await page.waitForTimeout(500)
  await go(page, { tool:'Настройки' })
  await page.waitForTimeout(400)

  const m = await page.evaluate(() => {
    const cards=[...document.querySelectorAll('.card')]
    const card=cards.find(c=>c.querySelector('h2')?.textContent.trim()==='Оформление')
    if(!card) return {err:'no card'}
    const px=(el,p)=>getComputedStyle(el)[p]
    const rows=[]
    card.querySelectorAll('.tile__label').forEach(l=>{
      const seg=l.nextElementSibling
      const lr=l.getBoundingClientRect(), sr=seg?seg.getBoundingClientRect():null
      const btn=seg?seg.querySelector('button'):null
      rows.push({
        label:l.textContent.trim(),
        labelPx:px(l,'fontSize'), labelW:px(l,'fontWeight'), labelC:px(l,'color'),
        labelInsideBox:false,
        segTag:seg?seg.className:null,
        segBorder:seg?px(seg,'borderTopWidth')+' '+px(seg,'borderTopColor'):null,
        gapLabelToBox: sr? +(sr.top-lr.bottom).toFixed(1):null,
        groupRole: seg?seg.getAttribute('role'):null,
        groupName: seg?seg.getAttribute('aria-label'):null,
        btnPx: btn?px(btn,'fontSize'):null, btnW: btn?px(btn,'fontWeight'):null, btnC: btn?px(btn,'color'):null,
        btnH: btn? +btn.getBoundingClientRect().height.toFixed(1):null,
      })
    })
    // ступени размеров внутри карточки
    const sizes=new Set()
    card.querySelectorAll('*').forEach(e=>{ if(e.textContent && e.children.length===0 && e.textContent.trim()) sizes.add(getComputedStyle(e).fontSize+'/'+getComputedStyle(e).fontWeight) })
    const sample=card.querySelector('.sample')
    return { rows, steps:[...sizes].sort(), rootFs:getComputedStyle(document.documentElement).fontSize,
      sampleTexts: sample? [...sample.children].map(c=>({t:c.textContent.trim().slice(0,40), fs:getComputedStyle(c).fontSize, fw:getComputedStyle(c).fontWeight})) : null,
      cardTop: +card.getBoundingClientRect().top.toFixed(0),
      docH: document.documentElement.scrollHeight }
  })
  res[scale+'_'+scheme]=m
  const card = page.locator('.card').filter({ has: page.locator('h2', { hasText: 'Оформление' }) })
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  await card.screenshot({ path:`${OUT}/_harm_ofm_${scale}_${scheme}.png` })
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(res,null,1))
