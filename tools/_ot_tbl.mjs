import { chromium } from 'playwright'
import { seed, go, settle, FROZEN } from './visual.mjs'

const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()
for (const scale of ['normal', 'xlarge']) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2,
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
    db.close()
    localStorage.setItem('textScale', s)
  }, scale)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await go(page, { tool: 'Отчёт' })
  await page.waitForTimeout(400)

  const m = await page.evaluate(() => {
    const out = []
    for (const w of document.querySelectorAll('.table-scroll')) {
      const card = w.closest('.card')
      const title = card?.querySelector('h2')?.textContent.trim() || '(нет)'
      const cs = getComputedStyle(w)
      const wr = w.getBoundingClientRect()
      const tbl = w.querySelector('table')
      const tr = tbl.getBoundingClientRect()
      const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight)
      // видимая полоса содержимого = client box минус паддинги
      const visL = wr.left + parseFloat(cs.borderLeftWidth) + padL
      const visR = visL + (w.clientWidth - padL - padR)
      const cols = [...tbl.querySelectorAll('thead th')].map((th) => {
        const r = th.getBoundingClientRect()
        const vis = Math.max(0, Math.min(r.right, visR) - Math.max(r.left, visL))
        return { th: th.textContent.trim(), w: +r.width.toFixed(1), vis: +vis.toFixed(1) }
      })
      out.push({
        title, tableClass: tbl.className || '(без класса)',
        clientWidth: w.clientWidth, scrollWidth: w.scrollWidth,
        overflow: w.scrollWidth - w.clientWidth,
        tableWidth: +tr.width.toFixed(1),
        contentBand: +(visR - visL).toFixed(1),
        padL, padR,
        scrollbarGutter: cs.scrollbarGutter, scrollbarWidth: cs.scrollbarWidth,
        maskImage: cs.maskImage, bgImage: cs.backgroundImage,
        boxShadow: cs.boxShadow,
        beforeContent: getComputedStyle(w, '::before').content,
        afterContent: getComputedStyle(w, '::after').content,
        cols,
      })
    }
    return { rootFont: getComputedStyle(document.documentElement).fontSize, innerWidth, out }
  })
  console.log('==== textScale=' + scale + ' viewport=360 ====')
  console.log(JSON.stringify(m, null, 2))
  await ctx.close()
}
await browser.close()
