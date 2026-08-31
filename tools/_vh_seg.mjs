/** Угол «вред»: страдает ли человек, который ведёт дневник и пьёт лекарства. */
import { chromium } from 'playwright'
import { seed, go, settle, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4833'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/vred_h'
const browser = await chromium.launch()

async function prep(w, scale, density) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    colorScheme: 'dark', deviceScaleFactor: 3, hasTouch: true, isMobile: true,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async ([a, b]) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = a; cur.density = b; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, [scale, density])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  return { ctx, page }
}

const SEG = (label) => {
  const g = [...document.querySelectorAll('.segmented')].find((e) => e.getAttribute('aria-label') === label)
  if (!g) return { missing: true }
  const gr = g.getBoundingClientRect()
  const vw = document.documentElement.clientWidth
  const btns = [...g.querySelectorAll('button')].map((b) => {
    const bb = b.getBoundingClientRect()
    const rg = document.createRange(); rg.selectNodeContents(b)
    const rects = [...rg.getClientRects()].filter((r) => r.width > 0)
    const textRight = rects.length ? Math.max(...rects.map((r) => r.right)) : bb.right
    const textLeft = rects.length ? Math.min(...rects.map((r) => r.left)) : bb.left
    const cx = (Math.max(bb.left, 0) + Math.min(bb.right, vw)) / 2
    const cy = (bb.top + bb.bottom) / 2
    const hit = document.elementFromPoint(cx, cy)
    // кто стоит над кончиком слова, вылезшего за кнопку
    const tipX = Math.min(textRight - 1, vw - 1)
    const tipHit = document.elementFromPoint(tipX, cy)
    return {
      t: b.textContent.trim(), pressed: b.getAttribute('aria-pressed'),
      btn: [+bb.left.toFixed(1), +bb.right.toFixed(1)], btnW: +bb.width.toFixed(1),
      textRight: +textRight.toFixed(1), textLeft: +textLeft.toFixed(1),
      overButton: +(textRight - bb.right).toFixed(1),
      overViewport: +(textRight - vw).toFixed(1),
      lines: rects.length,
      overflowCS: getComputedStyle(b).overflow,
      hitCenterIsSelf: hit === b || b.contains(hit),
      tipCoveredBy: tipHit ? (tipHit.tagName + '.' + (tipHit.className || '')).slice(0, 40) : null,
      tipIsSelf: tipHit === b || b.contains(tipHit),
    }
  })
  return {
    vw, groupRight: +gr.right.toFixed(1), groupW: +gr.width.toFixed(1),
    overViewportGroup: +(gr.right - vw).toFixed(1),
    docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth,
    pageScrollsX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    btns,
  }
}

// вылез ли за вьюпорт хоть какой-то ТЕКСТ на странице (в т.ч. данные о лекарствах)
const CLIPPED_TEXT = () => {
  const vw = document.documentElement.clientWidth
  const bad = []
  const walk = (n) => {
    if (n.nodeType === 3 && n.textContent.trim()) {
      const rg = document.createRange(); rg.selectNodeContents(n)
      for (const r of rg.getClientRects()) {
        if (r.width > 0 && r.right > vw + 0.5) bad.push({ txt: n.textContent.trim().slice(0, 40), right: +r.right.toFixed(1), over: +(r.right - vw).toFixed(1) })
      }
    } else n.childNodes?.forEach(walk)
  }
  walk(document.body)
  return bad
}

const out = {}
for (const [w, sc, de] of [[360, 'xlarge', 'roomy'], [360, 'xlarge', 'normal'], [393, 'xlarge', 'roomy'], [360, 'normal', 'normal'], [320, 'xlarge', 'roomy']]) {
  const key = `${w}-${sc}-${de}`
  const { ctx, page } = await prep(w, sc, de)
  out[key] = {}
  await go(page, { tab: 'Аптечка' })
  await page.waitForTimeout(300)

  out[key].filter = await page.evaluate(SEG, 'Что показывать')

  // сколько строк видно на «Все», какие есть тревоги в самих строках
  const rowsAll = await page.evaluate(() => ({
    n: document.querySelectorAll('.pills > li').length,
    texts: [...document.querySelectorAll('.pills > li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim().slice(0, 90)),
    restock: (document.querySelector('.card')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
  }))
  out[key].rowsAll = rowsAll

  // клик по каждой кнопке фильтра: срабатывает ли, что показывает
  out[key].clicks = []
  for (const label of ['Кончаются', 'Просрочены', 'Все']) {
    const seg = page.locator('.segmented--fill[aria-label="Что показывать"]')
    const b = seg.locator('button', { hasText: new RegExp('^' + label + '$') }).first()
    let err = null
    try { await b.scrollIntoViewIfNeeded(); await b.click({ timeout: 3000 }) } catch (e) { err = String(e).slice(0, 100) }
    await page.waitForTimeout(300)
    const st = await page.evaluate(() => ({
      pressed: [...document.querySelectorAll('.segmented--fill[aria-label="Что показывать"] button')].map((x) => [x.textContent.trim(), x.getAttribute('aria-pressed')]),
      rows: [...document.querySelectorAll('.pills > li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)),
      empty: [...document.querySelectorAll('.chart__empty')].map((e) => e.textContent.trim()),
    }))
    out[key].clicks.push({ label, err, ...st })
  }

  out[key].clippedTextOnCabinet = await page.evaluate(CLIPPED_TEXT)

  // снимок переключателя
  const segEl = page.locator('.segmented--fill[aria-label="Что показывать"]').first()
  await segEl.scrollIntoViewIfNeeded(); await page.waitForTimeout(200)
  const bx = await segEl.boundingBox()
  if (bx) await page.screenshot({ path: `${OUT}/filter-${key}.png`, clip: { x: 0, y: Math.max(0, bx.y - 10), width: w, height: bx.height + 20 } })

  // ---- форма препарата: «Отношение к еде» ----
  await page.locator('button', { hasText: 'Добавить препарат' }).first().click()
  await page.waitForTimeout(500)
  const meal = await page.evaluate(SEG, 'Отношение к еде')
  out[key].mealBeforeTimes = meal
  if (meal.missing) {
    // переключатель появляется только когда задано время приёма — нажимаем пресет
    const pressed = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Утро|утро/.test(x.textContent) && x.closest('.card'))
      if (b) { b.click(); return b.textContent.trim() }
      return null
    })
    await page.waitForTimeout(400)
    out[key].timePreset = pressed
    out[key].meal = await page.evaluate(SEG, 'Отношение к еде')
    out[key].clippedTextOnForm = await page.evaluate(CLIPPED_TEXT)
    const mg = page.locator('.segmented[aria-label="Отношение к еде"]').first()
    if (await mg.count()) {
      await mg.scrollIntoViewIfNeeded(); await page.waitForTimeout(200)
      const mb = await mg.boundingBox()
      if (mb) await page.screenshot({ path: `${OUT}/meal-${key}.png`, clip: { x: 0, y: Math.max(0, mb.y - 10), width: w, height: mb.height + 20 } })
    }
  }
  await ctx.close()
}
console.log(JSON.stringify(out, null, 2))
await browser.close()
