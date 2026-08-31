import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

const measure = () => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) } }
  const wheelBox = (label) => {
    const wl = [...document.querySelectorAll('form.card .wheel')].find(w => w.querySelector('.wheel__label').textContent.trim() === label)
    return wl ? r(wl.querySelector('.wheel__box')) : null
  }
  const alert = document.querySelector('form.card [role=alert]')
  const actions = document.querySelector('form.card .form-actions')
  const nav = document.querySelector('nav.tabs')
  return {
    scrollY: Math.round(scrollY), vh: innerHeight,
    sys: wheelBox('Верхнее'), dia: wheelBox('Нижнее'),
    alert: r(alert), alertText: alert ? alert.textContent.trim() : null,
    actions: r(actions), actionsPos: actions ? getComputedStyle(actions).position : null,
    nav: r(nav),
    active: document.activeElement ? document.activeElement.tagName + '|' + document.activeElement.className : null,
  }
}

for (const scale of ['normal', 'xlarge']) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.onboarded = true; cur.textScale = s
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close(); localStorage.setItem('textScale', s)
  }, scale)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(600)
  await go(page, { tab: 'Давление' })
  await page.waitForTimeout(900)

  console.log(`\n########## textScale=${scale} ##########`)

  // --- А. без прокрутки ---
  await page.locator('form.card button[type=submit]').first().click()
  await page.waitForTimeout(1200)
  const a = await page.evaluate(measure)
  console.log('--- A: жмём кнопку без прокрутки ---')
  console.log(JSON.stringify(a, null, 2))

  // --- Б. что сделал бы предложенный фикс ---
  const fix = await page.evaluate(() => {
    const before = Math.round(scrollY)
    const wl = [...document.querySelectorAll('form.card .wheel')].find(w => w.querySelector('.wheel__label').textContent.trim() === 'Верхнее')
    const list = wl.querySelector('.wheel__list')
    list.focus()
    const focused = document.activeElement === list
    list.scrollIntoView({ block: 'center' })
    return { scrollBefore: before, scrollAfterFix: Math.round(scrollY), focusLanded: focused }
  })
  await page.waitForTimeout(400)
  const b = await page.evaluate(measure)
  console.log('--- Б: применили предложенную правку вручную ---')
  console.log(JSON.stringify(fix, null, 2))
  console.log(JSON.stringify({ sys: b.sys, alert: b.alert, actions: b.actions, scrollY: b.scrollY }, null, 2))
  await page.screenshot({ path: `${OUT}/rfw2_${scale}_afterfix.png` })

  // --- В. прокрутили так, что барабан ушёл вверх, и жмём кнопку ---
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(700)
  await go(page, { tab: 'Давление' })
  await page.waitForTimeout(900)
  const scrolled = await page.evaluate(() => {
    const wl = [...document.querySelectorAll('form.card .wheel')].find(w => w.querySelector('.wheel__label').textContent.trim() === 'Верхнее')
    const box = wl.querySelector('.wheel__box').getBoundingClientRect()
    // прокручиваем ровно настолько, чтобы барабан ушёл за верх экрана
    const need = box.bottom + 20
    window.scrollTo(0, scrollY + need)
    return { scrolledBy: Math.round(need) }
  })
  await page.waitForTimeout(400)
  const cBefore = await page.evaluate(measure)
  const btnVisible = await page.evaluate(() => {
    const el = document.querySelector('form.card button[type=submit]')
    const b = el.getBoundingClientRect()
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), inViewport: b.top >= 0 && b.bottom <= innerHeight }
  })
  console.log('--- В: прокрутили вниз, барабан за экраном ---')
  console.log(JSON.stringify({ ...scrolled, sysBox: cBefore.sys, submit: btnVisible, scrollY: cBefore.scrollY }, null, 2))
  if (btnVisible.inViewport) {
    await page.locator('form.card button[type=submit]').first().click()
    await page.waitForTimeout(1200)
    const c = await page.evaluate(measure)
    console.log('--- В: после нажатия ---')
    console.log(JSON.stringify(c, null, 2))
    await page.screenshot({ path: `${OUT}/rfw2_${scale}_scrolled.png` })
  } else {
    console.log('   кнопка вне экрана — нажать нечего')
  }

  await ctx.close()
}
await browser.close()
