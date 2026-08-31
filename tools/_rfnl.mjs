import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const URL = process.env.U || 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 360, height: 900 }, locale: 'ru-RU',
  timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2,
  ignoreHTTPSErrors: true,
})
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.textScale = 'normal'; cur.density = 'normal'; cur.trackGlucose = true; cur.onboarded = true; cur.theme = 'dark'
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(500)
await go(page, { tool: 'Настройки' })
await page.waitForTimeout(500)

const res = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')]
  const card = cards.find(c => (c.querySelector('h2')||{}).textContent?.trim() === 'Оформление')
  if (!card) return { err: 'card not found', heads: cards.map(c => (c.querySelector('h2')||{}).textContent) }
  const out = []
  const walk = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim()) {
        const p = n.parentElement
        const cs = getComputedStyle(p)
        const r = p.getBoundingClientRect()
        out.push({
          text: n.textContent.trim().slice(0, 46),
          tag: p.tagName.toLowerCase(),
          cls: p.className || '',
          pressed: p.getAttribute('aria-pressed'),
          fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color,
          x: +r.left.toFixed(1), y: +r.top.toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1),
        })
      } else if (n.nodeType === 1) walk(n)
    }
  }
  walk(card)
  const root = getComputedStyle(document.documentElement)
  return {
    tokens: {
      fs0: root.getPropertyValue('--fs-0').trim(), fs1: root.getPropertyValue('--fs-1').trim(),
      fs2: root.getPropertyValue('--fs-2').trim(), fs3: root.getPropertyValue('--fs-3').trim(),
      rootFontSize: root.fontSize,
      textPrimary: root.getPropertyValue('--text-primary').trim(),
      textSecondary: root.getPropertyValue('--text-secondary').trim(),
      textMuted: root.getPropertyValue('--text-muted').trim(),
    },
    cardRect: (() => { const r = card.getBoundingClientRect(); return { y: +r.top.toFixed(1), h: +r.height.toFixed(1) } })(),
    nodes: out,
    sizes: [...new Set(out.map(o => o.fontSize))].sort(),
    colorsAt13: [...new Set(out.filter(o => o.fontSize === '13px').map(o => o.color))],
    segBorder: (() => { const g = card.querySelector('.segmented'); const cs = getComputedStyle(g); return { border: cs.borderTopWidth + ' ' + cs.borderTopColor, radius: cs.borderRadius } })(),
    btnHeights: [...card.querySelectorAll('.segmented button')].map(b => +b.getBoundingClientRect().height.toFixed(1)),
  }
})
console.log(JSON.stringify(res, null, 1))

// снимок карточки
const card = page.locator('.card', { has: page.locator('h2', { hasText: 'Оформление' }) }).first()
await card.screenshot({ path: OUT + '/_rfnl_card.png' })
await browser.close()
