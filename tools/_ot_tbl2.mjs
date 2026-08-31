import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()
for (const [scale, vw] of [['normal',360],['xlarge',360],['normal',412]]) {
  const ctx = await browser.newContext({
    viewport: { width: vw, height: 800 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 3,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
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
  await page.waitForTimeout(400)
  await go(page, { tool: 'Отчёт' })
  await page.waitForTimeout(400)

  const m = await page.evaluate(() => {
    const res = []
    for (const w of document.querySelectorAll('.table-scroll')) {
      const tbl = w.querySelector('table')
      if (tbl.classList.contains('readings-table')) continue
      const title = w.closest('.card')?.querySelector('h2')?.textContent.trim()
      const cs = getComputedStyle(w)
      const padL = parseFloat(cs.paddingLeft)
      const wr = w.getBoundingClientRect()
      // окно просмотра = padding box: от border-left до border-left+clientWidth
      const winL = wr.left + parseFloat(cs.borderLeftWidth)
      const winR = winL + w.clientWidth
      const cols = [...tbl.querySelectorAll('thead th')].map((th) => {
        const r = th.getBoundingClientRect()
        return { th: th.textContent.trim(), w: +r.width.toFixed(1),
                 vis: +Math.max(0, Math.min(r.right, winR) - Math.max(r.left, winL)).toFixed(1) }
      })
      // текст последней ячейки первой строки
      const firstRow = tbl.querySelector('tbody tr')
      const cells = [...firstRow.querySelectorAll('td')].map(td=>td.textContent.trim())
      res.push({ title, clientWidth: w.clientWidth, scrollWidth: w.scrollWidth,
        tableWidth: +tbl.getBoundingClientRect().width.toFixed(1), padL,
        maxScrollLeft: w.scrollWidth - w.clientWidth, cols, firstRow: cells })
    }
    return { rootFont: getComputedStyle(document.documentElement).fontSize, innerWidth, res }
  })
  console.log(`==== scale=${scale} vw=${vw} root=${m.rootFont} ====`)
  for (const t of m.res) {
    console.log(` ${t.title}: client=${t.clientWidth} scroll=${t.scrollWidth} table=${t.tableWidth} padL=${t.padL} maxScroll=${t.maxScrollLeft}`)
    for (const c of t.cols) console.log(`   ${c.th.padEnd(18)} w=${String(c.w).padStart(6)}  видно=${String(c.vis).padStart(6)}`)
  }
  // снимок карточки «Давление по времени суток»
  const card = page.locator('.card', { has: page.locator('h2', { hasText: 'Давление по времени суток' }) }).first()
  await card.screenshot({ path: `${OUT}/ot_daypart_${scale}_${vw}.png` })
  await ctx.close()
}
await browser.close()
