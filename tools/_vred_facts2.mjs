import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

const probe = `(() => {
  const out = []
  ;[...document.querySelectorAll('.report-facts')].forEach((t) => {
    const card = t.closest('.card'); const head = card && card.querySelector('h2')
    ;[...t.querySelectorAll('tr')].forEach((tr) => {
      const tds = tr.querySelectorAll('td'); if (tds.length < 2) return
      const [a, b] = tds
      const atomics = [...b.querySelectorAll('b, .nowrap')].map(e => {
        const rects = [...e.getClientRects()].filter(x=>x.width>0.5)
        return { t: e.textContent.trim(), lines: new Set(rects.map(x=>Math.round(x.top))).size, w: Math.round(Math.max(...rects.map(x=>x.width))) }
      })
      const lines = (el) => { const r=document.createRange(); r.selectNodeContents(el)
        const rects=[...r.getClientRects()].filter(x=>x.width>0.5&&x.height>0.5)
        return new Set(rects.map(x=>Math.round(x.top))).size }
      out.push({ card: head?head.textContent.trim():'?', label: a.textContent.trim(),
        labelW: Math.round(a.getBoundingClientRect().width), valueW: Math.round(b.getBoundingClientRect().width),
        labelLines: lines(a), valueLines: lines(b),
        broken: atomics.filter(x=>x.lines>1), atomics })
    })
  })
  return { root: getComputedStyle(document.documentElement).fontSize,
    scrollW: Math.round(document.documentElement.scrollWidth), clientW: document.documentElement.clientWidth, rows: out }
})()`

// экстремальные значения: 3 знака в САД и ДАД, длинная категория
const extreme = async (page) => {
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
    const names = [...db.objectStoreNames]
    console.log('stores', names.join(','))
    db.close()
  })
}

for (const [w, scale, tag] of [[320,'xlarge','узкий+очень крупный'],[360,'xlarge','360+очень крупный'],[390,'normal','390+обычный']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
    const cur = await new Promise((res) => { const tx=db.transaction('meta','readonly'); const q=tx.objectStore('meta').get('settings'); q.onsuccess=()=>res(q.result||{}) })
    cur.textScale = s; cur.trackGlucose = true; cur.onboarded = true
    await new Promise((res, rej) => { const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
    db.close(); localStorage.setItem('textScale', s)
  }, scale)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(500)
  await go(page, { tool: 'Отчёт' })
  await page.waitForTimeout(500)
  const m = await page.evaluate(probe)
  console.log(`\n##### ЭКРАН ${w}px / ${scale} (${tag}) root=${m.root} scrollW=${m.scrollW}/${m.clientW}`)
  const bad = m.rows.filter(r => r.broken.length)
  console.log('  разорванных неразрывных кусков:', bad.length)
  bad.forEach(r => console.log('   !!', r.label, JSON.stringify(r.broken)))
  const maxAtom = Math.max(...m.rows.flatMap(r => r.atomics.map(a => a.w)))
  console.log('  самый широкий неразрывный кусок:', maxAtom, 'px, колонка значения:', m.rows[0].valueW, 'px')
  m.rows.filter(r=>r.atomics.length).slice(0,4).forEach(r=>console.log('   ', r.label, '→', JSON.stringify(r.atomics)))

  // печать
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(300)
  const p = await page.evaluate(probe)
  const pbad = p.rows.filter(r => r.broken.length)
  console.log(`  --- ПЕЧАТЬ: root=${p.root} scrollW=${p.scrollW}/${p.clientW} разорвано=${pbad.length}`)
  p.rows.slice(0,8).forEach(r => console.log(`      "${r.label}" L=${r.labelW}(${r.labelLines}стр) V=${r.valueW}(${r.valueLines}стр)`))
  await page.emulateMedia({ media: 'screen' })
  await ctx.close()
}
await browser.close()
