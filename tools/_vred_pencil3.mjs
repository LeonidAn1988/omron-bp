import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:5199'
const browser = await chromium.launch()

for (const w of [320, 375, 412]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light',
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async (now) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const put = (s, v, k) => new Promise((res, rej) => { const tx = db.transaction(s,'readwrite'); const os = tx.objectStore(s); k===undefined?os.put(v):os.put(v,k); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    await put('readings', { id: 'nl', kind: 'bp', ts: now - 3600_000, user: 1, source: 'manual', sys: 139, dia: 88, bpm: 74, ihb: true, mov: true, arm: 'left', note: 'После подъёма по лестнице, принял амлодипин на час позже обычного, кружилась голова' })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = 'xlarge'; cur.onboarded = true; cur.density = 'roomy'
    await put('meta', cur, 'settings'); db.close()
    localStorage.setItem('textScale','xlarge'); localStorage.setItem('density','roomy')
  }, FROZEN)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(500)
  await go(page, { tab: 'Давление' })
  await page.waitForTimeout(500)

  const res = await page.evaluate(() => {
    const hits = { text: 0, pencil: 0, trash: 0, other: 0 }
    const samples = []
    const rows = [...document.querySelectorAll('.readings-table tbody tr:not([data-editor])')]
    for (const tr of rows) {
      tr.scrollIntoView({ block: 'center' })
      for (const col of ['when','val','cat','bpm','marks','note']) {
        const cell = tr.querySelector(`td[data-col='${col}']`)
        if (!cell) continue
        // проходим по каждому текстовому узлу, по 8 точек на строку
        const walk = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT)
        let n
        while ((n = walk.nextNode())) {
          if (!n.textContent.trim()) continue
          const r = document.createRange(); r.selectNode(n)
          for (const rect of r.getClientRects()) {
            if (rect.width < 2 || rect.bottom < 0 || rect.top > innerHeight) continue
            for (let i = 0; i <= 8; i++) {
              const x = rect.left + (rect.width - 1) * (i / 8)
              const y = (rect.top + rect.bottom) / 2
              if (y < 0 || y > innerHeight - 1) continue
              const el = document.elementFromPoint(Math.min(x, innerWidth - 1), y)
              if (!el) continue
              const btn = el.closest('button')
              if (!btn) hits.text++
              else if (btn.classList.contains('row-edit')) { hits.pencil++; samples.push({ col, word: n.textContent.trim().slice(0,30), x: Math.round(x), btn: 'карандаш' }) }
              else if (btn.classList.contains('btn--icon')) { hits.trash++; samples.push({ col, word: n.textContent.trim().slice(0,30), x: Math.round(x), btn: 'КОРЗИНА' }) }
              else hits.other++
            }
          }
        }
      }
    }
    return { hits, samples: samples.slice(0, 12), totalSamples: hits.text + hits.pencil + hits.trash + hits.other, rows: rows.length }
  })
  console.log(`\n### w=${w}, xlarge, просторно — ${res.rows} строк, ${res.totalSamples} проб по буквам`)
  console.log('   попаданий:', JSON.stringify(res.hits))
  if (res.samples.length) { console.log('   где текст перехвачен кнопкой:'); for (const s of res.samples) console.log('    ', s.btn, '|', s.col, '|', JSON.stringify(s.word), '| x=', s.x) }
  await ctx.close()
}
await browser.close()
