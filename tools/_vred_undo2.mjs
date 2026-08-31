/** Для каких строк «Вернуть» реально попадает в экран. */
import { chromium } from 'playwright'
const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()

async function seed(page, now, n) {
  await page.evaluate(async ([now, n]) => {
    const DAY = 86400000
    const d0 = new Date(now); d0.setHours(0,0,0,0); const day0 = d0.getTime()
    const readings = []
    for (let i = 0; i < n; i++) {
      const ts = day0 - i * (DAY / 2) + 8 * 3600000
      readings.push({ id: `d1-${Math.floor(ts/1000)}`, kind: 'bp', ts, user: 1, source: 'device',
        sys: 128 + (i % 9), dia: 80 + (i % 6), bpm: 66 + (i % 7), ihb: false, mov: false })
    }
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    await new Promise((res, rej) => { const tx = db.transaction(['readings','meta'],'readwrite')
      readings.forEach((r) => tx.objectStore('readings').put(r))
      tx.objectStore('meta').put({ onboarded: true, textScale: 'normal', density: 'normal' }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, [now, n])
}

async function open(browser, n) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await seed(page, FROZEN, n)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs')
  await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
  await page.waitForSelector('.readings-table tbody tr')
  return { ctx, page }
}

const browser = await chromium.launch()

// Сколько записей у обычного человека? Пробуем разные объёмы дневника.
for (const n of [3, 6, 10, 14, 20, 40, 60]) {
  const { ctx, page } = await open(browser, n)
  const res = []
  for (let idx = 0; idx < n; idx++) {
    // перезагружаем состояние, чтобы каждый замер был независимым
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('nav.tabs')
    await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
    await page.waitForSelector('.readings-table tbody tr')
    const rows = page.locator('.readings-table tbody tr')
    const row = rows.nth(idx)
    await row.scrollIntoViewIfNeeded()
    await page.waitForTimeout(120)
    await row.locator('.btn--icon').click()
    await page.waitForTimeout(250)
    const r = await page.evaluate(() => {
      const rev = [...document.querySelectorAll('.reveal[data-open="true"]')]
      const u = rev.find((x) => /Вернуть/.test(x.innerText))
      if (!u) return { vis: false, top: null }
      const b = [...u.querySelectorAll('button')].find((x) => /Вернуть/.test(x.innerText)).getBoundingClientRect()
      return { vis: b.top < innerHeight && b.bottom > 0, top: +b.top.toFixed(0) }
    })
    res.push({ idx: idx + 1, ...r })
    // возвращаем запись, если видно; иначе просто перезаливаем при следующем reload
    await page.evaluate(async () => {
      const btns = [...document.querySelectorAll('button')].filter((b) => /Вернуть/.test(b.innerText))
      if (btns[0]) btns[0].click()
    })
    await page.waitForTimeout(250)
    await seed(page, FROZEN, n)
  }
  const visible = res.filter((r) => r.vis).map((r) => r.idx)
  console.log(`записей ${n}: «Вернуть» видно при удалении строк ${visible.length ? visible.join(',') : '—'} из ${n}  | tops: ${res.map(r=>r.top).join(' ')}`)
  await ctx.close()
}
await browser.close()
