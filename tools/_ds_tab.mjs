import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4477'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(500)
await go(page, { tab: 'Приём' })
await page.waitForTimeout(600)

// --- структура ленты
const struct = await page.evaluate(() => {
  const strip = document.querySelector('.daystrip')
  if (!strip) return { err: 'нет .daystrip' }
  const days = [...strip.querySelectorAll('.daystrip__day')]
  return {
    stripRole: strip.getAttribute('role'),
    stripLabel: strip.getAttribute('aria-label'),
    stripHasKeydownAttr: strip.outerHTML.slice(0, 200),
    count: days.length,
    roles: [...new Set(days.map(d => d.getAttribute('role')))],
    tabindexValues: [...new Set(days.map(d => d.getAttribute('tabindex') ?? '(нет)'))],
    disabled: days.filter(d => d.disabled).length,
    selectedIdx: days.findIndex(d => d.getAttribute('aria-selected') === 'true'),
    firstText: days[0]?.innerText.replace(/\n/g,' '),
    lastText: days[days.length-1]?.innerText.replace(/\n/g,' '),
    // видимость: сколько реально в кадре
    inView: days.filter(d => { const r = d.getBoundingClientRect(); const s = strip.getBoundingClientRect(); return r.right > s.left && r.left < s.right }).length,
  }
})
console.log('СТРУКТУРА ЛЕНТЫ:', JSON.stringify(struct, null, 1))

// --- обход Tab
await page.evaluate(() => { document.body.focus(); if (document.activeElement !== document.body) document.activeElement.blur() })
await page.evaluate(() => window.scrollTo(0,0))
const desc = () => page.evaluate(() => {
  const a = document.activeElement
  if (!a || a === document.body) return { tag: 'BODY' }
  return {
    tag: a.tagName,
    role: a.getAttribute('role') || '',
    cls: (a.className || '').toString().slice(0,40),
    txt: (a.innerText || a.value || a.getAttribute('aria-label') || '').replace(/\s+/g,' ').trim().slice(0,40),
    isDay: a.classList.contains('daystrip__day'),
  }
})

const stops = []
for (let i = 0; i < 200; i++) {
  await page.keyboard.press('Tab')
  const d = await desc()
  if (d.tag === 'BODY') { stops.push({ i: i+1, ...d, wrap: true }); break }
  stops.push({ i: i+1, ...d })
  if (stops.length > 1 && JSON.stringify(d) === JSON.stringify({ ...stops[0], i: undefined }) ) {}
}
const dayStops = stops.filter(s => s.isDay)
console.log('ВСЕГО ОСТАНОВОК ДО ВЫХОДА ИЗ ДОКУМЕНТА:', stops.length)
console.log('ИЗ НИХ ЛЕНТА ДНЕЙ:', dayStops.length, 'позиции', dayStops.length ? `${dayStops[0].i}…${dayStops[dayStops.length-1].i}` : '-')
const prinyal = stops.find(s => /Принял/.test(s.txt))
console.log('ПЕРВАЯ «Принял» НА ПОЗИЦИИ:', prinyal ? prinyal.i : 'не найдена', prinyal ? JSON.stringify(prinyal) : '')
console.log('--- первые 12 ---'); stops.slice(0,12).forEach(s => console.log(s.i, s.tag, s.role, '|', s.txt))
console.log('--- 74…конец ---'); stops.slice(73).forEach(s => console.log(s.i, s.tag, s.role, '|', s.txt, s.isDay?'[ДЕНЬ]':''))

// --- стрелки
await page.evaluate(() => { const d = document.querySelector('.daystrip__day[aria-selected="true"]'); d.focus() })
const before = await page.evaluate(() => {
  const days = [...document.querySelectorAll('.daystrip__day')]
  return { focusIdx: days.indexOf(document.activeElement), selIdx: days.findIndex(d => d.getAttribute('aria-selected')==='true'), scroll: Math.round(document.querySelector('.daystrip').scrollLeft) }
})
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(300)
const afterR = await page.evaluate(() => {
  const days = [...document.querySelectorAll('.daystrip__day')]
  return { focusIdx: days.indexOf(document.activeElement), selIdx: days.findIndex(d => d.getAttribute('aria-selected')==='true'), scroll: Math.round(document.querySelector('.daystrip').scrollLeft), activeTag: document.activeElement.tagName }
})
await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(200)
await page.keyboard.press('Home'); await page.waitForTimeout(200)
const afterHome = await page.evaluate(() => {
  const days = [...document.querySelectorAll('.daystrip__day')]
  return { focusIdx: days.indexOf(document.activeElement), selIdx: days.findIndex(d => d.getAttribute('aria-selected')==='true'), activeTag: document.activeElement.tagName }
})
console.log('СТРЕЛКИ: до', JSON.stringify(before), 'после ArrowRight', JSON.stringify(afterR), 'после Left+Home', JSON.stringify(afterHome))

await page.screenshot({ path: `${OUT}/_ds_priem.png`, fullPage: false })
await browser.close()
