import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()

const combos = [
  { text: 'xlarge', density: 'roomy' },
  { text: 'xlarge', density: 'compact' },
  { text: 'large', density: 'roomy' },
  { text: 'normal', density: 'normal' },
]

for (const { text, density } of combos) {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await seed(page, FROZEN)
  await page.evaluate(async ({ t, d }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = t; cur.density = d; cur.trackGlucose = true; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
    localStorage.setItem('textScale', t)
    if (d === 'normal') localStorage.removeItem('density'); else localStorage.setItem('density', d)
  }, { t: text, d: density })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(600)
  await go(page, { tab: 'Приём лекарств' })
  await page.waitForTimeout(600)

  const m = await page.evaluate(() => {
    const R = (el) => { const r = el.getBoundingClientRect(); return { l: +r.left.toFixed(1), r: +r.right.toFixed(1), w: +r.width.toFixed(1), t: +r.top.toFixed(1), h: +r.height.toFixed(1) } }
    const rows = [...document.querySelectorAll('.dose')].map((li) => {
      const time = li.querySelector('.dose__time')
      const body = li.querySelector('.dose__body')
      const name = li.querySelector('.dose__name')
      const amount = li.querySelector('.dose__amount')
      const btn = li.querySelector(':scope > .btn')
      const auto = li.querySelector('.dose__auto')
      const cs = body ? getComputedStyle(body) : null
      return {
        name: name ? name.textContent.trim() : null,
        rowW: +li.getBoundingClientRect().width.toFixed(1),
        rowH: +li.getBoundingClientRect().height.toFixed(1),
        time: time ? R(time) : null,
        body: body ? R(body) : null,
        bodyScrollW: body ? body.scrollWidth : null,
        nameBox: name ? R(name) : null,
        nameScrollW: name ? name.scrollWidth : null,
        nameClientW: name ? name.clientWidth : null,
        amountBox: amount ? R(amount) : null,
        amountLines: amount ? amount.getClientRects().length : null,
        nameLines: name ? name.getClientRects().length : null,
        btn: btn ? R(btn) : null,
        auto: auto ? R(auto) : null,
        autoLines: auto ? auto.getClientRects().length : null,
        overflowPastBody: name && body ? +(R(name).r - R(body).r).toFixed(1) : null,
      }
    })
    return {
      rootFont: getComputedStyle(document.documentElement).fontSize,
      dataText: document.documentElement.dataset.text || '(none)',
      dataDensity: document.documentElement.dataset.density || '(none)',
      docScrollW: document.documentElement.scrollWidth,
      innerW: innerWidth,
      rows,
    }
  })
  console.log(`\n===== text=${text} density=${density} =====`)
  console.log(JSON.stringify(m, null, 1))
  await page.screenshot({ path: `${OUT}/_zmass_${text}_${density}.png`, fullPage: true })
  await ctx.close()
}
await browser.close()
