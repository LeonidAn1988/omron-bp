import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

for (const [w, scale] of [[412,'normal'],[360,'normal'],[412,'xlarge']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 915 }, locale:'ru-RU', timezoneId:'Europe/Moscow', colorScheme:'dark', deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil:'domcontentloaded' }); await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res,rej)=>{const r=indexedDB.open('omron-bp',3);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})
    const cur = await new Promise((res)=>{const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('settings');q.onsuccess=()=>res(q.result||{})})
    cur.onboarded = true; cur.textScale = s
    await new Promise((res,rej)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(cur,'settings');tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})
    db.close(); localStorage.setItem('textScale', s)
  }, scale)
  await page.reload({ waitUntil:'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await go(page, { tab: 'Приём' }); await page.waitForTimeout(400)

  const probe = () => page.evaluate(() => {
    const lines = (el) => el.getClientRects().length
    const cards = [...document.querySelectorAll('.card.intake')]
    return {
      docH: Math.round(document.documentElement.scrollHeight),
      cards: cards.map(c => ({
        head: c.querySelector('h2').textContent.trim(),
        h: Math.round(c.getBoundingClientRect().height),
        rows: [...c.querySelectorAll('.dose')].map(r => {
          const n = r.querySelector('.dose__name'), b = r.querySelector('.dose__body')
          return { name: n.textContent.trim(), rowH: Math.round(r.getBoundingClientRect().height),
                   bodyH: Math.round(b.getBoundingClientRect().height), bodyLines: b.getClientRects().length,
                   nameLines: lines(n),
                   // сколько визуальных строк занимает тело: по высоте / высоту одной строки имени
                   amtTop: r.querySelector('.dose__amount') ? Math.round(r.querySelector('.dose__amount').getBoundingClientRect().top - n.getBoundingClientRect().top) : null }
        })
      }))
    }
  })
  const before = await probe()
  await page.addStyleTag({ content: `.dose__name{font-size:var(--fs-3)} .dose__time{font-size:var(--fs-1);font-weight:500;color:var(--text-secondary);min-width:4.5em}` })
  await page.waitForTimeout(200)
  const after = await probe()
  console.log(`\n##### ${w}px / ${scale} #####`)
  console.log('ДО   docH=' + before.docH)
  for (const c of before.cards) console.log('  ' + c.head + ' h=' + c.h + '  ' + c.rows.map(r=>`${r.name}:h${r.rowH}/смещ${r.amtTop}`).join(' | '))
  console.log('ПОСЛЕ docH=' + after.docH)
  for (const c of after.cards) console.log('  ' + c.head + ' h=' + c.h + '  ' + c.rows.map(r=>`${r.name}:h${r.rowH}/смещ${r.amtTop}`).join(' | '))
  await page.screenshot({ path: `${OUT}/ump_after_${w}_${scale}.png`, fullPage: true })
  await ctx.close()
}
await browser.close()
