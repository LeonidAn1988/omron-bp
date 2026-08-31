import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

async function run(label, opts) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 780 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2, ...opts,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await seed(page, FROZEN)
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(500)
  await go(page, { tab: 'Аптечка', click: 'Добавить препарат' })
  await page.waitForTimeout(400)
  const input = page.locator('.suggest input').first()
  await input.click(); await input.fill('Индапамид'); await page.waitForTimeout(900)
  await page.locator('.suggest__item').nth(0).dispatchEvent('mousedown')
  await page.waitForTimeout(500)

  console.log(`\n########## ${label} ##########`)
  const before = await page.evaluate(() => {
    const de = document.documentElement
    const group = [...document.querySelectorAll('.chips')].find(c => c.getAttribute('aria-label') === 'Формы выпуска из реестра')
    const chips = group ? [...group.querySelectorAll('.chip')] : []
    const b = el => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) } }
    return {
      innerWidth, clientWidth: de.clientWidth, scrollWidth: de.scrollWidth,
      visualVW: Math.round(visualViewport.width), visualScale: visualViewport.scale,
      formChips: chips.map(c => ({ t: c.textContent.trim(), ...b(c) })),
    }
  })
  console.log(JSON.stringify(before, null, 1))

  // Сколько текста видно на экране у самого длинного чипа
  const vis = await page.evaluate(() => {
    const group = [...document.querySelectorAll('.chips')].find(c => c.getAttribute('aria-label') === 'Формы выпуска из реестра')
    if (!group) return null
    const chips = [...group.querySelectorAll('.chip')]
    const vw = document.documentElement.clientWidth
    return chips.map(c => {
      const txt = c.textContent.trim()
      const node = c.firstChild
      const range = document.createRange()
      let cut = txt.length
      for (let i = 1; i <= txt.length; i++) {
        range.setStart(node, 0); range.setEnd(node, i)
        if (range.getBoundingClientRect().right > vw) { cut = i - 1; break }
      }
      return { full: txt, visible: txt.slice(0, cut), cutAt: cut, ofLen: txt.length }
    })
  })
  console.log('=== видимая часть текста при окне 360 ===')
  vis.forEach(v => console.log(`  [${v.cutAt}/${v.ofLen}] «${v.visible}»`))

  // Реально ли уезжает страница и что делает липкая навигация
  const scroll = await page.evaluate(() => {
    const nav = document.querySelector('nav.tabs')
    const navBefore = nav.getBoundingClientRect()
    const posBefore = getComputedStyle(nav).position
    window.scrollTo(9999, 0)
    const navAfter = nav.getBoundingClientRect()
    return {
      navPosition: posBefore,
      scrollX: window.scrollX,
      navBefore: { l: Math.round(navBefore.left), r: Math.round(navBefore.right) },
      navAfter: { l: Math.round(navAfter.left), r: Math.round(navAfter.right) },
    }
  })
  console.log('=== горизонтальная прокрутка ===')
  console.log(JSON.stringify(scroll))
  await page.evaluate(() => window.scrollTo(0, 0))

  // Тап по длинному чипу: что показывается после выбора
  const long = page.locator('.chips[aria-label="Формы выпуска из реестра"] .chip').last()
  await long.click({ force: true, position: { x: 20, y: 20 } })
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => {
    const de = document.documentElement
    const echo = [...document.querySelectorAll('.muted')].map(e => e.textContent.trim()).filter(t => t.startsWith('Форма:'))
    const echoEl = [...document.querySelectorAll('.muted')].find(e => e.textContent.trim().startsWith('Форма:'))
    const er = echoEl ? echoEl.getBoundingClientRect() : null
    const doseChips = [...document.querySelectorAll('.chips[aria-label="Дозировки из реестра"] .chip')].map(c=>c.textContent.trim())
    const pressed = [...document.querySelectorAll('.chips[aria-label="Формы выпуска из реестра"] .chip')].filter(c=>c.getAttribute('aria-pressed')==='true').map(c=>c.textContent.trim())
    return { echo, echoBox: er ? { l:Math.round(er.left), r:Math.round(er.right), h:Math.round(er.height), ws:getComputedStyle(echoEl).whiteSpace } : null,
             pressed, doseChips, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth }
  })
  console.log('=== после нажатия на длинный чип ===')
  console.log(JSON.stringify(after, null, 1))
  await page.screenshot({ path: `${OUT}/h2_${label}.png`, fullPage: false })
  await ctx.close()
}

await run('desktopUA360', {})
await run('mobile360', { isMobile: true, hasTouch: true })
await browser.close()
