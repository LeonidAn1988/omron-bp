import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from './visual.mjs'

const URL = process.env.URL ?? 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const BREAK = (stores) => {
  const orig = IDBObjectStore.prototype.put
  const origDel = IDBObjectStore.prototype.delete
  IDBObjectStore.prototype.put = function (...a) {
    if (stores.includes(this.name)) throw new DOMException('quota', 'QuotaExceededError')
    return orig.apply(this, a)
  }
  IDBObjectStore.prototype.delete = function (...a) {
    if (stores.includes(this.name)) throw new DOMException('quota', 'QuotaExceededError')
    return origDel.apply(this, a)
  }
  window.__unhandled = []
  addEventListener('unhandledrejection', (e) => window.__unhandled.push(String(e.reason)))
}

// Ищем ИМЕННО saveBanner — по тексту, а не по классу: критических баннеров на
// «Обзоре» может быть несколько.
const PROBE = () => {
  const all = [...document.querySelectorAll('.banner')]
  const save = all.find((b) => b.innerText.includes('Последнее изменение не сохранилось'))
  const r = save?.getBoundingClientRect()
  return {
    doc: document.documentElement.scrollHeight,
    vh: innerHeight,
    scrollY: Math.round(scrollY),
    allCritical: all.filter((b) => b.className.includes('critical')).map((b) => b.innerText.replace(/\s+/g, ' ').slice(0, 46)),
    saveBanner: save
      ? {
          docTop: Math.round(r.top + scrollY),
          viewportTop: Math.round(r.top),
          visibleNow: r.bottom > 0 && r.top < innerHeight,
        }
      : null,
  }
}

const browser = await chromium.launch()

async function boot(scale, stores) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    colorScheme: 'dark', deviceScaleFactor: 2, ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction(['meta'], 'readonly'); const g = tx.objectStore('meta').get('settings'); g.onsuccess = () => res(g.result || {}) })
    await new Promise((res, rej) => { const tx = db.transaction(['meta'], 'readwrite'); tx.objectStore('meta').put({ ...cur, trackGlucose: true, onboarded: true, textScale: s }, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, scale)
  await page.addInitScript(BREAK, stores)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.waitForTimeout(800)
  return { ctx, page }
}

// ── A. Отказ при вводе давления: поднимается ли saveBanner вообще?
{
  const { ctx, page } = await boot('normal', ['readings'])
  await go(page, { tab: 'Давление' })
  await page.waitForTimeout(300)
  const f = page.locator('.app input[inputmode="numeric"]')
  await f.nth(0).fill('150'); await f.nth(1).fill('95'); await f.nth(2).fill('80')
  await page.locator('.app button', { hasText: /^Добавить$/ }).first().click()
  await page.waitForTimeout(900)
  const r = await page.evaluate(PROBE)
  const u = await page.evaluate(() => window.__unhandled)
  console.log('A. «Давление», запись провалилась:', JSON.stringify({ ...r, unhandled: u }, null, 2))
  await go(page, { tab: 'Обзор' })
  await page.waitForTimeout(400)
  console.log('A. затем «Обзор»:', JSON.stringify(await page.evaluate(PROBE), null, 2))
  await ctx.close()
}

// ── B. Отказ при «Принял» на «Приёме» — там, где saveBanner действительно живёт.
for (const scale of ['normal', 'xlarge']) {
  const { ctx, page } = await boot(scale, ['medicines'])
  await go(page, { tab: 'Приём' })
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(250)
  const btns = page.locator('.app button', { hasText: /^Принял$/ })
  const n = await btns.count()
  const target = btns.nth(n - 1)
  await target.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  const before = await page.evaluate(() => ({
    left: document.body.innerText.match(/осталось отметить: (\d+)/)?.[1] ?? null,
    done: document.querySelectorAll('[data-done]').length,
    printyal: [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Принял').length,
  }))
  await target.click()
  await page.waitForTimeout(800)
  const r = await page.evaluate(PROBE)
  const after = await page.evaluate(() => ({
    left: document.body.innerText.match(/осталось отметить: (\d+)/)?.[1] ?? null,
    done: document.querySelectorAll('[data-done]').length,
    printyal: [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Принял').length,
  }))
  console.log(`B[${scale}]. «Приём», «Принял» провалился:`, JSON.stringify(r, null, 2))
  console.log(`B[${scale}]. отметки до/после:`, JSON.stringify(before), '→', JSON.stringify(after))
  await page.screenshot({ path: `${OUT}/sb4-intake-${scale}.png` })
  await go(page, { tab: 'Обзор' })
  await page.waitForTimeout(400)
  console.log(`B[${scale}]. затем «Обзор»:`, JSON.stringify(await page.evaluate(PROBE)))
  await ctx.close()
}

await browser.close()
