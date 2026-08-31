import { chromium } from 'playwright'
import { seed, FROZEN } from './visual.mjs'
const URL = process.env.URL ?? 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const EXTRA = [
  { id: 'd1', name: 'Ко-перинева', dose: '160/12,5 мг', form: 'Таблетки' },
  { id: 'd2', name: 'Дигоксин', dose: '0,125 мг', form: 'Таблетки' },
  { id: 'd4', name: 'Колекальциферол', dose: '2000 МЕ', form: 'Капли' },
]
const ctx = await browser.newContext({ viewport: { width: 320, height: 900 }, locale: 'ru-RU',
  timezoneId: 'Europe/Moscow', colorScheme: 'light', ignoreHTTPSErrors: true })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await seed(page, FROZEN)
await page.evaluate(async (extra) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.textScale = 'xlarge'; cur.density = 'roomy'; cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction(['meta','medicines'],'readwrite')
    tx.objectStore('meta').put(cur,'settings')
    extra.forEach((m) => tx.objectStore('medicines').put({ ...m, maker: 'Озон', packSize: 30, left: 20,
      perDay: null, expires: Date.UTC(2027,6,31), times: ['08:00'], perTime: 1, taken: [] }))
    tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
}, EXTRA)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 30000 })
await page.locator('header button', { hasText: 'Отчёт' }).first().click()
await page.waitForTimeout(600)
const measure = async (label) => {
  const r = await page.evaluate(() => {
    const linesOf = (el) => { const out = []; const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, cur = null
      while ((n = walk.nextNode())) { const t = n.nodeValue; if (!t.trim()) continue; const rg = document.createRange()
        for (let i = 0; i < t.length; i++) { rg.setStart(n,i); rg.setEnd(n,i+1); const rc = rg.getBoundingClientRect()
          if (!rc.width && !rc.height) continue; const top = Math.round(rc.top)
          if (!cur || Math.abs(cur.top - top) > 3) { cur = { top, s: '' }; out.push(cur) }
          cur.s += t[i] } }
      return out.map(l => l.s) }
    const d = document.querySelector('.report-drugs'), a = document.querySelector('.report-adherence')
    return { root: getComputedStyle(document.documentElement).fontSize,
      thDrugs: [...d.querySelectorAll('th')].map(linesOf),
      doses: [...d.querySelectorAll('tbody tr')].map(tr => linesOf(tr.children[1])),
      thAdh: [...a.querySelectorAll('th')].map(linesOf),
      dolya: [...a.querySelectorAll('tbody tr')].map(tr => linesOf(tr.children[2])) }
  })
  console.log(`--- ${label} (root ${r.root}) ---`)
  console.log('  шапка «Что принимает»:', JSON.stringify(r.thDrugs))
  console.log('  дозировки           :', JSON.stringify(r.doses))
  console.log('  шапка соблюдения    :', JSON.stringify(r.thAdh))
  console.log('  доля                :', JSON.stringify(r.dolya))
}
await measure('ЭКРАН 320px / просторно / очень крупный')
await page.emulateMedia({ media: 'print' })
await page.waitForTimeout(400)
await measure('ПЕЧАТЬ (те же настройки)')
await page.pdf({ path: `${OUT}/vh_report_xl.pdf`, format: 'A4', printBackground: true })
await page.emulateMedia({ media: 'screen' })
await ctx.close(); await browser.close()
