import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = 'http://localhost:4399'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

async function prep({ width = 375, scale = 'xlarge', density = 'roomy', theme = 'dark' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: theme, deviceScaleFactor: 3, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200); await seed(page, FROZEN)
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  await page.evaluate(async ({ s, d, t }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp',3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
    const cur = await new Promise((res)=>{ const tx=db.transaction('meta','readonly'); const q=tx.objectStore('meta').get('settings'); q.onsuccess=()=>res(q.result||{}) })
    cur.textScale = s; cur.density = d; cur.theme = t; cur.trackGlucose = true
    await new Promise((res,rej)=>{ const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
    db.close()
  }, { s: scale, d: density, t: theme })
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  return { ctx, page }
}

const HIT = (label) => {
  const g = [...document.querySelectorAll('.segmented--fill')].find((x) => x.getAttribute('aria-label') === label)
  if (!g) return { missing: true }
  const btns = [...g.querySelectorAll('button')].map((b) => {
    const cs = getComputedStyle(b)
    const node = [...b.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
    const text = node ? node.textContent : ''
    const vis = [], hid = []
    for (let i = 0; i < text.length; i++) {
      const rg = document.createRange(); rg.setStart(node, i); rg.setEnd(node, i+1)
      const cr = rg.getBoundingClientRect()
      if (!cr.width) { vis.push(text[i]); continue }
      const cx = (cr.left + cr.right)/2, cy = (cr.top + cr.bottom)/2
      const top = document.elementFromPoint(cx, cy)
      const inView = cy > 0 && cy < innerHeight && cx > 0 && cx < innerWidth
      if (!inView) { hid.push('?' + text[i]); continue }
      if (top === b || b.contains(top)) vis.push(text[i]); else hid.push(text[i])
    }
    return { text: b.textContent.trim(), pressed: b.getAttribute('aria-pressed'),
      visible: vis.join(''), covered: hid.join(''), align: cs.textAlign,
      name: b.textContent.trim(), tap: [+(b.getBoundingClientRect().width).toFixed(0), +(b.getBoundingClientRect().height).toFixed(0)] }
  })
  const r = g.getBoundingClientRect()
  return { label, btns, box: { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: Math.min(innerWidth, r.width + 16), height: r.height + 16 } }
}

const cfg = { key: 'xl-roomy-375', scale: 'xlarge', density: 'roomy', width: 375 }
const { ctx, page } = await prep(cfg)
await go(page, { tool: 'Настройки' })

const report = {}
for (const label of ['Стартовый экран', 'Тема оформления', 'Размер текста', 'Плотность вёрстки']) {
  await page.evaluate((l) => {
    const g = [...document.querySelectorAll('.segmented--fill')].find((x) => x.getAttribute('aria-label') === l)
    g.scrollIntoView({ block: 'center' })
  }, label)
  await page.waitForTimeout(250)
  const res = await page.evaluate(HIT, label)
  report[label] = res.btns
  await page.screenshot({ path: `${OUT}/seg_${label.split(' ')[0]}.png`, clip: res.box })
}

// Аптечка
await page.locator('header button', { hasText: 'Настройки' }).first().click()
await page.waitForTimeout(200)
await go(page, { tab: 'Аптечка' })
await page.evaluate(() => document.querySelector('.segmented--fill').scrollIntoView({ block: 'center' }))
await page.waitForTimeout(250)
const cab = await page.evaluate(HIT, 'Что показывать')
report['Что показывать'] = cab.btns
await page.screenshot({ path: `${OUT}/seg_filter.png`, clip: cab.box })

console.log(JSON.stringify(report, null, 1))
await browser.close()
