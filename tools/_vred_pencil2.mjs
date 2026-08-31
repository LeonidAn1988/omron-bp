import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()

for (const c of [{ w: 375, d: 'roomy' }, { w: 320, d: 'roomy' }, { w: 412, d: 'roomy' }]) {
  const ctx = await browser.newContext({
    viewport: { width: c.w, height: 900 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 3,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  // добавляем записи с длинным примечанием, отметками и без пульса
  await page.evaluate(async ({ now, d }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const put = (store, val, key) => new Promise((res, rej) => { const tx = db.transaction(store,'readwrite'); const os = tx.objectStore(store); key===undefined?os.put(val):os.put(val,key); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    const extra = [
      { id: 'note-long', kind: 'bp', ts: now - 3600_000, user: 1, source: 'manual', sys: 139, dia: 88, bpm: 74, ihb: true, mov: true, arm: 'left',
        note: 'После подъёма по лестнице, принял амлодипин на час позже обычного, кружилась голова' },
      { id: 'note-mid', kind: 'bp', ts: now - 7200_000, user: 1, source: 'device', sys: 178, dia: 104, bpm: 91, ihb: true, mov: false, arm: 'right',
        note: 'Вызвали скорую' },
      { id: 'note-none', kind: 'bp', ts: now - 10800_000, user: 1, source: 'import', sys: 121, dia: 79 },
    ]
    for (const r of extra) await put('readings', r)
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = 'xlarge'; cur.onboarded = true; cur.density = d
    await put('meta', cur, 'settings')
    db.close()
    localStorage.setItem('textScale', 'xlarge'); localStorage.setItem('density', d)
  }, { now: FROZEN, d: c.d })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(600)
  await go(page, { tab: 'Давление' })
  await page.waitForTimeout(600)

  const m = await page.evaluate(() => {
    const rects = (el) => { if (!el) return null; const r = document.createRange(); r.selectNodeContents(el); return [...r.getClientRects()].map(x=>({l:x.left,r:x.right,t:x.top,b:x.bottom})) }
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom} }
    const hit = (a,b) => a&&b && Math.min(a.r,b.r)-Math.max(a.l,b.l) > 0 && Math.min(a.b,b.b)-Math.max(a.t,b.t) > 0
    const out = []
    for (const tr of document.querySelectorAll('.readings-table tbody tr:not([data-editor])')) {
      const pg = box(tr.querySelector('.row-edit svg'))
      const tg = box(tr.querySelector('.btn--icon svg'))
      const pb = box(tr.querySelector('.row-edit'))
      const tb = box(tr.querySelector('.btn--icon'))
      const collisions = []
      for (const col of ['when','val','cat','bpm','marks','note']) {
        const cell = tr.querySelector(`td[data-col='${col}']`)
        for (const rc of (rects(cell) || [])) {
          if (hit(rc, pg)) collisions.push({ col, with: 'карандаш-глиф', dx: +(Math.min(rc.r,pg.r)-Math.max(rc.l,pg.l)).toFixed(1), dy: +(Math.min(rc.b,pg.b)-Math.max(rc.t,pg.t)).toFixed(1) })
          if (hit(rc, tg)) collisions.push({ col, with: 'корзина-глиф', dx: +(Math.min(rc.r,tg.r)-Math.max(rc.l,tg.l)).toFixed(1), dy: +(Math.min(rc.b,tg.b)-Math.max(rc.t,tg.t)).toFixed(1) })
          if (hit(rc, pb)) collisions.push({ col, with: 'карандаш-БОКС', dx: +(Math.min(rc.r,pb.r)-Math.max(rc.l,pb.l)).toFixed(1), dy: +(Math.min(rc.b,pb.b)-Math.max(rc.t,pb.t)).toFixed(1) })
          if (hit(rc, tb)) collisions.push({ col, with: 'корзина-БОКС', dx: +(Math.min(rc.r,tb.r)-Math.max(rc.l,tb.l)).toFixed(1), dy: +(Math.min(rc.b,tb.b)-Math.max(rc.t,tb.t)).toFixed(1) })
        }
      }
      out.push({ when: tr.querySelector("td[data-col='when']")?.textContent, note: tr.querySelector("td[data-col='note']")?.textContent?.slice(0,40), rowH: +(box(tr).b - box(tr).t).toFixed(0), collisions })
    }
    return out
  })
  console.log(`\n##### w=${c.w} xlarge ${c.d} #####`)
  for (const r of m) {
    const c2 = r.collisions
    console.log(` ${r.when} h=${r.rowH} note="${r.note}"`)
    if (!c2.length) console.log('    столкновений нет')
    for (const x of c2) console.log(`    ${x.col} × ${x.with}  dx=${x.dx} dy=${x.dy}`)
  }
  const tbl = await page.$('.readings-table')
  await tbl.screenshot({ path: `${OUT}/pencil2_${c.w}.png` })
  await ctx.close()
}
await browser.close()
