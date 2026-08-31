import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4477'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

for (const scale of ['normal', 'xlarge']) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 3,
    hasTouch: true, isMobile: true,
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
  await page.waitForTimeout(500)
  await go(page, { tool: 'Отчёт' })
  await page.waitForTimeout(600)

  const m = await page.evaluate(() => {
    const out = []
    const wraps = [...document.querySelectorAll('.table-scroll')]
    for (const w of wraps) {
      const card = w.closest('.card')
      const title = card?.querySelector('h2')?.textContent.trim() ?? '(?)'
      const t = w.querySelector('table')
      const ths = [...t.querySelectorAll('thead th')]
      const wr = w.getBoundingClientRect()
      const cols = ths.map((th) => {
        const r = th.getBoundingClientRect()
        const visible = Math.max(0, Math.min(r.right, wr.right) - Math.max(r.left, wr.left))
        return { text: th.textContent.trim(), w: Math.round(r.width), visible: Math.round(visible) }
      })
      // первая строка тела: что реально читается
      const firstRow = t.querySelector('tbody tr')
      const cells = firstRow ? [...firstRow.children].map((td) => {
        const r = td.getBoundingClientRect()
        const visible = Math.max(0, Math.min(r.right, wr.right) - Math.max(r.left, wr.left))
        return { text: td.textContent.trim().slice(0, 40), w: Math.round(r.width), visible: Math.round(visible) }
      }) : []
      out.push({
        title,
        clientW: w.clientWidth, scrollW: w.scrollWidth, offsetW: w.offsetWidth,
        wrapLeft: Math.round(wr.left), wrapRight: Math.round(wr.right),
        viewportW: innerWidth,
        cols, cells,
      })
    }
    return { rootFont: getComputedStyle(document.documentElement).fontSize, tables: out,
      docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth }
  })
  console.log('=== scale', scale, 'rootFont', m.rootFont, 'doc', m.docClientW, '/', m.docScrollW, '===')
  for (const t of m.tables) {
    console.log(`\n[${t.title}] wrap ${t.clientW}px видно, ${t.scrollW}px всего; края ${t.wrapLeft}..${t.wrapRight} при viewport ${t.viewportW}`)
    console.log('  шапка:', t.cols.map(c => `${c.text}=${c.visible}/${c.w}`).join('  '))
    console.log('  строка:', t.cells.map(c => `«${c.text}»=${c.visible}/${c.w}`).join('  '))
  }

  // Проверяем, работает ли прокрутка вбок и что видно после неё
  const after = await page.evaluate(() => {
    const w = [...document.querySelectorAll('.table-scroll')].find(x => x.closest('.card')?.querySelector('h2')?.textContent.includes('времени суток'))
    w.scrollLeft = 9999
    const wr = w.getBoundingClientRect()
    const ths = [...w.querySelectorAll('thead th')]
    return { scrollLeft: Math.round(w.scrollLeft), cols: ths.map(th => { const r = th.getBoundingClientRect(); return th.textContent.trim() + '=' + Math.round(Math.max(0, Math.min(r.right, wr.right) - Math.max(r.left, wr.left))) }) }
  })
  console.log('\n  после прокрутки вправо (scrollLeft=' + after.scrollLeft + '):', after.cols.join('  '))
  await page.evaluate(() => { const w = [...document.querySelectorAll('.table-scroll')].find(x => x.closest('.card')?.querySelector('h2')?.textContent.includes('времени суток')); w.scrollLeft = 0 })

  const el = await page.locator('.card', { hasText: 'Давление по времени суток' }).first()
  await el.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await el.screenshot({ path: `${OUT}/hv_daypart_${scale}.png` })
  const el2 = await page.locator('.card', { hasText: 'Сахар по моменту замера' }).first()
  await el2.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await el2.screenshot({ path: `${OUT}/hv_gluc_${scale}.png` })
  await ctx.close()
}
await browser.close()
