import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = process.env.U || 'http://localhost:5261'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const res = {}
const cases = [
  ['normal', 360], ['xlarge', 360], ['xlarge', 320], ['xlarge', 412], ['normal', 320],
]
for (const [scale, w] of cases) {
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

  const m = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')]
    const card = cards.find((c) => c.querySelector('h2')?.textContent.trim() === 'Разделы')
    if (!card) return { err: 'no card' }
    const cs = getComputedStyle(card)
    const inner = {
      left: card.getBoundingClientRect().left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth),
      right: card.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth),
    }
    // точный прямоугольник текстовой строки — через Range
    const lineRect = (node) => {
      const r = document.createRange(); r.selectNodeContents(node)
      const rs = [...r.getClientRects()]
      return rs.map((x) => ({ t: +x.top.toFixed(1), b: +x.bottom.toFixed(1), l: +x.left.toFixed(1), r: +x.right.toFixed(1), c: +((x.top + x.bottom) / 2).toFixed(1) }))
    }
    const rows = []
    card.querySelectorAll('label').forEach((lab) => {
      const box = lab.querySelector('input')
      const span = lab.querySelector('span')
      const note = lab.querySelector('.fact__note')
      // первый текстовый узел = заголовок
      const titleNode = [...span.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
      const br = box.getBoundingClientRect()
      const tr = lineRect(titleNode)
      const nr = lineRect(note)
      const sSpan = getComputedStyle(span), sNote = getComputedStyle(note)
      rows.push({
        title: titleNode.textContent.trim(),
        note: note.textContent.trim(),
        labelRect: { t: +lab.getBoundingClientRect().top.toFixed(1), b: +lab.getBoundingClientRect().bottom.toFixed(1), h: +lab.getBoundingClientRect().height.toFixed(1), l: +lab.getBoundingClientRect().left.toFixed(1), r: +lab.getBoundingClientRect().right.toFixed(1) },
        boxCenter: +((br.top + br.bottom) / 2).toFixed(1),
        boxRect: { t: +br.top.toFixed(1), b: +br.bottom.toFixed(1), w: +br.width.toFixed(1), h: +br.height.toFixed(1) },
        titleLines: tr,
        noteLines: nr,
        titleFs: sSpan.fontSize, titleColor: sSpan.color, titleWhiteSpace: sSpan.whiteSpace,
        noteFs: sNote.fontSize, noteColor: sNote.color, noteWhiteSpace: sNote.whiteSpace,
        accName: box.labels?.[0]?.textContent.trim() || null,
        // выход за внутренний край карточки
        noteOverInner: +(Math.max(...nr.map((x) => x.r)) - inner.right).toFixed(2),
        titleOverInner: +(Math.max(...tr.map((x) => x.r)) - inner.right).toFixed(2),
        noteRight: +Math.max(...nr.map((x) => x.r)).toFixed(1),
        labelScrollVsClient: [lab.scrollWidth, lab.clientWidth],
      })
    })
    // расстояния между строками: свой заголовок vs чужой
    const nav = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const own = Math.abs(r.boxCenter - r.titleLines[0].c)
      const ownNote = Math.abs(r.boxCenter - r.noteLines[0].c)
      const prevNote = i > 0 ? Math.abs(r.boxCenter - rows[i - 1].noteLines.at(-1).c) : null
      const nextTitle = i < rows.length - 1 ? Math.abs(r.boxCenter - rows[i + 1].titleLines[0].c) : null
      nav.push({ title: r.title, toOwnTitle: +own.toFixed(1), toOwnNote: +ownNote.toFixed(1), toPrevRowNote: prevNote && +prevNote.toFixed(1), toNextRowTitle: nextTitle && +nextTitle.toFixed(1) })
    }
    const stack = card.querySelector('.stack')
    return {
      rows, nav,
      innerRight: +inner.right.toFixed(1), innerLeft: +inner.left.toFixed(1),
      cardRight: +card.getBoundingClientRect().right.toFixed(1),
      cardPad: cs.padding,
      cardOverflow: cs.overflow,
      docScrollW: document.documentElement.scrollWidth,
      viewportW: document.documentElement.clientWidth,
      bodyScrollW: document.body.scrollWidth,
      stackGap: getComputedStyle(stack).gap,
      rootFs: getComputedStyle(document.documentElement).fontSize,
      // есть ли предок с обрезкой
      clippingAncestors: (() => {
        const out = []
        let e = card
        while (e && e !== document.documentElement) {
          const s = getComputedStyle(e)
          if (s.overflowX !== 'visible' || s.overflowY !== 'visible') out.push(e.tagName + '.' + e.className + ' ' + s.overflow)
          e = e.parentElement
        }
        return out
      })(),
    }
  })
  res[scale + '_' + w] = m

  // функциональная проверка: клик по тексту заголовка 5-й строки переключает СВОЙ чекбокс
  const click = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent.trim() === 'Разделы')
    const labs = [...card.querySelectorAll('label')]
    const before = labs.map((l) => l.querySelector('input').checked)
    return { before, ids: labs.map((l) => l.querySelector('input').labels.length) }
  })
  res[scale + '_' + w].labelBinding = click

  const card = page.locator('.card').filter({ has: page.locator('h2', { hasText: 'Разделы' }) })
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await card.screenshot({ path: `${OUT}/_hv_razd_${scale}_${w}.png` })
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(res, null, 1))
