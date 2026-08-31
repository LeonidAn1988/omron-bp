/**
 * Опровержение находки про saveBanner: где баннер оказывается в тот момент,
 * когда он реально поднимается, и есть ли у человека второй сигнал на месте.
 */
import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from './visual.mjs'

const URL = process.env.URL ?? 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const BREAK = () => {
  const orig = IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'medicines' && !window.__allowMed) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }
    return orig.apply(this, args)
  }
}

const measure = (label) =>
  // eslint-disable-next-line no-undef
  ({ label })

const browser = await chromium.launch()

for (const scale of ['normal', 'xlarge']) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    colorScheme: 'dark',
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const cur = await new Promise((res) => {
      const tx = db.transaction(['meta'], 'readonly')
      const g = tx.objectStore('meta').get('settings')
      g.onsuccess = () => res(g.result || {})
    })
    await new Promise((res, rej) => {
      const tx = db.transaction(['meta'], 'readwrite')
      tx.objectStore('meta').put({ ...cur, trackGlucose: true, onboarded: true, textScale: s }, 'settings')
      tx.oncomplete = res
      tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, scale)

  // Ломаем запись в аптечку — но только после посева.
  await page.addInitScript(BREAK)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)

  await go(page, { tab: 'Приём' })

  // Худший случай: человек прокрутил «Приём» до низа и жмёт «Принял» там.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(200)

  const btns = page.locator('button', { hasText: /^Принял$/ })
  const n = await btns.count()
  const target = btns.nth(n - 1)
  await target.scrollIntoViewIfNeeded()
  await page.waitForTimeout(150)

  const before = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-done]')].length
    const head = document.body.innerText.match(/осталось отметить: (\d+)/)
    return { doneRows: rows, left: head ? head[1] : null }
  })
  const btnBox = await target.boundingBox()
  await target.click()
  await page.waitForTimeout(700)

  const onIntake = await page.evaluate((bb) => {
    const b = document.querySelector('.banner--critical')
    const doc = document.documentElement.scrollHeight
    if (!b) return { banner: null, doc }
    const r = b.getBoundingClientRect()
    return {
      doc,
      scrollY: window.scrollY,
      vh: window.innerHeight,
      bannerDocTop: Math.round(r.top + window.scrollY),
      bannerViewportTop: Math.round(r.top),
      visibleNow: r.bottom > 0 && r.top < window.innerHeight,
      distFromTapPx: bb ? Math.round(Math.abs(r.top + window.scrollY - (bb.y + window.scrollY))) : null,
      text: b.innerText.slice(0, 60).replace(/\s+/g, ' '),
    }
  }, btnBox)

  const after = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-done]')].length
    const head = document.body.innerText.match(/осталось отметить: (\d+)/)
    const stillPrinyal = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Принял').length
    return { doneRows: rows, left: head ? head[1] : null, printyalButtons: stillPrinyal }
  })

  await page.screenshot({ path: `${OUT}/sb-intake-${scale}.png` })

  // Теперь уходим на «Обзор» — там баннер действительно падает вниз.
  await go(page, { tab: 'Обзор' })
  await page.waitForTimeout(400)
  const onOverview = await page.evaluate(() => {
    const b = document.querySelector('.banner--critical')
    const doc = document.documentElement.scrollHeight
    if (!b) return { banner: null, doc }
    const r = b.getBoundingClientRect()
    return { doc, bannerDocTop: Math.round(r.top + window.scrollY), scrollY: window.scrollY }
  })

  console.log('#####', scale)
  console.log('  на «Приёме» (там, где отказ и происходит):', JSON.stringify(onIntake, null, 2))
  console.log('  отметки до нажатия :', JSON.stringify(before))
  console.log('  отметки после      :', JSON.stringify(after))
  console.log('  на «Обзоре» (перенесённый баннер):', JSON.stringify(onOverview))
  await ctx.close()
}

await browser.close()
