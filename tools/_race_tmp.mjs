import { chromium } from 'playwright'
const URL = 'http://localhost:5299'

const seed = async (page) => {
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3)
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction(['medicines','meta'], 'readwrite')
      tx.objectStore('medicines').clear()
      tx.objectStore('medicines').put({
        id: 'm1', name: 'Конкор', dose: '5 мг', inn: 'Бисопролол', form: 'Таблетки',
        maker: 'Мерк', packSize: 30, left: 20, perDay: null, expires: Date.UTC(2027,4,31),
        times: ['08:00','20:00'], perTime: 1, taken: [], leftAt: Date.now() - 86400000,
        since: Date.now() - 30*86400000,
      })
      tx.objectStore('meta').put({ trackGlucose: true }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  })
}

const readTaken = (page) => page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('omron-bp', 3)
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  const out = await new Promise((res, rej) => {
    const tx = db.transaction(['medicines'], 'readonly')
    const q = tx.objectStore('medicines').get('m1')
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error)
  })
  db.close()
  return { taken: (out.taken ?? []).slice().sort(), left: out.left }
})

const openIntake = async (page) => {
  await page.waitForSelector('nav.tabs', { timeout: 15000 })
  await page.locator('nav.tabs button', { hasText: 'Приём' }).first().click()
  await page.waitForTimeout(400)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 2400 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 })
await seed(page)

// --- 1. Длительность окна: клик -> строка показала «принято»
await page.reload({ waitUntil: 'domcontentloaded' })
await openIntake(page)
const windowMs = await page.evaluate(async () => {
  const btn = [...document.querySelectorAll('.dose button')].find((b) => b.textContent.trim() === 'Принял')
  if (!btn) return 'нет кнопки'
  const li = btn.closest('li')
  const t0 = performance.now()
  const done = new Promise((res) => {
    const obs = new MutationObserver(() => {
      if (li.textContent.includes('принято')) { obs.disconnect(); res(performance.now() - t0) }
    })
    obs.observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  btn.click()
  return await done
})
console.log('окно клик→«принято», мс:', windowMs)

// --- Повторное нажатие ОДНОЙ кнопки (реальный «дабл-тап»)
for (const delay of [0, 40, 120]) {
  await seed(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openIntake(page)
  await page.evaluate(async (d) => {
    const btns = [...document.querySelectorAll('.dose button')].filter((b) => b.textContent.trim() === 'Принял')
    btns[0].click()
    if (d > 0) await new Promise((r) => setTimeout(r, d))
    btns[0].click()
    await new Promise((r) => setTimeout(r, 1000))
  }, delay)
  const st = await readTaken(page)
  console.log('дабл-тап одной кнопки, пауза', delay, 'мс → отметок:', st.taken.length, '| дубли:', new Set(st.taken).size !== st.taken.length, '| остаток:', st.left)
}

// --- Две РАЗНЫЕ строки, но человеческий темп нажатий через Playwright (реальные события мыши)
for (const пауза of [0, 30]) {
  await seed(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openIntake(page)
  const кнопки = page.locator('.dose button', { hasText: 'Принял' })
  await кнопки.nth(0).click({ force: true })
  if (пауза) await page.waitForTimeout(пауза)
  await page.locator('.dose button', { hasText: 'Принял' }).first().click({ force: true })
  await page.waitForTimeout(1000)
  const st = await readTaken(page)
  console.log('настоящие клики Playwright подряд (пауза', пауза, 'мс) → отметок:', st.taken.length)
}

await browser.close()
