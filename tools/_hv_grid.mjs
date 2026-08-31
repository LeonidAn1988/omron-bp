import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4399'
const browser = await chromium.launch()

async function prep(width, scale, density) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await seed(page, FROZEN)
  await page.evaluate(([s,d]) => { localStorage.setItem('textScale', s); localStorage.setItem('density', d) }, [scale, density])
  await page.evaluate(async ([s,d]) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp',3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
    const cur = await new Promise((res)=>{ const tx=db.transaction('meta','readonly'); const q=tx.objectStore('meta').get('settings'); q.onsuccess=()=>res(q.result||{}) })
    cur.textScale = s; cur.density = d; cur.trackGlucose = true; cur.onboarded = true
    await new Promise((res,rej)=>{ const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
    db.close()
  }, [scale, density])
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  return { ctx, page }
}

const PROBE = () => {
  const g = document.querySelector('.segmented.no-print')
  const vw = document.documentElement.clientWidth
  if (!g) return { missing: true, vw }
  const gr = g.getBoundingClientRect()
  const row = g.parentElement
  const rr = row.getBoundingClientRect()
  const btns = [...g.querySelectorAll('button')].map(b => {
    const r = b.getBoundingClientRect()
    return { t: b.textContent.trim(), left: +r.left.toFixed(1), right: +r.right.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), over: +(r.right - vw).toFixed(1) }
  })
  return {
    vw,
    rootFont: getComputedStyle(document.documentElement).fontSize,
    contL: +rr.left.toFixed(1), contR: +rr.right.toFixed(1), contW: +rr.width.toFixed(1),
    groupW: +gr.width.toFixed(1), groupL: +gr.left.toFixed(1), groupR: +gr.right.toFixed(1),
    overflowVsContainer: +(gr.right - rr.right).toFixed(1),
    offScreen: +(gr.right - vw).toFixed(1),
    docScrollW: document.documentElement.scrollWidth,
    docClientW: document.documentElement.clientWidth,
    scrollsX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    innerWidth: window.innerWidth,
    vvScale: window.visualViewport ? window.visualViewport.scale : null,
    vvWidth: window.visualViewport ? +window.visualViewport.width.toFixed(1) : null,
    btns,
  }
}

const CLIPPED_TEXT = () => {
  const vw = document.documentElement.clientWidth
  const bad = []
  const walk = (n) => {
    if (n.nodeType === 3 && n.textContent.trim()) {
      const rg = document.createRange(); rg.selectNodeContents(n)
      for (const r of rg.getClientRects()) {
        if (r.width > 0 && r.right > vw + 0.5) {
          const p = n.parentElement
          bad.push({ txt: n.textContent.trim().slice(0,45), right: +r.right.toFixed(1), inSeg: !!(p && p.closest('.segmented')) })
        }
      }
    } else n.childNodes?.forEach(walk)
  }
  walk(document.body)
  return bad
}

const rows = []
for (const width of [360, 375]) {
  for (const scale of ['small','normal','large','xlarge']) {
    for (const density of ['compact','normal','roomy']) {
      const { ctx, page } = await prep(width, scale, density)
      await go(page, { tool: 'Отчёт' }); await page.waitForTimeout(350)
      const p = await page.evaluate(PROBE)
      const clipped = await page.evaluate(CLIPPED_TEXT)
      rows.push({ width, scale, density, ...p, clippedTexts: clipped })
      await ctx.close()
    }
  }
}
console.log(JSON.stringify(rows, null, 1))
await browser.close()
