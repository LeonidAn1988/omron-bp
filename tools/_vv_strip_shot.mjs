import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = 'http://localhost:4477'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/'
const browser = await chromium.launch()
async function prep(width, scale, density) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 3, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200); await seed(page, FROZEN)
  await page.evaluate(async ([s, d]) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp',3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
    const cur = await new Promise((res)=>{ const tx=db.transaction('meta','readonly'); const q=tx.objectStore('meta').get('settings'); q.onsuccess=()=>res(q.result||{}) })
    cur.textScale = s; cur.density = d; cur.onboarded = true
    await new Promise((res,rej)=>{ const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
    db.close()
  }, [scale, density])
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  return { ctx, page }
}
for (const [scale, density, width, tag] of [['xlarge','roomy',406,'xl-roomy-406'], ['normal','normal',360,'norm-360'], ['xlarge','roomy',360,'xl-roomy-360'], ['xlarge','roomy',320,'xl-roomy-320']]) {
  const { ctx, page } = await prep(width, scale, density)
  await go(page, { tab: 'Обзор' }); await page.waitForTimeout(300)
  await page.locator('.stats-strip').first().screenshot({ path: OUT + 'strip-' + tag + '.png' })
  await ctx.close()
}
await browser.close()
console.log('ok')
