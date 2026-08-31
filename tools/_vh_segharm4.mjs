import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = 'http://localhost:4399'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 320, height: 900 }, locale: 'ru-RU',
  timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 3, hasTouch: true, isMobile: true })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200); await seed(page, FROZEN)
await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp',3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
  const cur = await new Promise((res)=>{ const tx=db.transaction('meta','readonly'); const q=tx.objectStore('meta').get('settings'); q.onsuccess=()=>res(q.result||{}) })
  cur.textScale='xlarge'; cur.density='roomy'; cur.theme='light'; cur.trackGlucose=true
  await new Promise((res,rej)=>{ const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)

const HIT = (label) => {
  const g = [...document.querySelectorAll('.segmented--fill')].find((x) => x.getAttribute('aria-label') === label)
  if (!g) return { missing: true }
  const btns = [...g.querySelectorAll('button')].map((b) => {
    const node = [...b.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
    const text = node ? node.textContent : ''
    const vis = [], hid = []
    for (let i = 0; i < text.length; i++) {
      const rg = document.createRange(); rg.setStart(node, i); rg.setEnd(node, i+1)
      const cr = rg.getBoundingClientRect(); if (!cr.width) { vis.push(text[i]); continue }
      // sample right 30% of the glyph, not the centre: partial clipping counts
      const cx = cr.left + cr.width * 0.8, cy = (cr.top + cr.bottom)/2
      const top = document.elementFromPoint(cx, cy)
      if (cy < 0 || cy > innerHeight) { hid.push('?'); continue }
      if (top === b || b.contains(top)) vis.push(text[i]); else hid.push(text[i])
    }
    return { text: b.textContent.trim(), pressed: b.getAttribute('aria-pressed'), visible: vis.join(''), covered: hid.join('') }
  })
  const r = g.getBoundingClientRect()
  return { btns, y: Math.max(0, r.top - 12), h: r.height + 24 }
}

// Давление -> Период
await go(page, { tab: 'Давление' })
await page.evaluate(() => document.querySelector('.segmented--fill').scrollIntoView({ block: 'center' }))
await page.waitForTimeout(250)
const per = await page.evaluate(HIT, 'Период')
console.log('ПЕРИОД:', JSON.stringify(per.btns))
await page.screenshot({ path: `${OUT}/light_period.png`, clip: { x: 0, y: per.y, width: 320, height: per.h } })

// Настройки: снимок карточки «Оформление» целиком (светлая тема)
await go(page, { tool: 'Настройки' })
const box = await page.evaluate(() => {
  const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.trim() === 'Оформление')
  const card = h.closest('.card'); card.scrollIntoView({ block: 'center' })
  return null
})
await page.waitForTimeout(300)
const b2 = await page.evaluate(() => {
  const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.trim() === 'Оформление')
  const r = h.closest('.card').getBoundingClientRect()
  return { x: 0, y: Math.max(0, r.top), width: 320, height: Math.min(r.height, innerHeight - Math.max(0, r.top)) }
})
await page.screenshot({ path: `${OUT}/light_oformlenie.png`, clip: b2 })
const sz = await page.evaluate(HIT, 'Размер текста')
console.log('РАЗМЕР (light 320, right-edge sampling):', JSON.stringify(sz.btns))
const st = await page.evaluate(HIT, 'Стартовый экран')
console.log('СТАРТ:', JSON.stringify(st.btns))
await browser.close()
