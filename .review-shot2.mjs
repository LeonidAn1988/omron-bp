import { chromium } from 'playwright'
import { FROZEN, settle, go } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/obzorshots'
const URL = 'http://localhost:5199'

async function seedCustom(page, readings, meta) {
  await page.evaluate(
    async ({ readings, meta }) => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('omron-bp', 3)
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      await new Promise((res, rej) => {
        const tx = db.transaction(['medicines', 'readings', 'meta'], 'readwrite')
        tx.objectStore('medicines').clear()
        tx.objectStore('readings').clear()
        readings.forEach((r) => tx.objectStore('readings').put(r))
        tx.objectStore('meta').put(meta, 'settings')
        tx.oncomplete = res
        tx.onerror = () => rej(tx.error)
      })
      db.close()
    },
    { readings, meta },
  )
}

const day0 = (() => {
  const d = new Date(FROZEN)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
})()
const at = (off, h) => day0 + off * 86_400_000 + h * 3_600_000

const cases = {
  // день первый: одно измерение
  one: [{ id: 'b1', kind: 'bp', ts: at(0, 8), user: 1, source: 'manual', sys: 131, dia: 84, bpm: 72 }],
  // криз последним
  crisis: [
    { id: 'b1', kind: 'bp', ts: at(-2, 8), user: 1, source: 'manual', sys: 138, dia: 88, bpm: 72 },
    { id: 'b2', kind: 'bp', ts: at(-1, 8), user: 1, source: 'manual', sys: 152, dia: 95, bpm: 80 },
    { id: 'b3', kind: 'bp', ts: at(0, 8) + 1_800_000, user: 1, source: 'manual', sys: 194, dia: 126, bpm: 96, ihb: true },
  ],
  // данные только старые: выбранный период 30 дней пуст
  old: [{ id: 'b1', kind: 'bp', ts: at(-200, 8), user: 1, source: 'manual', sys: 131, dia: 84, bpm: 72 }],
}

const browser = await chromium.launch()
for (const [name, readings] of Object.entries(cases)) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 780 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    colorScheme: 'dark',
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await settle(page)
  await seedCustom(page, readings, { trackGlucose: false })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await go(page, { tab: 'Обзор' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  const text = await page.locator('.stack').first().innerText()
  console.log(`\n===== ${name} =====\n${text}`)
  await ctx.close()
}
await browser.close()
