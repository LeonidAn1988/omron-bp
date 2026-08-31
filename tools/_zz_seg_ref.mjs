import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4399'
const SHOT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const cases = [
  { tag: '360-xlarge-roomy', w: 360, scale: 'xlarge', density: 'roomy' },
  { tag: '360-xlarge-normal', w: 360, scale: 'xlarge', density: 'normal' },
  { tag: '393-xlarge-roomy', w: 393, scale: 'xlarge', density: 'roomy' },
  { tag: '360-normal-normal', w: 360, scale: 'normal', density: 'normal' },
  { tag: '320-xlarge-roomy', w: 320, scale: 'xlarge', density: 'roomy' },
]

const probe = () => {
  const px = (n) => Math.round(n * 100) / 100
  const out = {
    root: getComputedStyle(document.documentElement).fontSize,
    spaceUnit: getComputedStyle(document.documentElement).getPropertyValue('--space-unit').trim(),
    vw: document.documentElement.clientWidth,
    docScrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    groups: [],
  }
  for (const g of document.querySelectorAll('.segmented')) {
    const gr = g.getBoundingClientRect()
    const card = g.closest('.card')
    const cr = card ? card.getBoundingClientRect() : null
    const ccs = card ? getComputedStyle(card) : null
    const cardContentRight = cr ? cr.right - parseFloat(ccs.paddingRight) - parseFloat(ccs.borderRightWidth) : null
    const btns = [...g.querySelectorAll('button')].map((b) => {
      const br = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      const padR = parseFloat(cs.paddingRight)
      const padL = parseFloat(cs.paddingLeft)
      const bordR = parseFloat(cs.borderRightWidth)
      const contentRight = br.right - bordR - padR
      const contentLeft = br.left + parseFloat(cs.borderLeftWidth) + padL
      // геометрия самого текста
      const r = document.createRange()
      r.selectNodeContents(b)
      const tr = r.getBoundingClientRect()
      const rects = [...r.getClientRects()].map((x) => ({ l: px(x.left), r: px(x.right), w: px(x.width), t: px(x.top) }))
      return {
        txt: b.textContent.trim(),
        fs: cs.fontSize, ws: cs.whiteSpace, ow: cs.overflowWrap, wb: cs.wordBreak, hy: cs.hyphens,
        ovX: cs.overflowX,
        borderL: px(br.left), borderR: px(br.right), borderW: px(br.width),
        contentL: px(contentLeft), contentR: px(contentRight),
        contentW: px(contentRight - contentLeft),
        textL: px(tr.left), textR: px(tr.right), textW: px(tr.width),
        lines: rects.length,
        rects,
        scrollW: b.scrollWidth, clientW: b.clientWidth,
        // на сколько текст вылез за правую границу кнопки (видимый разделитель)
        pastBorder: px(tr.right - br.right),
        // на сколько текст вылез за content-box кнопки
        pastContent: px(tr.right - contentRight),
      }
    })
    out.groups.push({
      label: g.getAttribute('aria-label'),
      cls: g.className,
      L: px(gr.left), R: px(gr.right), W: px(gr.width),
      pastViewport: px(gr.right - document.documentElement.clientWidth),
      cardR: cr ? px(cr.right) : null,
      cardContentR: cardContentRight != null ? px(cardContentRight) : null,
      pastCardContent: cardContentRight != null ? px(gr.right - cardContentRight) : null,
      btns,
    })
  }
  return out
}

const dump = (m, where) => {
  console.log(`  [${where}] root=${m.root} space-unit=${m.spaceUnit} vw=${m.vw} docScrollW=${m.docScrollW} bodyScrollW=${m.bodyScrollW}`)
  for (const g of m.groups) {
    console.log(`   «${g.label}» cls="${g.cls}" L=${g.L} R=${g.R} W=${g.W} | заВьюпорт=${g.pastViewport} | правыйКрайКарточки=${g.cardContentR} заКарточку=${g.pastCardContent}`)
    for (const b of g.btns) {
      console.log(`      "${b.txt}" fs=${b.fs} ws=${b.ws} overflow-wrap=${b.ow} word-break=${b.wb} hyphens=${b.hy}`)
      console.log(`         кнопка border[${b.borderL}..${b.borderR}] w=${b.borderW}  content[${b.contentL}..${b.contentR}] w=${b.contentW}`)
      console.log(`         текст  [${b.textL}..${b.textR}] w=${b.textW} строк=${b.lines}  scrollW/clientW=${b.scrollW}/${b.clientW}`)
      console.log(`         ЗА ГРАНИЦУ КНОПКИ = ${b.pastBorder}   ЗА CONTENT-BOX = ${b.pastContent}`)
      if (b.lines > 1) console.log(`         строки: ${JSON.stringify(b.rects)}`)
    }
  }
}

const browser = await chromium.launch()
for (const c of cases) {
  const ctx = await browser.newContext({
    viewport: { width: c.w, height: 915 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  await seed(page, FROZEN)
  await page.evaluate(async ({ s, d }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s; cur.density = d; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
    localStorage.setItem('textScale', s)
    localStorage.setItem('density', d)
  }, { s: c.scale, d: c.density })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(600)

  console.log('\n############ ' + c.tag)
  console.log('  data-text=' + (await page.evaluate(() => document.documentElement.dataset.text ?? '(нет)')) +
              ' data-density=' + (await page.evaluate(() => document.documentElement.dataset.density ?? '(нет)')))

  // Аптечка — фильтр
  await go(page, { tab: 'Аптечка' })
  await page.waitForTimeout(500)
  dump(await page.evaluate(probe), 'Аптечка')
  await page.screenshot({ path: `${SHOT}/zzseg-${c.tag}-aptechka.png`, fullPage: true })

  // Форма препарата — «Отношение к еде»
  await go(page, { tab: 'Аптечка', click: 'Добавить препарат' })
  await page.waitForTimeout(500)
  const preset = page.locator('button', { hasText: /^Утром$/ }).first()
  if (await preset.count()) { await preset.click(); await page.waitForTimeout(500) }
  dump(await page.evaluate(probe), 'Форма препарата')
  await page.screenshot({ path: `${SHOT}/zzseg-${c.tag}-medform.png`, fullPage: true })

  await ctx.close()
}
await browser.close()
