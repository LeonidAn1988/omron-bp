import { chromium } from 'playwright'
import { seed, FROZEN } from './visual.mjs'
const URL = process.env.URL ?? 'http://localhost:5199'
const browser = await chromium.launch()
const EXTRA = [
  { id: 'd1', name: 'Ко-перинева', dose: '160/12,5 мг', form: 'Таблетки' },
  { id: 'd4', name: 'Колекальциферол', dose: '2000 МЕ', form: 'Капли для приема внутрь' },
]
for (const [w, dens] of [[360,'normal'],[320,'roomy']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'light', ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async ({ d, extra }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = 'xlarge'; cur.density = d; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction(['meta','medicines'],'readwrite')
      tx.objectStore('meta').put(cur,'settings')
      extra.forEach((m) => tx.objectStore('medicines').put({ ...m, maker: 'Озон', packSize: 30, left: 20,
        perDay: null, expires: Date.UTC(2027,6,31), times: ['08:00'], perTime: 1, taken: [] }))
      tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, { d: dens, extra: EXTRA })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 30000 })
  await page.locator('header button', { hasText: 'Отчёт' }).first().click()
  await page.waitForTimeout(600)
  const before = await page.evaluate(() => { const t = document.querySelector('.report-drugs')
    return { w: Math.round(t.getBoundingClientRect().width), scroll: t.scrollWidth, host: t.parentElement.clientWidth,
      doc: document.documentElement.scrollWidth, vp: document.documentElement.clientWidth } })
  // правка из находки: table-layout: auto + min-width:0, шапке запрет переносов
  await page.addStyleTag({ content: `.report-drugs, .report-adherence { table-layout: auto !important }
    .report-drugs th, .report-drugs td, .report-adherence th, .report-adherence td { width: auto !important; min-width: 0 !important }
    .report-drugs th, .report-adherence th { hyphens: manual !important; overflow-wrap: normal !important }` })
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => { const t = document.querySelector('.report-drugs')
    return { w: Math.round(t.getBoundingClientRect().width), scroll: t.scrollWidth, host: t.parentElement.clientWidth,
      doc: document.documentElement.scrollWidth, vp: document.documentElement.clientWidth,
      th: [...t.querySelectorAll('th')].map(x => Math.round(x.getBoundingClientRect().width)) } })
  console.log(`### ${w}/${dens}/xlarge`)
  console.log('  до правки :', JSON.stringify(before))
  console.log('  после     :', JSON.stringify(after))
  console.log('  горизонтальная прокрутка страницы после правки:', after.doc > after.vp, `(${after.doc} > ${after.vp})`)
  await ctx.close()
}
await browser.close()
