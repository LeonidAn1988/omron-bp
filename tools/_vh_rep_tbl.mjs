import { chromium } from 'playwright'
import { seed, FROZEN } from './visual.mjs'

const URL = process.env.URL ?? 'https://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()

// Препараты из находки: длинные названия и дозировки.
const EXTRA = [
  { id: 'x1', name: 'Амлодипин', dose: '5 мг', inn: 'Амлодипин', form: 'Таблетки' },
  { id: 'x2', name: 'Аторвастатин', dose: '20 мг', inn: 'Аторвастатин', form: 'Таблетки, покрытые пленочной оболочкой' },
  { id: 'x3', name: 'Периндоприл', dose: '10 мг', inn: 'Периндоприл', form: 'Таблетки' },
  { id: 'x4', name: 'Колекальциферол', dose: '2000 МЕ', inn: 'Колекальциферол', form: 'Капли для приема внутрь' },
]

for (const scale of ['normal', 'xlarge']) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light',
    deviceScaleFactor: 2, ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await seed(page, FROZEN)
  await page.evaluate(async ({ s, extra, now }) => {
    const DAY = 86400000
    const day0 = (() => { const d = new Date(now); d.setHours(0,0,0,0); return d.getTime() })()
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s; cur.onboarded = true; cur.trackGlucose = true
    const marks = []
    for (let i = -20; i <= 0; i++) { if (i !== -7) marks.push(day0 + i*DAY + 8*3600000) }
    await new Promise((res, rej) => {
      const tx = db.transaction(['meta','medicines'],'readwrite')
      tx.objectStore('meta').put(cur,'settings')
      extra.forEach((m, k) => tx.objectStore('medicines').put({
        ...m, maker: 'Озон', packSize: 30, left: 20, perDay: null,
        expires: Date.UTC(2027, 6, 31), times: ['08:00'], perTime: 1,
        // у первого — полное соблюдение, чтобы получить ровно «100%»
        taken: k === 0 ? marks.concat([day0 - 7*DAY + 8*3600000]) : marks,
      }))
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
    localStorage.setItem('textScale', s)
  }, { s: scale, extra: EXTRA, now: FROZEN })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 30000 })
  await page.locator('header button', { hasText: 'Отчёт' }).first().click()
  await page.waitForTimeout(700)

  const data = await page.evaluate(() => {
    // Разбор реальных переносов: по клиентским прямоугольникам текстовых узлов.
    const linesOf = (el) => {
      const out = []
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let n
      let cur = null
      while ((n = walk.nextNode())) {
        const text = n.nodeValue
        if (!text.trim()) continue
        const r = document.createRange()
        for (let i = 0; i < text.length; i++) {
          r.setStart(n, i); r.setEnd(n, i + 1)
          const rect = r.getBoundingClientRect()
          if (!rect.width && !rect.height) continue
          const top = Math.round(rect.top)
          if (!cur || Math.abs(cur.top - top) > 3) { cur = { top, s: '' }; out.push(cur) }
          cur.s += text[i]
        }
      }
      return out.map((l) => l.s)
    }
    const tbl = (sel) => {
      const t = document.querySelector(sel)
      if (!t) return null
      return {
        width: Math.round(t.getBoundingClientRect().width),
        scrollX: t.scrollWidth > t.clientWidth,
        head: [...t.querySelectorAll('th')].map((th) => ({ text: th.textContent.trim(), lines: linesOf(th) })),
        rows: [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => ({
          text: td.innerText.replace(/\n/g, ' | '), lines: linesOf(td),
          clipped: td.scrollHeight > td.clientHeight + 1 || td.scrollWidth > td.clientWidth + 1,
        }))),
      }
    }
    const app = document.querySelector('.app')
    return {
      root: getComputedStyle(document.documentElement).fontSize,
      docScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      docScrollW: document.documentElement.scrollWidth,
      viewportW: document.documentElement.clientWidth,
      drugs: tbl('.report-drugs'),
      adherence: tbl('.report-adherence'),
    }
  })
  console.log('===== textScale =', scale, '=====')
  console.log(JSON.stringify(data, null, 2))
  await page.locator('.report-drugs').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${OUT}/vh_rep_${scale}.png`, fullPage: true })
  await ctx.close()
}
await browser.close()
