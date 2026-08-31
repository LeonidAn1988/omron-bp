import { chromium } from 'playwright'
import { FROZEN, seed } from './visual.mjs'
const URL = 'http://localhost:5199'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 375, height: 805 }, deviceScaleFactor: 3.25, isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark' })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction(['meta'],'readonly'); const g = tx.objectStore('meta').get('settings'); g.onsuccess = () => res(g.result || {}) })
  await new Promise((res, rej) => { const tx = db.transaction(['meta'],'readwrite'); tx.objectStore('meta').put({ ...cur, onboarded: true, textScale: 'xlarge', density: 'roomy' }, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 }); await page.waitForTimeout(600)
await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click(); await page.waitForTimeout(500)

const manual = () => page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const all = await new Promise((res) => { const tx = db.transaction(['readings'],'readonly'); const g = tx.objectStore('readings').getAll(); g.onsuccess = () => res(g.result || []) })
  db.close(); return all.filter(x => x.source === 'manual' && x.kind === 'bp').map(x => `${x.sys}/${x.dia}`)
})

await page.locator('.wheel--y').nth(0).locator('.wheel__item', { hasText: /^143$/ }).first().click(); await page.waitForTimeout(400)
await page.locator('.wheel--y').nth(1).locator('.wheel__item', { hasText: /^91$/ }).first().click(); await page.waitForTimeout(700)
const before = await manual()
console.log('до:', before.filter(v => v === '143/91').length, 'шт 143/91')

// БЫСТРЫЙ ДВОЙНОЙ ТАП по «Добавить» — гонка вокруг await onAdd()
await page.locator('.form-actions .btn').dispatchEvent('click')
await page.locator('.form-actions .btn').dispatchEvent('click')
await page.locator('.form-actions .btn').dispatchEvent('click')
await page.waitForTimeout(1500)
const after = await manual()
console.log('после трёх мгновенных нажатий:', after.filter(v => v === '143/91').length, 'шт 143/91')

// и настоящий двойной тап пальцем
await page.locator('.wheel--y').nth(0).locator('.wheel__item', { hasText: /^152$/ }).first().click(); await page.waitForTimeout(400)
await page.locator('.wheel--y').nth(1).locator('.wheel__item', { hasText: /^97$/ }).first().click(); await page.waitForTimeout(700)
const box = await page.locator('.form-actions .btn').boundingBox()
await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2)
await page.touchscreen.tap(box.x + box.width/2, box.y + box.height/2)
await page.waitForTimeout(1500)
const after2 = await manual()
console.log('после двойного тапа пальцем:', after2.filter(v => v === '152/97').length, 'шт 152/97')

// текст ошибки после второго нажатия
console.log('баннер сейчас:', await page.evaluate(() => document.querySelector('form.card [role="alert"]')?.textContent || '—'))
await browser.close()
