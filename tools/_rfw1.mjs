import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

for (const [w, h, name] of [[360, 800, 'w360'], [412, 915, 'w412']]) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
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
  await page.waitForTimeout(600)
  await go(page, { tab: 'Давление' })
  await page.waitForTimeout(800)

  const before = await page.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    wheels: [...document.querySelectorAll('.card .wheel__label')].map(e => e.textContent.trim()),
    inputsInForm: [...document.querySelectorAll('form.card input')].map(i => i.type),
    active: document.activeElement ? document.activeElement.tagName + '.' + document.activeElement.className : null,
  }))
  console.log(`\n===== ${name} (${w}x${h}) BEFORE =====`)
  console.log(JSON.stringify(before, null, 2))

  // жмём «Добавить» ничего не выбрав
  await page.locator('form.card button[type=submit]', { hasText: 'Добавить' }).first().click()
  await page.waitForTimeout(700)

  const after = await page.evaluate(() => {
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), h: Math.round(b.height) } }
    const wheels = [...document.querySelectorAll('form.card .wheel')].map(wl => ({
      label: wl.querySelector('.wheel__label').textContent.trim(),
      box: r(wl.querySelector('.wheel__box')),
      selected: wl.querySelector(".wheel__item[data-selected='true']")?.textContent,
      pending: wl.querySelector(".wheel__item[data-pending='true']")?.textContent ?? null,
    }))
    const alert = document.querySelector('form.card [role=alert]')
    const nav = document.querySelector('nav.tabs')
    const submit = document.querySelector('form.card button[type=submit]')
    return {
      errorText: alert ? alert.textContent.trim() : null,
      alertRect: r(alert),
      navRect: r(nav),
      navPosition: nav ? getComputedStyle(nav).position : null,
      submitRect: r(submit),
      wheels,
      active: document.activeElement ? document.activeElement.tagName + '|' + document.activeElement.className + '|' + (document.activeElement.getAttribute('aria-label')||'') : null,
      scrollY: Math.round(scrollY),
      viewportH: innerHeight,
      docH: Math.round(document.documentElement.scrollHeight),
    }
  })
  console.log(`===== ${name} AFTER submit =====`)
  console.log(JSON.stringify(after, null, 2))

  // виден ли барабан «Верхнее» целиком, не перекрыт ли липкой панелью
  const vis = await page.evaluate(() => {
    const nav = document.querySelector('nav.tabs').getBoundingClientRect()
    const out = {}
    for (const wl of document.querySelectorAll('form.card .wheel')) {
      const label = wl.querySelector('.wheel__label').textContent.trim()
      const b = wl.querySelector('.wheel__box').getBoundingClientRect()
      out[label] = {
        fullyInViewport: b.top >= 0 && b.bottom <= innerHeight,
        aboveStickyNav: b.bottom <= nav.top,
        top: Math.round(b.top), bottom: Math.round(b.bottom), navTop: Math.round(nav.top), vh: innerHeight,
      }
    }
    const a = document.querySelector('form.card [role=alert]').getBoundingClientRect()
    out['__alert'] = { top: Math.round(a.top), bottom: Math.round(a.bottom), navTop: Math.round(nav.top), fullyInViewport: a.top >= 0 && a.bottom <= innerHeight, aboveStickyNav: a.bottom <= nav.top }
    return out
  })
  console.log(`===== ${name} visibility =====`)
  console.log(JSON.stringify(vis, null, 2))

  await page.screenshot({ path: `${OUT}/rfw_${name}_err.png` })
  await ctx.close()
}
await browser.close()
