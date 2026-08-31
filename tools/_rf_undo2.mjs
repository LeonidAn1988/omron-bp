/** Второй заход: сколько строк из скольких прячут баннер. Мобильная и настольная ширина. */
import { chromium } from 'playwright'
const URL = 'http://127.0.0.1:4712/index.html'
const FROZEN = Date.UTC(2026, 7, 15, 7, 30)

const seed = async (page, n) => {
  await page.evaluate(async ([now, count]) => {
    const H = 3600000
    const readings = []
    for (let i = 0; i < count; i++) {
      readings.push({ id: `bp-${i}`, kind: 'bp', ts: now - i * H * 8, user: 1, source: 'manual',
        sys: 128 + (i % 7), dia: 82 + (i % 4), bpm: 68 + (i % 5), ihb: false, mov: false })
    }
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    await new Promise((res, rej) => {
      const tx = db.transaction(['readings', 'meta'], 'readwrite')
      tx.objectStore('readings').clear()
      readings.forEach((r) => tx.objectStore('readings').put(r))
      tx.objectStore('meta').put({ onboarded: true }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, [FROZEN, n])
}

const browser = await chromium.launch()

for (const [w, h, label] of [[1280, 800, "десктоп 1280×800"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', hasTouch: w < 768, isMobile: w < 768 })
  const page = await ctx.newPage()
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#root > *', { timeout: 20000 })
  await page.waitForTimeout(400)
  await seed(page, 40)
  console.log(`\n=== ${label} ===`)
  const results = []
  const total = await (async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('nav.tabs', { timeout: 20000 })
    await page.waitForTimeout(500)
    await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
    await page.waitForTimeout(500)
    return page.locator('button[aria-label^="Удалить измерение"]').count()
  })()
  console.log(`строк в истории: ${total}`)

  for (const idx of [0, 4, 9, 19, 34]) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('nav.tabs', { timeout: 20000 })
    await page.waitForTimeout(450)
    await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
    await page.waitForTimeout(450)
    const btn = page.locator('button[aria-label^="Удалить измерение"]').nth(idx)
    const b0 = await btn.boundingBox()
    // человек листает так, чтобы корзина оказалась примерно в середине экрана
    const want = Math.max(0, b0.y - Math.round(h * 0.55))
    await page.evaluate((y) => window.scrollTo(0, y), want)
    await page.waitForTimeout(300)
    const bb = await btn.boundingBox()
    if (w < 768) await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2)
    else await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2)
    await page.waitForTimeout(500)
    const info = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Вернуть')
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { vpTop: Math.round(r.top), inView: r.bottom > 0 && r.top < innerHeight, scrollY: Math.round(scrollY) }
    })
    results.push({ строка: idx + 1, ...info })
    console.log(`строка ${String(idx + 1).padStart(2)}: баннер vpTop=${String(info.vpTop).padStart(6)}  в кадре: ${info.inView ? 'ДА' : 'нет'}  (scrollY=${info.scrollY})`)
  }
  await ctx.close()
}
await browser.close()
