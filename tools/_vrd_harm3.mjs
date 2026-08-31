/* Худший реалистичный случай: длинные однословные названия из аптечки
   гипертоника, карточка с двумя временами (значит, колонка часа есть),
   375 px, «Очень крупный» + «Просторно». */
import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const NAMES = ['Аторвастатин', 'Кардиомагнил', 'Телмисартан', 'Периндоприл', 'Ацетилсалициловая кислота']

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 3,
})
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
await seed(page, FROZEN)
await page.evaluate(async (names) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.textScale = 'xlarge'; cur.density = 'roomy'; cur.trackGlucose = true; cur.onboarded = true
  await new Promise((res, rej) => {
    const tx = db.transaction(['meta', 'medicines'], 'readwrite')
    tx.objectStore('meta').put(cur, 'settings')
    names.forEach((n, i) => tx.objectStore('medicines').put({
      id: `x${i}`, name: n, dose: '10 мг', inn: n, form: 'Таблетки', maker: 'Озон',
      packSize: 30, left: 20, perDay: null, expires: Date.UTC(2027, 7, 31),
      times: ['20:00', '21:00'], perTime: 1, taken: [],
    }))
    tx.oncomplete = res; tx.onerror = () => rej(tx.error)
  })
  db.close()
  localStorage.setItem('textScale', 'xlarge'); localStorage.setItem('density', 'roomy')
}, NAMES)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(400)
await go(page, { tab: 'Приём' })
await page.waitForTimeout(500)

const geo = await page.evaluate(() => {
  const out = []
  for (const li of document.querySelectorAll('.dose')) {
    const name = li.querySelector('.dose__name')
    const btn = li.querySelector(':scope > .btn')
    if (!name || !btn) continue
    const n = name.getBoundingClientRect(), t = btn.getBoundingClientRect()
    const r = document.createRange(); const tn = name.firstChild
    const glyphs = []
    for (let i = 0; i < tn.length; i++) {
      r.setStart(tn, i); r.setEnd(tn, i + 1)
      const g = r.getBoundingClientRect()
      glyphs.push({ ch: tn.data[i], l: g.left, r: g.right, t: g.top, b: g.bottom })
    }
    const vClash = (g) => Math.min(g.b, t.bottom) - Math.max(g.t, t.top) > 0
    const covered = glyphs.filter((g) => vClash(g) && g.r > t.left + 1)
    out.push({
      name: name.textContent,
      nameLines: name.getClientRects().length,
      xOverlap: +(n.right - t.left).toFixed(1),
      coveredChars: covered.map((g) => g.ch).join(''),
      visibleChars: glyphs.filter((g) => !(vClash(g) && g.r > t.left + 1)).map((g) => g.ch).join(''),
      offscreenRight: +(n.right - innerWidth).toFixed(1),
    })
  }
  return out
})
console.log(JSON.stringify(geo, null, 1))

const cards = await page.locator('.card').all()
for (let i = 0; i < cards.length; i++) {
  if (await cards[i].locator('.dose__time').count()) {
    await cards[i].screenshot({ path: `${OUT}/_vrdh3_card${i}.png` })
  }
}
await ctx.close()
await browser.close()
