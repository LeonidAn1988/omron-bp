import { chromium } from 'playwright'
import { seed, go, settle, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

const combos = [
  { w: 375, text: 'xlarge', dens: 'roomy' },
  { w: 375, text: 'xlarge', dens: 'compact' },
  { w: 375, text: 'large',  dens: 'roomy' },
  { w: 412, text: 'xlarge', dens: 'roomy' },
]

for (const c of combos) {
  const ctx = await browser.newContext({
    viewport: { width: c.w, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s.text; cur.density = s.dens; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, c)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await go(page, { tab: 'Приём' })
  await page.waitForTimeout(400)

  const m = await page.evaluate(() => {
    const root = document.documentElement
    const rows = [...document.querySelectorAll('.dose')]
    return {
      dataText: root.getAttribute('data-text'),
      dataDensity: root.getAttribute('data-density'),
      rootFont: getComputedStyle(root).fontSize,
      spaceUnit: getComputedStyle(root).getPropertyValue('--space-unit'),
      rows: rows.map((li) => {
        const body = li.querySelector('.dose__body')
        const name = li.querySelector('.dose__name')
        const time = li.querySelector('.dose__time')
        const btn = li.querySelector(':scope > .btn')
        const auto = li.querySelector('.dose__auto')
        const r = (e) => e ? { w: +e.getBoundingClientRect().width.toFixed(1), l: +e.getBoundingClientRect().left.toFixed(1), rt: +e.getBoundingClientRect().right.toFixed(1), sw: e.scrollWidth } : null
        return {
          text: name ? name.textContent : '(нет)',
          li: r(li), body: r(body), name: r(name), time: r(time), btn: r(btn), auto: r(auto),
          nameOverflowsBody: body && name ? +(name.getBoundingClientRect().right - body.getBoundingClientRect().right).toFixed(1) : null,
          bodyOverflowsLi: body ? +(body.getBoundingClientRect().right - li.getBoundingClientRect().right).toFixed(1) : null,
          liScrollOverflow: li.scrollWidth - li.clientWidth,
        }
      }),
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  console.log('===', JSON.stringify(c), '===')
  console.log(JSON.stringify(m, null, 1))
  await page.screenshot({ path: `${OUT}/refute_${c.w}_${c.text}_${c.dens}.png`, fullPage: true })
  await ctx.close()
}
await browser.close()
