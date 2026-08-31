import { chromium } from 'playwright'

const URL = 'http://localhost:5299'
const FROZEN = new Date('2026-08-31T16:24:00').getTime()
const DAY = 86_400_000

async function seed(page, now) {
  await page.evaluate(async (now) => {
    const DAY = 86_400_000
    const midnight = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime() }
    const day0 = midnight(now)
    const at = (o, h) => day0 + o * DAY + h * 3_600_000

    const marksMorning = []
    for (let i = -25; i <= 0; i++) if (i !== -5 && i !== -9) marksMorning.push(at(i, 8))
    const marksMetf = []
    for (let i = -25; i <= 0; i++) { marksMetf.push(at(i, 8)); if (i < 0) marksMetf.push(at(i, 19)) }
    const marksAml = []
    for (let i = -25; i < 0; i++) if (i % 4 !== 0) marksAml.push(at(i, 20))

    const medicines = [
      { id: 'm1', name: 'Периндоприл', dose: '5 мг', inn: 'Периндоприл',
        form: 'Таблетки, покрытые пленочной оболочкой', maker: 'Сервье',
        packSize: 30, left: 18, perDay: null, expires: Date.UTC(2027, 4, 31),
        times: ['08:00'], perTime: 1, meal: 'before', taken: marksMorning, leftAt: now - 3*DAY },
      { id: 'm2', name: 'Амлодипин', dose: '5 мг', inn: 'Амлодипин', form: 'Таблетки',
        maker: 'Озон', packSize: 30, left: 3, perDay: null, expires: Date.UTC(2027, 7, 31),
        times: ['20:00'], perTime: 1, taken: marksAml, leftAt: now - DAY },
      { id: 'm3', name: 'Метформин', dose: '850 мг', inn: 'Метформин', form: 'Таблетки',
        maker: 'Гедеон Рихтер', packSize: 60, left: 30, perDay: null, expires: Date.UTC(2027, 10, 30),
        times: ['08:00', '19:00'], perTime: 2, meal: 'after', taken: marksMetf, leftAt: now - 5*DAY },
      { id: 'm4', name: 'Аторвастатин', dose: '20 мг', inn: 'Аторвастатин', form: 'Таблетки',
        maker: 'Канонфарма', packSize: 30, left: 25, perDay: null, expires: Date.UTC(2027, 7, 31),
        times: ['21:00'], perTime: 1, taken: [] },
      { id: 'm5', name: 'Витамин D3', dose: '2000 МЕ', kind: 1, inn: 'Колекальциферол',
        form: 'капсулы', maker: 'ООО «Эвалар»', packSize: 60, left: 40, perDay: 1,
        expires: Date.UTC(2027, 0, 31), times: ['09:00'], perTime: 1,
        autoDeduct: true, taken: [at(-3,9), at(-2,9), at(0,9)], leftAt: now - DAY },
    ]

    const readings = []
    for (let i = -40; i <= 0; i++) {
      readings.push({ id: `bp-${i}`, kind: 'bp', ts: at(i, 8) + 600_000, user: 1, source: 'device',
        sys: 128 + ((i % 7) + 7) % 7, dia: 82 + ((i % 4) + 4) % 4,
        bpm: 68 + ((i % 5) + 5) % 5, ihb: i % 11 === 0, mov: i % 13 === 0 })
      if (i % 3 === 0) readings.push({ id: `bp2-${i}`, kind: 'bp', ts: at(i, 20) + 600_000, user: 1, source: 'device',
        sys: 134 + ((i % 5) + 5) % 5, dia: 79 + ((i % 3) + 3) % 3, bpm: 72, ihb: false, mov: false })
      if (i % 2 === 0) readings.push({ id: `gl-${i}`, kind: 'glucose', ts: at(i, 7) + 300_000, user: 1,
        source: 'manual', mmol: 5.4 + (((i % 6) + 6) % 6) * 0.4,
        context: i % 4 === 0 ? 'fasting' : 'after-meal' })
    }

    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction(['medicines','readings','meta'], 'readwrite')
      medicines.forEach((m) => tx.objectStore('medicines').put(m))
      readings.forEach((r) => tx.objectStore('readings').put(r))
      tx.objectStore('meta').put({ trackGlucose: true, seenIntro: true, onboarded: true }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, now)
}

const overflowProbe = () => {
  const out = []
  const docW = document.documentElement.clientWidth
  for (const el of document.querySelectorAll('main *, header *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    if (r.right > docW + 0.5 || r.left < -0.5) {
      out.push({ what: 'viewport', tag: el.tagName, cls: el.className?.toString?.().slice(0,60),
        txt: (el.textContent||'').trim().slice(0,40), left: Math.round(r.left), right: Math.round(r.right), docW })
    }
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible') {
      out.push({ what: 'self-overflow', tag: el.tagName, cls: el.className?.toString?.().slice(0,60),
        txt: (el.textContent||'').trim().slice(0,40), scrollW: el.scrollWidth, clientW: el.clientWidth })
    }
  }
  return out
}

const tapProbe = () => {
  const out = []
  for (const el of document.querySelectorAll('button, a, input, select, summary, [role="button"], [tabindex]')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.height < 44 || r.width < 44) out.push({ tag: el.tagName, cls: el.className?.toString?.().slice(0,50),
      txt: (el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,40), w: +r.width.toFixed(1), h: +r.height.toFixed(1) })
  }
  return out
}

async function run(text, density, tag) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 407, height: 900 }, deviceScaleFactor: 3,
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 15000 })
  await seed(page, FROZEN)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 15000 })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.evaluate(([t, d]) => {
    document.documentElement.setAttribute('data-text', t)
    document.documentElement.setAttribute('data-density', d)
  }, [text, density])
  await page.locator('header button', { hasText: 'Отчёт' }).first().click()
  await page.waitForTimeout(600)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(200)

  const dir = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/probe'
  await page.screenshot({ path: `${dir}/${tag}-full.png`, fullPage: true })
  const ov = await page.evaluate(overflowProbe)
  const taps = await page.evaluate(tapProbe)
  console.log(`\n===== ${tag} (text=${text} density=${density}) =====`)
  console.log('OVERFLOW:', JSON.stringify(ov, null, 1))
  console.log('SMALL TAPS:', JSON.stringify(taps, null, 1))
  const h = await page.evaluate(() => document.body.scrollHeight)
  console.log('page height:', h)
  await browser.close()
}

await run('normal', 'normal', 'norm')
await run('xlarge', 'roomy', 'xl')
