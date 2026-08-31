import { chromium } from 'playwright'
import { seed, FROZEN } from './visual.mjs'
const URL = process.env.URL ?? 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const EXTRA = [
  { id: 'd1', name: 'Ко-перинева', dose: '160/12,5 мг', form: 'Таблетки' },
  { id: 'd2', name: 'Дигоксин', dose: '0,125 мг', form: 'Таблетки' },
  { id: 'd4', name: 'Колекальциферол', dose: '2000 МЕ', form: 'Капли' },
  { id: 'd5', name: 'Амлодипин', dose: '5 мг', form: 'Таблетки' },
]
for (const [w, dens, tag] of [[360,'normal','stated'], [320,'roomy','worst']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'light', ignoreHTTPSErrors: true, deviceScaleFactor: 3 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async ({ d, extra }) => {
    const DAY = 86400000, day0 = (() => { const x = new Date(Date.now()); x.setHours(0,0,0,0); return x.getTime() })()
    const marks = []; for (let i = -20; i <= 0; i++) marks.push(day0 + i*DAY + 8*3600000)
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = 'xlarge'; cur.density = d; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction(['meta','medicines'],'readwrite')
      tx.objectStore('meta').put(cur,'settings')
      extra.forEach((m) => tx.objectStore('medicines').put({ ...m, maker: 'Озон', packSize: 30, left: 20,
        perDay: null, expires: Date.UTC(2027,6,31), times: ['08:00'], perTime: 1, taken: marks }))
      tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, { d: dens, extra: EXTRA })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 30000 })
  await page.locator('header button', { hasText: 'Отчёт' }).first().click()
  await page.waitForTimeout(700)
  await page.locator('.report-drugs').first().screenshot({ path: `${OUT}/vh_tbl_drugs_${tag}.png` })
  await page.locator('.report-adherence').first().screenshot({ path: `${OUT}/vh_tbl_adh_${tag}.png` })
  await ctx.close()
}
await browser.close()
