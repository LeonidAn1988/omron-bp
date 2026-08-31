import { chromium } from 'playwright'
import { seed, FROZEN } from './visual.mjs'
const URL = process.env.URL ?? 'http://localhost:5199'
const browser = await chromium.launch()
for (const w of [360, 384, 392, 400, 412]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'dark', ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = 'xlarge'; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 30000 })
  await page.locator('header button', { hasText: 'Отчёт' }).first().click()
  await page.waitForTimeout(600)
  const r = await page.evaluate(() => {
    const linesOf = (el) => { const out = []; const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, cur = null
      while ((n = walk.nextNode())) { const t = n.nodeValue; if (!t.trim()) continue; const rg = document.createRange()
        for (let i = 0; i < t.length; i++) { rg.setStart(n,i); rg.setEnd(n,i+1); const rc = rg.getBoundingClientRect()
          if (!rc.width && !rc.height) continue; const top = Math.round(rc.top)
          if (!cur || Math.abs(cur.top - top) > 3) { cur = { top, s: '' }; out.push(cur) }; cur.s += t[i] } }
      return out.map(l => l.s) }
    const hint = [...document.querySelectorAll('.muted, p')].find(e => e.textContent.includes('В диалоге печати'))
    const facts = document.querySelector('.report-facts')
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Печать'))
    return { hint: hint ? linesOf(hint) : null,
      facts: facts ? [...facts.querySelectorAll('tr')].map(tr => linesOf(tr)) : null,
      btnFrac: btn ? +(btn.getBoundingClientRect().width / innerWidth).toFixed(3) : null }
  })
  console.log(`### ${w}px`, 'btnFrac', r.btnFrac)
  console.log('  подсказка:', JSON.stringify(r.hint))
  if (r.facts) r.facts.slice(0,3).forEach(f => console.log('  факт:', JSON.stringify(f)))
  await ctx.close()
}
await browser.close()
