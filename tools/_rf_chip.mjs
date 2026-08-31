import { chromium } from 'playwright'
import { seed, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const DRUG = process.env.DRUG ?? 'Смекта'
const SCALE = process.env.SCALE ?? 'normal'
const W = Number(process.env.W ?? 360)

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: W, height: 800 },
  locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
console.log('первый экран:', (await page.locator('body').innerText()).slice(0, 200).replace(/\n/g, ' / '))
await seed(page, FROZEN)
await page.evaluate(async (s) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.textScale = s; cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
  localStorage.setItem('textScale', s)
}, SCALE)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(600)

await page.locator('nav.tabs button', { hasText: 'Аптечка' }).first().click()
await page.waitForTimeout(400)
await page.locator('button', { hasText: 'Добавить препарат' }).first().click()
await page.waitForTimeout(400)

const base = await page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
  bodyScrollW: document.body.scrollWidth,
  rootFont: getComputedStyle(document.documentElement).fontSize,
}))
console.log('ДО выбора препарата:', JSON.stringify(base))

const input = page.locator('.suggest input').first()
await input.click()
await input.fill(DRUG)
await page.waitForTimeout(700)
const opts = await page.locator('.suggest__item').count()
console.log('подсказок:', opts)
if (opts === 0) { console.log('НЕТ ПОДСКАЗОК для', DRUG); await browser.close(); process.exit(0) }
await page.locator('.suggest__item').first().click()
await page.waitForTimeout(600)

const m = await page.evaluate(() => {
  const doc = document.documentElement
  const card = document.querySelector('.card')
  const cs = card ? card.getBoundingClientRect() : null
  const cstyle = card ? getComputedStyle(card) : null
  const groups = [...document.querySelectorAll('.chips')].map((g) => {
    const gr = g.getBoundingClientRect()
    return {
      label: g.getAttribute('aria-label'),
      groupWidth: Math.round(gr.width),
      groupLeft: Math.round(gr.left),
      chips: [...g.querySelectorAll('.chip')].map((c) => {
        const r = c.getBoundingClientRect()
        return {
          text: c.textContent.trim(),
          len: c.textContent.trim().length,
          w: Math.round(r.width),
          left: Math.round(r.left),
          right: Math.round(r.right),
          h: Math.round(r.height),
          ws: getComputedStyle(c).whiteSpace,
          overflowWrap: getComputedStyle(c).overflowWrap,
          maxW: getComputedStyle(c).maxWidth,
        }
      }),
    }
  })
  // самый правый край любого элемента
  let maxRight = 0, culprit = ''
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width && r.right > maxRight) { maxRight = r.right; culprit = el.className + '|' + (el.textContent || '').slice(0, 40) }
  }
  return {
    scrollW: doc.scrollWidth,
    clientW: doc.clientWidth,
    bodyScrollW: document.body.scrollWidth,
    cardWidth: cs ? Math.round(cs.width) : null,
    cardInner: cs && cstyle ? Math.round(cs.width - parseFloat(cstyle.paddingLeft) - parseFloat(cstyle.paddingRight) - 2) : null,
    cardRight: cs ? Math.round(cs.right) : null,
    maxRight: Math.round(maxRight),
    culprit,
    groups,
  }
})
console.log('ПОСЛЕ выбора:', JSON.stringify(m, null, 2))

// действительно ли страница прокручивается вбок
const scrolled = await page.evaluate(() => { window.scrollTo(9999, 0); return { x: window.scrollX } })
console.log('прокрутка вбок:', JSON.stringify(scrolled))
await page.evaluate(() => window.scrollTo(0, 0))

await page.screenshot({ path: `${OUT}/rf_chip_${SCALE}_${W}.png`, fullPage: true })
await ctx.close()
await browser.close()
