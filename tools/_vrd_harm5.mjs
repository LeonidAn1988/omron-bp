/* Худший угол: 320 px, «Очень крупный» + «Просторно».
   Проверяем, что именно закрыто — только имя или ещё и дозировка. */
import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const NAMES = ['Периндоприл', 'Аторвастатин']

const browser = await chromium.launch()
for (const [w, text, density] of [[320, 'xlarge', 'roomy'], [320, 'normal', 'normal']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 812 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 3 })
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
        times: ['20:00', '21:00'], perTime: 1, meal: 'after', taken: [],
      }))
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
    localStorage.setItem('textScale', t)
    if (d === 'normal') localStorage.removeItem('density'); else localStorage.setItem('density', d)
  }, { t: text, d: density, names: NAMES })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(300)
  await go(page, { tab: 'Приём' })
  await page.waitForTimeout(400)

  const res = await page.evaluate(() => {
    const cover = (el, btn) => {
      if (!el || !btn) return null
      const t = btn.getBoundingClientRect()
      const r = document.createRange(); const tn = el.firstChild
      if (!tn || tn.nodeType !== 3) return null
      const vis = [], hid = []
      for (let i = 0; i < tn.length; i++) {
        r.setStart(tn, i); r.setEnd(tn, i + 1)
        const g = r.getBoundingClientRect()
        const clash = Math.min(g.bottom, t.bottom) - Math.max(g.top, t.top) > 0 && g.right > t.left + 1
        ;(clash ? hid : vis).push(tn.data[i])
      }
      return { visible: vis.join(''), hidden: hid.join('') }
    }
    const out = []
    for (const li of document.querySelectorAll('.dose')) {
      const btn = li.querySelector(':scope > .btn')
      if (!btn) continue
      out.push({
        name: cover(li.querySelector('.dose__name'), btn),
        amount: cover(li.querySelector('.dose__amount'), btn),
        extra: cover(li.querySelector('.dose__extra'), btn),
        time: li.querySelector('.dose__time')?.textContent ?? null,
        btnW: +btn.getBoundingClientRect().width.toFixed(1),
      })
    }
    return { docScrollW: document.documentElement.scrollWidth, innerW: innerWidth, out }
  })
  console.log(`\n===== ${w} / ${text} / ${density} =====`)
  console.log(JSON.stringify(res, null, 1))
  const cards = await page.locator('.card').all()
  for (let i = 0; i < cards.length; i++) {
    if (await cards[i].locator('.dose__time').count()) await cards[i].screenshot({ path: `${OUT}/_vrdh5_${w}_${text}_${density}_c${i}.png` })
  }
  await ctx.close()
}
await browser.close()
