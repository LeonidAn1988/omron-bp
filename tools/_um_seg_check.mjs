import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const FIX = process.argv[2] === 'fix'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
  colorScheme: 'light', deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.textScale = 'xlarge'; cur.density = 'roomy'; cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(600)

if (FIX) {
  await page.addStyleTag({ content: `
    .segmented--fill button { overflow-wrap: break-word; hyphens: auto; }
    :root[data-text='large'] .segmented--fill,
    :root[data-text='xlarge'] .segmented--fill { flex-direction: column; }
    :root[data-text='large'] .segmented--fill button,
    :root[data-text='xlarge'] .segmented--fill button { border-radius: 7px; border-left: 0; }
    :root[data-text='large'] .segmented--fill button + button,
    :root[data-text='xlarge'] .segmented--fill button + button { border-left: 0; border-top: 1px solid var(--border-strong); }
  ` })
  await page.waitForTimeout(300)
}

const probe = () => page.evaluate(() => {
  const groups = [...document.querySelectorAll('.segmented--fill')]
  return groups.map((g) => {
    const gr = g.getBoundingClientRect()
    const btns = [...g.querySelectorAll('button')].map((b) => {
      const r = b.getBoundingClientRect()
      // ширина, которую просит самое длинное слово подписи
      const span = document.createElement('span')
      const cs = getComputedStyle(b)
      span.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};letter-spacing:${cs.letterSpacing}`
      document.body.appendChild(span)
      const words = b.textContent.trim().split(/\s+/)
      let longest = 0
      for (const w of words) { span.textContent = w; longest = Math.max(longest, span.getBoundingClientRect().width) }
      span.textContent = b.textContent.trim()
      const whole = span.getBoundingClientRect().width
      span.remove()
      const inner = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      return {
        t: b.textContent.trim(),
        w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        inner: +inner.toFixed(1),
        longestWord: +longest.toFixed(1),
        wholeLabel: +whole.toFixed(1),
        over: +(longest - inner).toFixed(1),
        scrollW: b.scrollWidth, clientW: b.clientWidth,
      }
    })
    return { label: g.getAttribute('aria-label'), gw: +gr.width.toFixed(1), gh: +gr.height.toFixed(1), btns }
  })
})

const report = {}
report.root = await page.evaluate(() => ({ font: getComputedStyle(document.documentElement).fontSize, text: document.documentElement.dataset.text, density: document.documentElement.dataset.density }))
report.overview = await probe()
await page.screenshot({ path: `${OUT}/um_seg_${FIX?'fix':'now'}_overview.png` })

await go(page, { tool: 'Настройки' })
await page.waitForTimeout(400)
report.settings = await probe()
await page.evaluate(() => { const els=[...document.querySelectorAll('.card h2')]; const c=els.find(e=>e.textContent.includes('Оформление')); c?.scrollIntoView({block:'start'}) })
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/um_seg_${FIX?'fix':'now'}_settings.png` })

await go(page, { tab: 'Аптечка' })
await page.waitForTimeout(400)
report.cabinet = await probe()
await page.screenshot({ path: `${OUT}/um_seg_${FIX?'fix':'now'}_cabinet.png` })

console.log(JSON.stringify(report, null, 1))
await browser.close()
