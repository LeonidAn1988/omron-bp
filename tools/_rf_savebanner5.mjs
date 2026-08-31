import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from './visual.mjs'

const URL = process.env.URL ?? 'http://localhost:5199'

const BREAK = (stores) => {
  const orig = IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put = function (...a) {
    if (stores.includes(this.name)) throw new DOMException('quota', 'QuotaExceededError')
    return orig.apply(this, a)
  }
}

const PROBE = () => {
  const b = [...document.querySelectorAll('.banner')].find((x) =>
    x.innerText.includes('Последнее изменение не сохранилось'),
  )
  // .innerText у скрытого overflow всё равно отдаёт текст, поэтому ищем ещё и по <b>
  const b2 =
    b ??
    [...document.querySelectorAll('.banner b')].find((x) => x.textContent.includes('Последнее изменение'))?.closest('.banner')
  if (!b2) return { present: false }
  const rev = b2.closest('.reveal')
  const r = b2.getBoundingClientRect()
  const rr = rev.getBoundingClientRect()
  return {
    present: true,
    revealOpen: rev.dataset.open,
    inert: rev.hasAttribute('inert'),
    revealHeight: Math.round(rr.height),
    bannerHeight: Math.round(r.height),
    docTop: Math.round(rr.top + scrollY),
    doc: document.documentElement.scrollHeight,
  }
}

const browser = await chromium.launch()

async function boot(stores) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    colorScheme: 'dark', deviceScaleFactor: 2, ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction(['meta'], 'readonly'); const g = tx.objectStore('meta').get('settings'); g.onsuccess = () => res(g.result || {}) })
    await new Promise((res, rej) => { const tx = db.transaction(['meta'], 'readwrite'); tx.objectStore('meta').put({ ...cur, trackGlucose: true, onboarded: true }, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  })
  if (stores.length) await page.addInitScript(BREAK, stores)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.waitForTimeout(800)
  return { ctx, page }
}

// 1) Здоровое приложение, никакого отказа. Что вообще лежит на 3015?
{
  const { ctx, page } = await boot([])
  console.log('1. «Обзор», отказа не было:', JSON.stringify(await page.evaluate(PROBE)))
  await go(page, { tab: 'Давление' })
  console.log('1. «Давление», отказа не было:', JSON.stringify(await page.evaluate(PROBE)))
  await ctx.close()
}

// 2) Отказ записи давления (handleAdd без try/catch)
{
  const { ctx, page } = await boot(['readings'])
  await go(page, { tab: 'Давление' })
  const f = page.locator('.app input[inputmode="numeric"]')
  await f.nth(0).fill('150'); await f.nth(1).fill('95'); await f.nth(2).fill('80')
  await page.locator('.app button', { hasText: /^Добавить$/ }).first().click()
  await page.waitForTimeout(900)
  console.log('2. «Давление» после провала записи:', JSON.stringify(await page.evaluate(PROBE)))
  await go(page, { tab: 'Обзор' })
  await page.waitForTimeout(300)
  console.log('2. затем «Обзор»:', JSON.stringify(await page.evaluate(PROBE)))
  await ctx.close()
}

// 3) Настоящий отказ — «Принял» на «Приёме»
{
  const { ctx, page } = await boot(['medicines'])
  await go(page, { tab: 'Приём' })
  await page.locator('.app button', { hasText: /^Принял$/ }).first().click()
  await page.waitForTimeout(800)
  console.log('3. «Приём» после провала «Принял»:', JSON.stringify(await page.evaluate(PROBE)))
  await go(page, { tab: 'Обзор' })
  await page.waitForTimeout(300)
  console.log('3. затем «Обзор»:', JSON.stringify(await page.evaluate(PROBE)))
  await ctx.close()
}

await browser.close()
