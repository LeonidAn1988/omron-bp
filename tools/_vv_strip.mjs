import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = 'http://localhost:4477'
const browser = await chromium.launch()

async function prep(width, scale, density) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200); await seed(page, FROZEN)
  await page.evaluate(async ([s, d]) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp',3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
    const cur = await new Promise((res)=>{ const tx=db.transaction('meta','readonly'); const q=tx.objectStore('meta').get('settings'); q.onsuccess=()=>res(q.result||{}) })
    cur.textScale = s; cur.density = d; cur.onboarded = true
    await new Promise((res,rej)=>{ const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
    db.close()
  }, [scale, density])
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  return { ctx, page }
}

const PROBE = () => {
  const strip = document.querySelector('.stats-strip')
  if (!strip) return { missing: true }
  const sr = strip.getBoundingClientRect()
  const cs = getComputedStyle(strip)
  const cells = [...strip.children].map((c) => {
    const label = c.querySelector('.tile__label')
    const value = c.querySelector('.tile__value')
    const note = c.querySelector('.tile__note')
    const lr = label.getBoundingClientRect()
    const vr = value.getBoundingClientRect()
    const cr = c.getBoundingClientRect()
    // число строк подписи
    const lineH = parseFloat(getComputedStyle(label).lineHeight)
    const lines = Math.round(lr.height / lineH)
    // диапазон текстовых прямоугольников для подписи (реальный перенос)
    const rects = [...label.getClientRects()]
    return {
      label: label.textContent.trim(),
      value: value.textContent.trim(),
      note: note ? note.textContent.trim() : null,
      cellX: +cr.left.toFixed(1), cellY: +cr.top.toFixed(1),
      cellW: +cr.width.toFixed(1), cellH: +cr.height.toFixed(1),
      labelH: +lr.height.toFixed(1), labelLines: lines, labelLineH: +lineH.toFixed(1),
      valueTop: +vr.top.toFixed(1), valueBottom: +vr.bottom.toFixed(1),
      valueLeft: +vr.left.toFixed(1),
      labelTop: +lr.top.toFixed(1),
      labelBottom: +lr.bottom.toFixed(1),
      // отступ от подписи до своей цифры
      labelToValue: +(vr.top - lr.bottom).toFixed(1),
    }
  })
  return {
    vw: document.documentElement.clientWidth,
    rootFont: getComputedStyle(document.documentElement).fontSize,
    dataText: document.documentElement.getAttribute('data-text'),
    dataDensity: document.documentElement.getAttribute('data-density'),
    stripW: +sr.width.toFixed(1), stripH: +sr.height.toFixed(1),
    cols: cs.gridTemplateColumns,
    colCount: cs.gridTemplateColumns.split(' ').length,
    pageScrollsX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    cells,
  }
}

const out = {}
for (const [scale, density] of [['normal','normal'], ['xlarge','roomy'], ['xlarge','normal'], ['large','roomy']]) {
  for (const width of [320, 360, 390, 406, 430, 768, 1280]) {
    const { ctx, page } = await prep(width, scale, density)
    await go(page, { tab: 'Обзор' }); await page.waitForTimeout(300)
    out[`${scale}/${density}@${width}`] = await page.evaluate(PROBE)
    await ctx.close()
  }
}
console.log(JSON.stringify(out, null, 1))
await browser.close()
