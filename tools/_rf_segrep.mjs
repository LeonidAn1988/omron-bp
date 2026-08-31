import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4399'

const cases = [
  { tag: 'xlarge-360', scale: 'xlarge', w: 360 },
  { tag: 'xlarge-320', scale: 'xlarge', w: 320 },
  { tag: 'normal-360', scale: 'normal', w: 360 },
  { tag: 'xlarge-412', scale: 'xlarge', w: 412 },
]

const probe = () => {
  const de = document.documentElement
  const out = { root: getComputedStyle(de).fontSize, vw: de.clientWidth, docScrollW: de.scrollWidth, bodyScrollW: document.body.scrollWidth, groups: [] }
  for (const g of document.querySelectorAll('.segmented')) {
    const r = g.getBoundingClientRect()
    const cs = getComputedStyle(g)
    const btns = [...g.querySelectorAll('button')].map((b) => {
      const br = b.getBoundingClientRect()
      const bcs = getComputedStyle(b)
      // ширина самого текста
      const range = document.createRange()
      range.selectNodeContents(b)
      const tr = range.getBoundingClientRect()
      return {
        txt: b.textContent.trim(),
        left: +br.left.toFixed(1), right: +br.right.toFixed(1), w: +br.width.toFixed(1),
        fs: bcs.fontSize, pad: bcs.padding, ws: bcs.whiteSpace,
        textW: +tr.width.toFixed(1), textRight: +tr.right.toFixed(1),
        scrollW: b.scrollWidth, clientW: b.clientWidth,
      }
    })
    // ближайший предок со скроллом/обрезкой
    let clip = null
    for (let p = g.parentElement; p; p = p.parentElement) {
      const pcs = getComputedStyle(p)
      if (pcs.overflowX !== 'visible') { const pr = p.getBoundingClientRect(); clip = { tag: p.tagName + '.' + p.className, ov: pcs.overflowX, left: +pr.left.toFixed(1), right: +pr.right.toFixed(1), scrollW: p.scrollWidth, clientW: p.clientWidth }; break }
    }
    const par = g.parentElement
    const pr = par.getBoundingClientRect()
    out.groups.push({
      label: g.getAttribute('aria-label'), cls: g.className,
      display: cs.display, left: +r.left.toFixed(1), right: +r.right.toFixed(1), w: +r.width.toFixed(1),
      parent: { cls: par.className, left: +pr.left.toFixed(1), right: +pr.right.toFixed(1), w: +pr.width.toFixed(1) },
      clip, btns,
    })
  }
  return out
}

const dump = (m, where) => {
  console.log(`  [${where}] vw=${m.vw} docScrollW=${m.docScrollW} bodyScrollW=${m.bodyScrollW}`)
  for (const g of m.groups) {
    const over = g.right - m.vw
    console.log(`    «${g.label}» cls="${g.cls}" display=${g.display} L=${g.left} R=${g.right} W=${g.w}  parentW=${g.parent.w} (${g.parent.cls})  ЗАЛЕЗ=${over.toFixed(1)}`)
    if (g.clip) console.log(`       clipper: ${g.clip.tag} ov=${g.clip.ov} L=${g.clip.left} R=${g.clip.right} scrollW=${g.clip.scrollW} clientW=${g.clip.clientW}`)
    for (const b of g.btns) {
      const cut = b.textRight > m.vw ? ' <<< ТЕКСТ ЗА КРАЕМ' : ''
      console.log(`       "${b.txt}" fs=${b.fs} ws=${b.ws} pad=${b.pad} btnW=${b.w} textW=${b.textW} L=${b.left} R=${b.right} textR=${b.textRight} scrollW=${b.scrollW}/${b.clientW}${cut}`)
    }
  }
}

const browser = await chromium.launch()
for (const c of cases) {
  const ctx = await browser.newContext({ viewport: { width: c.w, height: 915 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s; cur.density = 'normal'; cur.trackGlucose = true; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
    localStorage.setItem('textScale', s)
  }, c.scale)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(500)

  console.log('### ' + c.tag)
  await go(page, { tool: 'Отчёт' })
  await page.waitForTimeout(400)
  dump(await page.evaluate(probe), 'Отчёт')
  await page.screenshot({ path: `/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/segrep-${c.tag}-report.png` })

  await go(page, { tool: 'Настройки' })
  await page.waitForTimeout(400)
  dump(await page.evaluate(probe), 'Настройки')
  await page.screenshot({ path: `/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/segrep-${c.tag}-settings.png`, fullPage: true })

  await go(page, { tab: 'Аптечка', click: 'Добавить препарат' })
  await page.waitForTimeout(500)
  dump(await page.evaluate(probe), 'Форма препарата')
  await page.screenshot({ path: `/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/segrep-${c.tag}-medform.png`, fullPage: true })

  await ctx.close()
}
await browser.close()
