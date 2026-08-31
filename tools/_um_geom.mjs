/** Уместность: реальна ли геометрия налезания карандаша/корзины на текст строки. */
import { chromium } from 'playwright'
const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()

async function seed(page, now, scale, density) {
  await page.evaluate(async ([now, scale, density]) => {
    const rs = []
    for (let i = 0; i < 8; i++) {
      rs.push({ id: 'r' + i, kind: 'bp', at: now - i * 43200000, ts: now - i * 43200000,
        sys: 135 + (i % 5), dia: 86 + (i % 4), bpm: 70 + i, pulse: 70 + i, source: 'manual', user: 1 })
    }
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const names = Array.from(db.objectStoreNames)
    await new Promise((res, rej) => {
      const stores = names.filter((n) => n === 'readings' || n === 'meta')
      const tx = db.transaction(stores, 'readwrite')
      if (names.includes('readings')) for (const r of rs) tx.objectStore('readings').put(r)
      tx.objectStore('meta').put({ onboarded: true, textScale: scale, density }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, [now, scale, density])
}

const browser = await chromium.launch()
for (const [scale, density] of [['normal','normal'], ['xlarge','normal'], ['xlarge','roomy'], ['normal','roomy']]) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await seed(page, FROZEN, scale, density)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs')
  await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
  await page.waitForTimeout(500)
  const has = await page.locator('.readings-table tr').count()
  const out = await page.evaluate(() => {
    const tr = document.querySelector('.readings-table tbody tr')
    if (!tr) return null
    const cs = getComputedStyle(tr)
    const del = tr.querySelector("td[data-col='del']")
    const cat = tr.querySelector("td[data-col='cat'] .badge") || tr.querySelector("td[data-col='cat']")
    const note = tr.querySelector("td[data-col='note']")
    const pencil = tr.querySelector('.row-edit')
    const bin = tr.querySelector('.btn--icon')
    const r = (e) => e ? { l: Math.round(e.getBoundingClientRect().left), r: Math.round(e.getBoundingClientRect().right), w: Math.round(e.getBoundingClientRect().width) } : null
    return { trRect: r(tr), padRight: cs.paddingRight, delRect: r(del), pencilRect: r(pencil), binRect: r(bin), catRect: r(cat), catText: cat && cat.textContent, noteRect: r(note), noteText: note && note.textContent }
  })
  console.log('###', scale, density, 'rows:', has)
  console.log(JSON.stringify(out, null, 1))
  await ctx.close()
}
await browser.close()
