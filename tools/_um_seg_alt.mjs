import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const MODE = process.argv[2] // 'col' (аккуратные радиусы) | 'wrap' (только перенос)
const W = Number(process.argv[3] || 375)
const SCALE = process.argv[4] || 'xlarge'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: W, height: 812 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await seed(page, FROZEN)
await page.evaluate(async (s) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.textScale = s; cur.density = 'roomy'; cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
}, SCALE)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(600)

const CSS = {
  col: `
    .segmented--fill button { overflow-wrap: break-word; hyphens: auto; }
    :root[data-text='xlarge'] .segmented--fill { flex-direction: column; }
    :root[data-text='xlarge'] .segmented--fill button { border-radius: 0; }
    :root[data-text='xlarge'] .segmented--fill button:first-child { border-radius: 7px 7px 0 0; }
    :root[data-text='xlarge'] .segmented--fill button:last-child { border-radius: 0 0 7px 7px; }
    :root[data-text='xlarge'] .segmented--fill button + button { border-left: 0; border-top: 1px solid var(--border-strong); }
  `,
  wrap: `.segmented--fill button { overflow-wrap: break-word; hyphens: auto; }`,
}
if (CSS[MODE]) await page.addStyleTag({ content: CSS[MODE] })
await page.waitForTimeout(300)

await go(page, { tool: 'Настройки' })
await page.waitForTimeout(400)
await page.evaluate(() => { const c=[...document.querySelectorAll('.card h2')].find(e=>e.textContent.includes('Оформление')); c?.scrollIntoView({block:'start'}) })
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/alt_${MODE}_${W}_${SCALE}.png` })
const info = await page.evaluate(() => [...document.querySelectorAll('.segmented--fill')].map(g => ({
  label: g.getAttribute('aria-label'), h: Math.round(g.getBoundingClientRect().height),
  btns: [...g.querySelectorAll('button')].map(b => ({ t: b.textContent.trim(), w: Math.round(b.getBoundingClientRect().width), sw: b.scrollWidth, cw: b.clientWidth, lines: Math.round(b.getBoundingClientRect().height / parseFloat(getComputedStyle(b).lineHeight)) })),
})))
console.log(JSON.stringify(info))
await browser.close()
