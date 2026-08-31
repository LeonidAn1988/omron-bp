import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()

for (const scale of ['normal', 'xlarge']) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s; cur.trackGlucose = true; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
    localStorage.setItem('textScale', s)
  }, scale)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(500)
  await go(page, { tool: 'Прибор' })
  await page.waitForTimeout(500)

  const m = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')]
    const info = cards.map((c) => {
      const h2 = c.querySelector('h2')
      const r = c.getBoundingClientRect()
      return { h2: h2 ? h2.textContent.trim() : '(нет)', top: Math.round(r.top + scrollY), h: Math.round(r.height) }
    })
    const last = cards[cards.length - 1]
    const logEl = document.querySelector('.log')
    return {
      rootFont: getComputedStyle(document.documentElement).fontSize,
      cards: info,
      docHeight: Math.round(document.documentElement.scrollHeight),
      viewport: innerHeight,
      logExists: !!logEl,
      emptyMsg: [...document.querySelectorAll('.muted')].map(e=>e.textContent.trim()).filter(t=>t.startsWith('Журнал пуст')),
      buttons: last ? [...last.querySelectorAll('button')].map(b => ({ t: b.textContent.trim(), disabled: b.disabled })) : [],
    }
  })
  console.log('=== textScale =', scale, '===')
  console.log(JSON.stringify(m, null, 2))
  await page.screenshot({ path: `${OUT}/rf_pribor_${scale}.png`, fullPage: true })
  await ctx.close()
}
await browser.close()
