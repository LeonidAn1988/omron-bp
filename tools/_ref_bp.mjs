import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { FROZEN } from './visual.mjs'

const URL = 'http://localhost:5199'
const OUT = process.env.OUT
mkdirSync(OUT, { recursive: true })

// 49 измерений давления — как в находке
async function seed49(page, frozen) {
  await page.evaluate(async (now) => {
    const DAY = 86400000
    const at = (d, h) => now + d * DAY - (new Date(now).getHours() - h) * 3600000
    const readings = []
    for (let i = -48; i <= 0; i++) {
      readings.push({
        id: `bp-${i}`, kind: 'bp', ts: at(i, 8) + 600000, user: 1, source: 'manual',
        sys: 128 + ((i % 7) + 7) % 7, dia: 82 + ((i % 4) + 4) % 4,
        bpm: 68 + ((i % 5) + 5) % 5, ihb: i % 11 === 0, mov: false,
      })
    }
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction(['readings'], 'readwrite')
      readings.forEach((r) => tx.objectStore('readings').put(r))
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, frozen)
}

const run = async (label, width, height, textScale) => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light',
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await seed49(page, FROZEN)
  await page.evaluate(async (ts) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    const cur = await new Promise((res) => {
      const tx = db.transaction(['meta'], 'readonly'); const g = tx.objectStore('meta').get('settings')
      g.onsuccess = () => res(g.result || {})
    })
    await new Promise((res, rej) => {
      const tx = db.transaction(['meta'], 'readwrite')
      tx.objectStore('meta').put({ ...cur, onboarded: true, textScale: ts }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, textScale)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 15000 })
  await page.waitForTimeout(800)

  await page.locator('nav.tabs button', { hasText: 'Давл' }).first().click()
  await page.waitForTimeout(600)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)

  const r = await page.evaluate(() => {
    const vh = innerHeight
    const form = document.querySelector('form.card')
    const cards = [...document.querySelectorAll('.stack > .card')]
    const hist = cards.find((c) => c.querySelector('h2')?.textContent?.includes('История давления'))
    const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) } }
    const nav = document.querySelector('nav.tabs')
    const navTop = nav ? Math.round(nav.getBoundingClientRect().top) : null
    // что реально видно в первом экране (не перекрыто навигацией)
    const visibleTexts = []
    const walk = (el) => {
      for (const n of el.children) {
        const b = n.getBoundingClientRect()
        if (b.top < (navTop ?? vh) && b.bottom > 0 && b.height > 0 && b.width > 0) {
          if (n.children.length === 0 && n.textContent.trim()) visibleTexts.push(n.textContent.trim().slice(0, 60))
          else walk(n)
        }
      }
    }
    walk(document.body)
    const histHead = hist?.querySelector('.card__head')
    const histCounter = hist?.querySelector('.card__head .muted')?.textContent?.replace(/\s+/g, ' ').trim()
    const rowsCount = hist ? hist.querySelectorAll('tbody tr, li').length : null
    return {
      vh, docH: Math.round(document.documentElement.scrollHeight),
      form: box(form), hist: box(hist), histHead: box(histHead),
      navTop, histCounter, rowsCount,
      histVisiblePx: hist ? Math.max(0, Math.min(box(hist).bottom, navTop ?? vh) - Math.max(box(hist).top, 0)) : 0,
      histHeadVisiblePx: histHead ? Math.max(0, Math.min(box(histHead).bottom, navTop ?? vh) - Math.max(box(histHead).top, 0)) : 0,
      visibleTexts: visibleTexts.filter((t) => !/^[0-9]{1,3}$/.test(t)),
    }
  })
  console.log('\n===', label, `${width}x${height} text=${textScale}`)
  console.log(JSON.stringify(r, null, 1))
  await page.screenshot({ path: `${OUT}/${label}.png` })
  await browser.close()
}

const cases = [
  ['iPhone12-390x844-normal', 390, 844, 'normal'],
  ['iPhone12-390x844-xlarge', 390, 844, 'xlarge'],
  ['harness-390x900-normal', 390, 900, 'normal'],
  ['harness-390x900-xlarge', 390, 900, 'xlarge'],
  ['GalaxyS-360x800-normal', 360, 800, 'normal'],
  ['GalaxyS-360x800-xlarge', 360, 800, 'xlarge'],
  ['SE-375x667-normal', 375, 667, 'normal'],
  ['SE-375x667-xlarge', 375, 667, 'xlarge'],
  ['old-360x640-xlarge', 360, 640, 'xlarge'],
]
for (const c of cases) await run(...c)
