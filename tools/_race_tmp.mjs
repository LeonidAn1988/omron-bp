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

// --- 2. Порог по задержке между двумя нажатиями
const rows = []
for (const delay of [0, 2, 5, 10, 20, 40, 80, 150, 250, 400]) {
  await seed(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openIntake(page)
  const n = await page.evaluate(async (d) => {
    const btns = [...document.querySelectorAll('.dose button')].filter((b) => b.textContent.trim() === 'Принял')
    if (btns.length !== 2) return { err: 'кнопок: ' + btns.length }
    btns[0].click()
    await new Promise((r) => setTimeout(r, d))
    btns[1].click()
    await new Promise((r) => setTimeout(r, 1200))
    return { ok: true }
  }, delay)
  if (n.err) { console.log(delay, n.err); continue }
  const st = await readTaken(page)
  rows.push({ delay, отметок: st.taken.length, left: st.left })
}
console.table(rows)
await browser.close()
