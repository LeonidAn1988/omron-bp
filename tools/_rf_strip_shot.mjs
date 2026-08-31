import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from './visual.mjs'

const URL = process.env.URL ?? 'http://localhost:5311'
const OUT = process.env.OUT
const VW = Number(process.env.VW || 406)

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: VW, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2 })
const page = await context.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(800)
await seed(page, FROZEN)
await page.evaluate(async ([t, d]) => {
  const db = await new Promise((res, rej) => { const q = indexedDB.open('omron-bp', 3); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
  await new Promise((res, rej) => { const tx = db.transaction(['meta'], 'readwrite'); tx.objectStore('meta').put({ trackGlucose: true, onboarded: true, textScale: t, density: d, theme: 'dark' }, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
}, [process.env.TXT || 'xlarge', process.env.DEN || 'roomy'])
await page.reload({ waitUntil: 'domcontentloaded' })
await settle(page)
await go(page, { tab: 'Обзор' })
await page.waitForTimeout(500)
await page.locator('.stats-strip').first().scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
await page.locator('.stats-strip').first().screenshot({ path: OUT })
console.log('saved', OUT)
await browser.close()
