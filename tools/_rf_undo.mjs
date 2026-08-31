/**
 * Попытка опровергнуть находку про баннер «Вернуть» после удаления измерения.
 * Меряем на собранном приложении, 375x812, 40 записей давления.
 */
import { chromium } from 'playwright'

const URL = process.env.URL ?? 'http://127.0.0.1:4712/index.html'
const FROZEN = Date.UTC(2026, 7, 15, 7, 30) // 2026-08-15T10:30 MSK

const seed = async (page, n) => {
  await page.evaluate(async ([now, count]) => {
    const DAY = 86400000
    const readings = []
    for (let i = 0; i < count; i++) {
      readings.push({
        id: `bp-${i}`, kind: 'bp', ts: now - i * DAY * 0.5, user: 1, source: 'manual',
        sys: 128 + (i % 7), dia: 82 + (i % 4), bpm: 68 + (i % 5),
        ihb: i % 11 === 0, mov: false,
      })
    }
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3)
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
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

const geom = (page) => page.evaluate(() => {
  const q = (sel) => document.querySelector(sel)
  const cards = [...document.querySelectorAll('.card')]
  const hist = cards.find((c) => c.querySelector('h2')?.textContent?.includes('История'))
  const trashes = [...document.querySelectorAll('button[aria-label^="Удалить измерение"]')]
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { docTop: Math.round(r.top + scrollY), vpTop: Math.round(r.top), h: Math.round(r.height) }
  }
  return {
    docH: Math.round(document.documentElement.scrollHeight),
    scrollY: Math.round(scrollY),
    innerH: innerHeight,
    histTop: hist ? Math.round(hist.getBoundingClientRect().top + scrollY) : null,
    rows: trashes.length,
    trash10: box(trashes[9]),
    trashLast: box(trashes[trashes.length - 1]),
  }
})

const undoInfo = (page) => page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Вернуть')
  if (!btns.length) return { present: false }
  const b = btns[0]
  const r = b.getBoundingClientRect()
  // ищем ближайший контейнер с живой областью
  let live = null, node = b
  while (node && node !== document.body) {
    if (node.getAttribute?.('role') || node.getAttribute?.('aria-live')) {
      live = { tag: node.tagName, role: node.getAttribute('role'), ariaLive: node.getAttribute('aria-live') }
      break
    }
    node = node.parentElement
  }
  const reveal = b.closest('.reveal')
  const inView = r.bottom > 0 && r.top < innerHeight
  return {
    present: true,
    vpTop: Math.round(r.top), vpBottom: Math.round(r.bottom),
    docTop: Math.round(r.top + scrollY),
    w: Math.round(r.width), h: Math.round(r.height),
    scrollY: Math.round(scrollY), innerH: innerHeight,
    inView,
    revealOpen: reveal?.dataset?.open ?? null,
    revealInert: reveal?.hasAttribute('inert') ?? null,
    liveRegionAncestor: live,
    sticky: getComputedStyle(b.closest('div[class*="no-print"]') ?? b).position,
  }
})

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
  hasTouch: true, isMobile: true, deviceScaleFactor: 3,
})
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#root > *', { timeout: 20000 })
await page.waitForTimeout(500)
await seed(page, 40)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(600)

await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
await page.waitForTimeout(600)

const g0 = await geom(page)
console.log('ДО удаления:', JSON.stringify(g0))

// человек прокручивает так, чтобы корзина 10-й строки была в середине экрана
const target = g0.trash10.docTop - Math.round(812 / 2)
await page.evaluate((y) => window.scrollTo(0, y), target)
await page.waitForTimeout(400)
const g1 = await geom(page)
console.log('после прокрутки:', JSON.stringify({ scrollY: g1.scrollY, trash10vp: g1.trash10.vpTop, histTop: g1.histTop }))

// касание ровно по корзине, без авто-прокрутки Playwright
const t = g1.trash10
const bb = await page.locator('button[aria-label^="Удалить измерение"]').nth(9).boundingBox()
console.log('тап по', JSON.stringify(bb))
await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2)
await page.waitForTimeout(600)

const u = await undoInfo(page)
console.log('БАННЕР сразу после удаления:', JSON.stringify(u, null, 1))
const g2 = await geom(page)
console.log('ПОСЛЕ удаления:', JSON.stringify({ scrollY: g2.scrollY, docH: g2.docH, rows: g2.rows, histTop: g2.histTop }))

// Playwright-видимость
const vis = await page.getByRole('button', { name: 'Вернуть', exact: true }).first().isVisible().catch(() => 'err')
console.log('isVisible (Playwright):', vis)
await page.screenshot({ path: '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/_rf_undo_after.png' })

// таймер
await page.waitForTimeout(7000)
const at7 = await undoInfo(page)
await page.waitForTimeout(2000)
const at9 = await undoInfo(page)
console.log('через ~7.6 с:', at7.present ? `есть (reveal open=${at7.revealOpen})` : 'нет')
console.log('через ~9.6 с:', at9.present ? `есть (reveal open=${at9.revealOpen})` : 'нет')

// самая старая запись
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(600)
await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
await page.waitForTimeout(600)
const g3 = await geom(page)
await page.evaluate((y) => window.scrollTo(0, y), g3.trashLast.docTop - 400)
await page.waitForTimeout(400)
const bb2 = await page.locator('button[aria-label^="Удалить измерение"]').last().boundingBox()
await page.touchscreen.tap(bb2.x + bb2.width / 2, bb2.y + bb2.height / 2)
await page.waitForTimeout(600)
const uLast = await undoInfo(page)
console.log('последняя строка → баннер:', JSON.stringify({ vpTop: uLast.vpTop, scrollY: uLast.scrollY, inView: uLast.inView, ekranov: uLast.vpTop ? (uLast.vpTop / 812).toFixed(1) : null }))

await browser.close()
