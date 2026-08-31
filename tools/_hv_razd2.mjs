import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = process.env.U || 'http://localhost:5261'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const out = {}
for (const [scale, w] of [['xlarge', 320], ['xlarge', 360], ['normal', 360]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2, ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s; cur.onboarded = true; cur.theme = 'auto'
    await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close(); if (s === 'normal') localStorage.removeItem('textScale'); else localStorage.setItem('textScale', s)
  }, scale)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(400)
  await go(page, { tool: 'Настройки' })
  await page.waitForTimeout(400)

  // 1. промах: тапаем в геометрический центр КАЖДОЙ видимой строки текста
  //    (заголовок и пояснение) и смотрим, какой чекбокс переключился.
  const taps = []
  const targets = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent.trim() === 'Разделы')
    const labs = [...card.querySelectorAll('label')]
    const pts = []
    labs.forEach((lab, i) => {
      const span = lab.querySelector('span')
      const note = lab.querySelector('.fact__note')
      const titleNode = [...span.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
      const rr = (n) => { const r = document.createRange(); r.selectNodeContents(n); return r.getBoundingClientRect() }
      const t = rr(titleNode), nt = note.getBoundingClientRect()
      pts.push({ i, what: 'заголовок ' + titleNode.textContent.trim(), x: t.left + t.width / 2, y: t.top + t.height / 2 })
      pts.push({ i, what: 'пояснение ' + note.textContent.trim().slice(0, 18), x: nt.left + nt.width / 2, y: nt.top + nt.height / 2 })
    })
    // середина зазора между 1-й и 2-й строкой
    const a = labs[0].getBoundingClientRect(), b = labs[1].getBoundingClientRect()
    pts.push({ i: -1, what: 'зазор между строками 1 и 2', x: a.left + 60, y: (a.bottom + b.top) / 2 })
    return pts
  })
  for (const t of targets) {
    const before = await page.evaluate(() => [...[...document.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent.trim() === 'Разделы').querySelectorAll('input')].map((i) => i.checked))
    await page.mouse.click(t.x, t.y)
    await page.waitForTimeout(120)
    const after = await page.evaluate(() => [...[...document.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent.trim() === 'Разделы').querySelectorAll('input')].map((i) => i.checked))
    const changed = before.map((v, k) => (v !== after[k] ? k : -1)).filter((k) => k >= 0)
    taps.push({ target: t.what, intended: t.i, toggled: changed, ok: t.i === -1 ? changed.length === 0 : changed.length === 1 && changed[0] === t.i })
    if (changed.length) { await page.mouse.click(t.x, t.y); await page.waitForTimeout(120) } // вернуть как было
  }

  // 2. геометрия «уехавшего» пояснения: видно ли его целиком на экране
  const geo = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent.trim() === 'Разделы')
    const notes = [...card.querySelectorAll('.fact__note')]
    const vw = document.documentElement.clientWidth
    return notes.map((n) => {
      const r = n.getBoundingClientRect()
      return { t: n.textContent.trim(), right: +r.right.toFixed(1), vw, onScreen: r.right <= vw, pastCardBorder: +(r.right - card.getBoundingClientRect().right).toFixed(1) }
    })
  })
  out[scale + '_' + w] = { taps, geo }
  await page.screenshot({ path: `${OUT}/_hv_razd_full_${scale}_${w}.png` })
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(out, null, 1))
