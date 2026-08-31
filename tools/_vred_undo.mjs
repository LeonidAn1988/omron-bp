/** Проверка находки про баннер «Вернуть». Мой независимый замер. */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/vredundo'
mkdirSync(OUT, { recursive: true })

async function seed(page, now, n) {
  await page.evaluate(async ([now, n]) => {
    const DAY = 86400000
    const midnight = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime() }
    const day0 = midnight(now)
    const readings = []
    for (let i = 0; i < n; i++) {
      const ts = day0 - i * (DAY / 2) + 8 * 3600000
      readings.push({
        id: `d1-${Math.floor(ts / 1000)}`, kind: 'bp', ts, user: 1, source: 'device',
        sys: 128 + (i % 9), dia: 80 + (i % 6), bpm: 66 + (i % 7),
        ihb: i % 13 === 0, mov: false,
      })
    }
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    await new Promise((res, rej) => {
      const tx = db.transaction(['readings', 'meta'], 'readwrite')
      readings.forEach((r) => tx.objectStore('readings').put(r))
      tx.objectStore('meta').put({ onboarded: true, textScale: 'normal', density: 'normal' }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, [now, n])
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await seed(page, FROZEN, 40)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
await page.waitForTimeout(600)
await page.waitForSelector('.readings-table tbody tr')

// геометрия целей: карандаш и корзина
const geom = await page.evaluate(() => {
  const rect = (e) => { const b = e.getBoundingClientRect(); return { l:+b.left.toFixed(1), t:+b.top.toFixed(1), w:+b.width.toFixed(1), h:+b.height.toFixed(1) } }
  const rows = [...document.querySelectorAll('.readings-table tbody tr')]
  const r0 = rows[0], r1 = rows[1]
  const p = r0.querySelector('.row-edit'), t = r0.querySelector('.btn--icon')
  const t1 = r1 ? r1.querySelector('.btn--icon') : null
  const pR = rect(p), tR = rect(t)
  return {
    rowCount: rows.length,
    pencil: pR, trash: tR,
    gapPencilTrash: +(tR.l - (pR.l + pR.w)).toFixed(1),
    gapTrashToNextTrash: t1 ? +(rect(t1).t - (tR.t + tR.h)).toFixed(1) : null,
    docHeight: document.documentElement.scrollHeight,
    cardTop: document.querySelectorAll('.card')[0].getBoundingClientRect().top + window.scrollY,
  }
})
console.log('ГЕОМЕТРИЯ', JSON.stringify(geom, null, 1))

// удаляем 10-ю строку
const rows = page.locator('.readings-table tbody tr')
const target = rows.nth(9)
await target.scrollIntoViewIfNeeded()
await page.waitForTimeout(200)
const before = await page.evaluate(() => ({ scrollY: window.scrollY, n: document.querySelectorAll('.readings-table tbody tr').length }))
const trashBox = await target.locator('.btn--icon').boundingBox()
await target.locator('.btn--icon').click()
await page.waitForTimeout(500)

const after = await page.evaluate(() => {
  const rev = [...document.querySelectorAll('.reveal[data-open="true"]')]
  const undo = rev.find((r) => /Вернуть/.test(r.innerText))
  const btn = undo ? [...undo.querySelectorAll('button')].find((b) => /Вернуть/.test(b.innerText)) : null
  const b = btn ? btn.getBoundingClientRect() : null
  return {
    scrollY: window.scrollY,
    rows: document.querySelectorAll('.readings-table tbody tr').length,
    bannerFound: !!undo,
    bannerTopViewport: b ? +b.top.toFixed(1) : null,
    bannerTopDoc: b ? +(b.top + window.scrollY).toFixed(1) : null,
    inViewport: b ? (b.top < window.innerHeight && b.bottom > 0) : false,
    ariaLive: undo ? (undo.querySelector('[aria-live],[role="status"]') ? 'есть' : 'нет') : null,
    outerRole: undo ? undo.closest('[role]')?.getAttribute('role') ?? 'нет' : null,
    bannerText: undo ? undo.innerText.replace(/\s+/g,' ').trim() : null,
  }
})
console.log('ПОСЛЕ УДАЛЕНИЯ', JSON.stringify({ trashBox, before, after }, null, 1))
await page.screenshot({ path: `${OUT}/after_delete.png` })

// через 8 секунд
await page.clock.runFor(8500)
await page.waitForTimeout(300)
const gone = await page.evaluate(() => {
  const rev = [...document.querySelectorAll('.reveal')]
  const undo = rev.find((r) => /Вернуть/.test(r.innerText))
  return { stillOpen: undo ? undo.dataset.open : 'элемента нет', anyUndoVisible: !!document.querySelector('.reveal[data-open="true"]') }
})
console.log('ЧЕРЕЗ 8 с', JSON.stringify(gone))

await browser.close()
