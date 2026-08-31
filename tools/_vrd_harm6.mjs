/* Проверяем предложенную правку: снимает ли она столкновение. */
import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const NAMES = ['Периндоприл', 'Аторвастатин']
const FIX = `.dose { flex-wrap: wrap }
.dose__auto { flex: 0 1 auto; min-width: 0 }
.dose__body { flex: 1 1 60%; overflow-wrap: break-word }`

const browser = await chromium.launch()
for (const [w, text, density] of [[375, 'xlarge', 'roomy'], [320, 'xlarge', 'roomy']]) {
  for (const fix of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 812 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    await page.clock.install({ time: new Date(FROZEN) })
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(700)
    await seed(page, FROZEN)
    await page.evaluate(async ({ t, d, names }) => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
      const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
      cur.textScale = t; cur.density = d; cur.trackGlucose = true; cur.onboarded = true
      await new Promise((res, rej) => {
        const tx = db.transaction(['meta','medicines'], 'readwrite')
        tx.objectStore('meta').put(cur, 'settings')
        names.forEach((n, i) => tx.objectStore('medicines').put({
          id: `x${i}`, name: n, dose: '10 мг', inn: n, form: 'Таблетки', maker: 'Озон',
          packSize: 30, left: 20, perDay: null, expires: Date.UTC(2027, 7, 31),
          times: ['20:00', '21:00'], perTime: 1, taken: [],
        }))
        tx.oncomplete = res; tx.onerror = () => rej(tx.error)
      })
      db.close()
      localStorage.setItem('textScale', t); localStorage.setItem('density', d)
    }, { t: text, d: density, names: NAMES })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('nav.tabs', { timeout: 20000 })
    if (fix) await page.addStyleTag({ content: FIX })
    await page.waitForTimeout(300)
    await go(page, { tab: 'Приём' })
    await page.waitForTimeout(400)
    const r = await page.evaluate(() => {
      const out = []
      for (const li of document.querySelectorAll('.dose')) {
        const name = li.querySelector('.dose__name'); const btn = li.querySelector(':scope > .btn')
        if (!name || !btn) continue
        const n = name.getBoundingClientRect(), t = btn.getBoundingClientRect()
        const clash = Math.min(n.bottom, t.bottom) - Math.max(n.top, t.top) > 0 && n.right > t.left + 1
        out.push({ nm: name.textContent, ov: +(n.right - t.left).toFixed(1), clash, lines: name.getClientRects().length, bodyW: +li.querySelector('.dose__body').getBoundingClientRect().width.toFixed(1) })
      }
      return out
    })
    console.log(`\n--- ${w} / ${text} / ${density} / ${fix ? 'С ПРАВКОЙ' : 'как есть'} ---`)
    for (const x of r) console.log(`  ${x.nm.padEnd(14)} body=${String(x.bodyW).padStart(6)} строк=${x.lines} ${x.clash ? `СТОЛКНОВЕНИЕ ${x.ov}px` : 'чисто'}`)
    const cards = await page.locator('.card').all()
    for (let i = 0; i < cards.length; i++) if (await cards[i].locator('.dose__time').count()) await cards[i].screenshot({ path: `${OUT}/_vrdh6_${w}_${fix ? 'fix' : 'base'}_c${i}.png` })
    await ctx.close()
  }
}
await browser.close()
