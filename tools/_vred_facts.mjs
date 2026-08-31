import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const URL = 'http://localhost:4321'
const browser = await chromium.launch()

const probe = `(() => {
  const out = []
  const tables = [...document.querySelectorAll('.report-facts')]
  tables.forEach((t, ti) => {
    const card = t.closest('.card')
    const head = card && card.querySelector('h2')
    ;[...t.querySelectorAll('tr')].forEach((tr) => {
      const tds = tr.querySelectorAll('td')
      if (tds.length < 2) return
      const [a, b] = tds
      const lines = (el) => {
        const r = document.createRange(); r.selectNodeContents(el)
        const rects = [...r.getClientRects()].filter(x => x.width > 0.5 && x.height > 0.5)
        const rows = []
        rects.forEach(x => {
          const hit = rows.find(y => Math.abs(y.top - x.top) < 3)
          if (hit) { hit.left = Math.min(hit.left, x.left); hit.right = Math.max(hit.right, x.right) }
          else rows.push({ top: x.top, left: x.left, right: x.right })
        })
        return rows.sort((p,q)=>p.top-q.top)
      }
      // текст по строкам: пройти по символам через Range
      const textLines = (el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        const res = []
        let cur = null
        let n
        while ((n = walker.nextNode())) {
          const s = n.textContent
          for (let i = 0; i < s.length; i++) {
            const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1)
            const rect = r.getBoundingClientRect()
            if (!rect.width && !rect.height) continue
            if (!cur || Math.abs(cur.top - rect.top) > 3) { cur = { top: rect.top, s: '' }; res.push(cur) }
            cur.s += s[i]
          }
        }
        return res.map(x => x.s)
      }
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect()
      const brokenAtomics = [...b.querySelectorAll('b, .nowrap')].map(e => {
        const rects = [...e.getClientRects()].filter(x=>x.width>0.5)
        const tops = new Set(rects.map(x=>Math.round(x.top)))
        return { t: e.textContent.trim(), lines: tops.size }
      })
      out.push({
        card: head ? head.textContent.trim() : '?',
        label: a.textContent.trim(),
        labelW: Math.round(ar.width), valueW: Math.round(br.width),
        labelLines: lines(a).length, valueLines: lines(b).length,
        valueText: textLines(b),
        rowH: Math.round(tr.getBoundingClientRect().height),
        atomics: brokenAtomics,
      })
    })
  })
  return {
    root: getComputedStyle(document.documentElement).fontSize,
    docH: Math.round(document.documentElement.scrollHeight),
    scrollW: Math.round(document.documentElement.scrollWidth),
    clientW: document.documentElement.clientWidth,
    rows: out,
  }
})()`

const variants = {
  base: '',
  fix: `.report-facts td:first-child{width:auto;max-width:14ch}.report-facts td{hyphens:auto}`,
  fixBlock: `.report-facts td:first-child{width:auto;max-width:14ch}.report-facts td{hyphens:auto}.report-facts tr,.report-facts td{display:block}`,
}

for (const scale of ['normal', 'xlarge']) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 900 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s; cur.trackGlucose = true; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close(); localStorage.setItem('textScale', s)
  }, scale)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(600)
  await go(page, { tool: 'Отчёт' })
  await page.waitForTimeout(600)

  for (const [name, css] of Object.entries(variants)) {
    await page.evaluate((c) => {
      let el = document.getElementById('__probe')
      if (!el) { el = document.createElement('style'); el.id = '__probe'; document.head.appendChild(el) }
      el.textContent = c
    }, css)
    await page.waitForTimeout(200)
    const m = await page.evaluate(probe)
    console.log(`\n########## scale=${scale} variant=${name} root=${m.root} docH=${m.docH} scrollW=${m.scrollW}/${m.clientW}`)
    for (const r of m.rows) {
      const bad = r.atomics.filter(a => a.lines > 1)
      console.log(`  [${r.card}] "${r.label}" L=${r.labelW}px(${r.labelLines}стр) V=${r.valueW}px(${r.valueLines}стр) h=${r.rowH}${bad.length ? '  РАЗОРВАНО:' + JSON.stringify(bad) : ''}`)
      r.valueText.forEach((t, i) => console.log(`        ${i+1}| ${t}`))
    }
  }
  await ctx.close()
}
await browser.close()
