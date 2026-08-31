import { chromium } from 'playwright'

const URL = 'http://localhost:5199'

async function seed(page) {
  await page.evaluate(async () => {
    const DAY = 86_400_000
    const now = Date.now()
    const midnight = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime() }
    const day0 = midnight(now)
    const at = (o, h) => day0 + o * DAY + h * 3_600_000

    const marks = []
    for (let i = -10; i < 0; i++) marks.push(at(i, 8))

    const medicines = [{
      id: 'm5', name: 'Метформин', dose: '850 мг', inn: 'Метформин', form: 'Таблетки',
      maker: 'Гедеон Рихтер', packSize: 60, left: 30, perDay: null,
      expires: Date.UTC(2027, 10, 30), times: ['08:00'], perTime: 2, meal: 'after',
      autoDeduct: false, taken: marks, leftAt: at(-1, 8) + 60_000, since: at(-30, 0),
    }]

    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3)
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction(['medicines','readings','meta'], 'readwrite')
      tx.objectStore('medicines').clear()
      tx.objectStore('meta').put({ onboarded: true }, 'settings')
      medicines.forEach(m => tx.objectStore('medicines').put(m))
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  })
}

async function dump(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3)
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    const all = await new Promise((res, rej) => {
      const q = db.transaction('medicines').objectStore('medicines').getAll()
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error)
    })
    db.close()
    const m = all[0]
    const midnight = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime() }
    const today = midnight(Date.now())
    return {
      left: m.left,
      leftAt: new Date(m.leftAt).toISOString(),
      takenTotal: (m.taken ?? []).length,
      takenToday: (m.taken ?? []).filter(t => t >= today && t < today + 86400000).map(t => new Date(t).toISOString()),
    }
  })
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
const page = await ctx.newPage()
const CPU = Number(process.env.CPU ?? 1)
if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }) }
page.on('pageerror', e => console.log('PAGEERROR', e.message))

await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await seed(page)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 })
await page.waitForTimeout(400)

await page.locator('nav.tabs button', { hasText: 'Приём' }).first().click()
await page.waitForTimeout(400)

console.log('ДО:', JSON.stringify(await dump(page)))

// Инструментируем: засекаем, через сколько миллисекунд после клика кнопка исчезает.
await page.evaluate(() => {
  window.__log = []
  const li = [...document.querySelectorAll('li.dose')].find(n => n.textContent.includes('Метформин'))
  window.__li = li
  const btn = li.querySelector('button.btn--primary')
  window.__t0 = null
  btn.addEventListener('pointerdown', () => { window.__t0 = performance.now(); window.__log.push(['pointerdown', 0]) }, true)
  const obs = new MutationObserver(() => {
    if (window.__t0 === null) return
    const still = li.querySelector('button.btn--primary')
    const done = li.querySelector('.dose__done')
    window.__log.push(['mutation', +(performance.now() - window.__t0).toFixed(1), 'кнопка=' + !!still, 'принято=' + !!done])
  })
  obs.observe(li, { childList: true, subtree: true, characterData: true, attributes: true })
})

const btn = page.locator('li.dose', { hasText: 'Метформин' }).locator('button.btn--primary')
const box = await btn.boundingBox()
console.log('кнопка:', JSON.stringify(box))

const GAP = Number(process.env.GAP ?? 250)

await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down(); await page.mouse.up()
await page.waitForTimeout(GAP)

// Что под курсором на месте кнопки во время второго нажатия
const under = await page.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y)
  return el ? `${el.tagName}.${el.className} «${(el.textContent||'').trim().slice(0,40)}»` : 'ничего'
}, [box.x + box.width / 2, box.y + box.height / 2])
console.log(`через ${GAP} мс под точкой первого нажатия:`, under)

await page.mouse.down(); await page.mouse.up()
await page.waitForTimeout(800)

console.log('ЛОГ:', JSON.stringify(await page.evaluate(() => window.__log), null, 0))
console.log('ПОСЛЕ:', JSON.stringify(await dump(page)))
console.log('ЭКРАН приёма:', (await page.locator('li.dose', { hasText: 'Метформин' }).innerText()).replace(/\n/g, ' | '))

await page.locator('nav.tabs button', { hasText: 'Аптечка' }).first().click()
await page.waitForTimeout(700)
console.log('АПТЕЧКА:', (await page.locator('.stack').first().innerText()).replace(/\n/g, ' | ').slice(0, 400))
await page.locator('.pill__open').first().click(); await page.waitForTimeout(700)
console.log('КАРТОЧКА:', (await page.locator('.card').first().innerText()).replace(/\n/g, ' | ').slice(0, 400))
await page.locator('header button', { hasText: 'Отчёт' }).first().click(); await page.waitForTimeout(900)
const rep = (await page.evaluate(()=>document.body.innerText)).replace(/\n/g,' | ')
const i = rep.indexOf('Соблюдение')
console.log('ОТЧЁТ:', rep.slice(i >= 0 ? i : 0, (i >= 0 ? i : 0) + 400))
// Одно нажатие «убрать отметку» — что станет с дублем
await page.locator('nav.tabs button', { hasText: 'Приём' }).first().click(); await page.waitForTimeout(600)
await page.locator('button.dose__undo').first().click(); await page.waitForTimeout(900)
console.log('ПОСЛЕ ОДНОГО «убрать отметку»:', JSON.stringify(await dump(page)))

await browser.close()
