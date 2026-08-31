/** Что видит человек по умолчанию (сахар выключен, ничего не засеяно) на 360 и 407. */
import { chromium } from 'playwright'
import { go, settle, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4711'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
for (const w of [360, 393, 407]) {
  for (const sc of ['normal', 'large', 'xlarge']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true, isMobile: true })
    const page = await ctx.newPage()
    await page.clock.install({ time: new Date(FROZEN) })
    await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(900)
    await page.evaluate(async (a) => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
      const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
      cur.onboarded = true; cur.theme = 'dark'; cur.textScale = a
      await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
      db.close()
    }, sc)
    await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
    await go(page, { tool: 'Настройки' })
    const r = await page.evaluate(() => [...document.querySelectorAll('.segmented--fill')].map((s) => ({
      l: s.getAttribute('aria-label'),
      b: [...s.querySelectorAll('button')].map((b) => { const bb = b.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(b); const rr = [...rg.getClientRects()]; const ov = Math.max(...rr.map((x) => x.right)) - bb.right; return ov > 0.6 ? `${b.textContent.trim()}(+${ov.toFixed(0)})` : b.textContent.trim() })
    })))
    console.log(`${w} ${sc} сахар по умолчанию выкл:`)
    for (const g of r) console.log(`   [${g.l}] ${g.b.join(' | ')}`)
    await ctx.close()
  }
}
await browser.close()
