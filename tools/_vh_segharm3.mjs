import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = 'http://localhost:4399'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

async function prep({ width, scale, density, theme = 'dark' }) {
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

const CLIPVIEW = (label) => {
  const g = [...document.querySelectorAll('.segmented--fill')].find((x) => x.getAttribute('aria-label') === label)
  if (!g) return null
  const gr = g.getBoundingClientRect()
  const vw = document.documentElement.clientWidth
  const btns = [...g.querySelectorAll('button')].map((b) => {
    const node = [...b.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
    const rg = document.createRange(); rg.selectNodeContents(node)
    const rects = [...rg.getClientRects()]
    const inkR = Math.max(...rects.map(x => x.right))
    return { text: b.textContent.trim(), inkRight: +inkR.toFixed(1), pastViewport: +(inkR - vw).toFixed(1) }
  })
  return { vw, groupRight: +gr.right.toFixed(1),
    docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth,
    xScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    btns, y: gr.top - 10, h: gr.height + 20 }
}

const out = {}
for (const cfg of [
  { key: 'w320-xl-roomy', width: 320, scale: 'xlarge', density: 'roomy' },
  { key: 'w375-xl-roomy', width: 375, scale: 'xlarge', density: 'roomy' },
]) {
  const { ctx, page } = await prep(cfg)
  await go(page, { tool: 'Настройки' })
  out[cfg.key] = {}
  for (const label of ['Стартовый экран', 'Размер текста', 'Плотность вёрстки']) {
    await page.evaluate((l) => [...document.querySelectorAll('.segmented--fill')].find((x)=>x.getAttribute('aria-label')===l).scrollIntoView({ block: 'center' }), label)
    await page.waitForTimeout(200)
    const r = await page.evaluate(CLIPVIEW, label)
    out[cfg.key][label] = r
    await page.screenshot({ path: `${OUT}/full_${cfg.key}_${label.split(' ')[0]}.png`, clip: { x: 0, y: Math.max(0, r.y), width: cfg.width, height: r.h } })
  }
  await page.locator('header button', { hasText: 'Настройки' }).first().click(); await page.waitForTimeout(200)
  await go(page, { tab: 'Аптечка' })
  await page.evaluate(() => document.querySelector('.segmented--fill').scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(200)
  const r = await page.evaluate(CLIPVIEW, 'Что показывать')
  out[cfg.key]['Что показывать'] = r
  await page.screenshot({ path: `${OUT}/full_${cfg.key}_filter.png`, clip: { x: 0, y: Math.max(0, r.y), width: cfg.width, height: r.h } })
  await ctx.close()
}
console.log(JSON.stringify(out, null, 1))
await browser.close()
