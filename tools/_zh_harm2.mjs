/** Есть ли обрезка там, где ошибка стоила бы здоровья: еда/доза, период графика, фильтр аптечки. */
import { chromium } from 'playwright'
import { seed, go, settle, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4711'
const browser = await chromium.launch()
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const measure = () => {
  const out = []
  for (const s of document.querySelectorAll('.segmented')) {
    const sb = s.getBoundingClientRect()
    const card = s.closest('.card') || s.closest('.sheet') || s.parentElement
    const cb = card.getBoundingClientRect(); const cs = getComputedStyle(card)
    const innerR = cb.right - parseFloat(cs.paddingRight)
    out.push({
      label: s.getAttribute('aria-label'),
      fill: s.classList.contains('segmented--fill'),
      outCard: +(sb.right - innerR).toFixed(1),
      btns: [...s.querySelectorAll('button')].map((b) => {
        const bb = b.getBoundingClientRect()
        const r = document.createRange(); r.selectNodeContents(b)
        const rr = [...r.getClientRects()]
        return { t: b.textContent.trim(), over: +(Math.max(...rr.map((x) => x.right)) - bb.right).toFixed(1) }
      }),
    })
  }
  return out
}

for (const [w, sc, de] of [[320, 'xlarge', 'roomy'], [360, 'xlarge', 'roomy'], [407, 'normal', 'normal']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 1200 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(900)
  await seed(page, FROZEN)
  await page.evaluate(async ([a, b]) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = a; cur.density = b; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, [sc, de])
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)

  for (const scr of [{ tab: 'Давление' }, { tab: 'Аптечка' }, { tab: 'Аптечка', click: 'Добавить препарат' }]) {
    await go(page, scr); await page.waitForTimeout(400)
    // форма препарата: раскрыть блок приёма
    if (scr.click) {
      for (const nm of ['Каждый день', 'Приём', 'Как принимать']) {
        const b = page.getByRole('button', { name: nm }).first()
        if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(300) }
      }
    }
    const res = await page.evaluate(measure)
    console.log(`--- ${w}/${sc}/${de}  ${scr.click ? 'Форма препарата' : scr.tab}`)
    for (const g of res) console.log(`   [${g.label}]${g.fill ? ' fill' : ''} за карточку=${g.outCard}  ` + g.btns.map((b) => `"${b.t}"${b.over > 0.6 ? ` ОБРЕЗ+${b.over}` : ''}`).join(' | '))
  }
  await ctx.close()
}
await browser.close()
