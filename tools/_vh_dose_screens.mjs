import { chromium } from 'playwright'
import { seed, FROZEN } from './visual.mjs'
const URL = process.env.URL ?? 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const EXTRA = [
  { id: 'd1', name: 'Ко-перинева', dose: '160/12,5 мг', form: 'Таблетки' },
  { id: 'd2', name: 'Дигоксин', dose: '0,125 мг', form: 'Таблетки' },
  { id: 'd6', name: 'Эутирокс', dose: '112,5 мкг', form: 'Таблетки' },
]
const linesFn = `(el) => { const out = []; const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, cur = null;
  while ((n = walk.nextNode())) { const t = n.nodeValue; if (!t.trim()) continue; const rg = document.createRange();
    for (let i = 0; i < t.length; i++) { rg.setStart(n,i); rg.setEnd(n,i+1); const rc = rg.getBoundingClientRect();
      if (!rc.width && !rc.height) continue; const top = Math.round(rc.top);
      if (!cur || Math.abs(cur.top - top) > 3) { cur = { top, s: '' }; out.push(cur) } cur.s += t[i] } }
  return out.map(l => l.s) }`
for (const [w, dens] of [[320,'roomy'],[360,'normal']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'light', ignoreHTTPSErrors: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async ({ d, extra }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = 'xlarge'; cur.density = d; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction(['meta','medicines'],'readwrite')
      tx.objectStore('meta').put(cur,'settings')
      extra.forEach((m) => tx.objectStore('medicines').put({ ...m, maker: 'Озон', packSize: 30, left: 20,
        perDay: null, expires: Date.UTC(2027,6,31), times: ['08:00','20:00'], perTime: 1, taken: [] }))
      tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, { d: dens, extra: EXTRA })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 30000 })
  for (const tab of ['Приём', 'Аптечка']) {
    await page.locator('nav.tabs button', { hasText: tab }).first().click()
    await page.waitForTimeout(600)
    const txt = await page.evaluate(`(() => { const lines = ${linesFn};
      const roots = [...document.querySelectorAll('.dose, .pill, .card')];
      return roots.slice(0, 14).map(r => lines(r).join(' ⏎ ')).filter(s => /мг|мкг|ЕД/.test(s)) })()`)
    console.log(`### ${w}/${dens}/xlarge — ${tab}`)
    txt.forEach(t => console.log('   ', t.slice(0, 300)))
    await page.screenshot({ path: `${OUT}/vh_${tab}_${w}_${dens}.png`, fullPage: true })
  }
  await ctx.close()
}
await browser.close()
