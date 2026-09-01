/**
 * Визуальная проверка: снимки всех экранов уходят в Percy.
 *
 *   npm run visual
 *
 * Зачем. Дефекты вёрстки в этом приложении находились глазами по скриншотам —
 * лента дней, распиравшая страницу вчетверо; слова, рвущиеся посреди корня;
 * карточка, вылезшая за край на 360 пикселях. Всё это машина ловит сама, если
 * есть с чем сравнивать. И главное: Percy показывает то, что съехало там, куда
 * не собирались лезть, — правишь отчёт, а разъезжается аптечка.
 *
 * Почему не BrowserStack. Automate у аккаунта на бесплатном триале, минуты
 * выбраны. Percy — отдельный продукт с отдельным счётчиком: разметка снимается
 * здесь локальным браузером, а отрисовывается в облаке Percy, хаб Selenium не
 * участвует.
 *
 * Чего этой проверкой не сделать: настоящего iOS Safari, реальной плотности
 * экрана и Web Bluetooth. Первые два — руками через BrowserStack Live, третье
 * не проверяется в облаке вообще.
 */

import { chromium } from 'playwright'
import percySnapshot from '@percy/playwright'

const URL = process.env.URL ?? 'http://localhost:5199'

/**
 * Часы стоят.
 *
 * Без этого каждый прогон давал бы расхождения на пустом месте: «составлен 15
 * августа», «хватит на 6 дней», «до 21 августа» — всё это меняется само собой,
 * и настоящая правка утонула бы в шуме. Дата выбрана фиксированной, данные
 * ниже отсчитываются от неё же.
 */
export const FROZEN = new Date('2026-08-15T10:30:00').getTime()
const DAY = 24 * 60 * 60 * 1000

/** Экраны, которые снимаем. Порядок — как в навигации, чтобы отчёт читался сверху вниз. */
export const SCREENS = [
  { name: 'Обзор', tab: 'Обзор' },
  { name: 'Давление', tab: 'Давление' },
  { name: 'Сахар', tab: 'Сахар' },
  { name: 'Приём', tab: 'Приём' },
  { name: 'Аптечка', tab: 'Аптечка' },
  { name: 'Карточка препарата', tab: 'Аптечка', open: 'Конкор' },
  { name: 'Карточка БАДа', tab: 'Аптечка', open: 'Омега-3' },
  { name: 'Форма препарата', tab: 'Аптечка', click: 'Добавить препарат' },
  { name: 'Отчёт врачу', tool: 'Отчёт' },
  { name: 'Настройки', tool: 'Настройки' },
  // Пароль копии — новое состояние экрана, и оно не видно, пока галка снята.
  { name: 'Настройки — пароль копии', tool: 'Настройки', check: 'Закрыть копию паролем' },
  // История версий свёрнута по умолчанию — иначе в снимок попадает одна строка.
  { name: 'Настройки — история версий', tool: 'Настройки', expand: 'Прежние версии' },
  { name: 'Прибор', tool: 'Прибор' },
]

/**
 * Наполнение аптечки и дневников.
 *
 * Пустые экраны не показывают ничего интересного: заглушка «дневник пуст»
 * выглядит одинаково при любой поломке вёрстки. Поэтому данные подобраны так,
 * чтобы задеть все состояния разом — кончающийся запас, истекающий срок,
 * автосписание, пропущенный приём, БАД и гомеопатия.
 */
export async function seed(page, frozen) {
  await page.evaluate(async (now) => {
    const DAY = 86_400_000
    const midnight = (ts) => {
      const d = new Date(ts)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }
    const day0 = midnight(now)
    const at = (offset, hour) => day0 + offset * DAY + hour * 3_600_000

    const marks = []
    for (let i = -20; i <= 0; i++) {
      if (i !== -5) marks.push(at(i, 8))
      if (i < 0 && i !== -12) marks.push(at(i, 20))
    }

    const medicines = [
      {
        id: 'm1', name: 'Конкор', dose: '5 мг', inn: 'Бисопролол',
        form: 'Таблетки, покрытые пленочной оболочкой', maker: 'Мерк КГаА',
        packSize: 30, left: 12, perDay: null, expires: Date.UTC(2027, 4, 31),
        times: ['08:00', '20:00'], perTime: 1, meal: 'after', taken: marks, leftAt: now - 3 * DAY,
        // Свёрнутая история и день начала приёма — литералом, а не расчётом от
        // засеянных отметок: снимок должен быть побайтово одинаковым от прогона
        // к прогону, а свёртка зависит от текущего дня.
        startedAt: Date.UTC(2025, 6, 1),
        foldedUntil: now - 59 * DAY,
        history: { '2026-05': { planned: 44, taken: 39 }, '2026-06': { planned: 60, taken: 51 } },
      },
      {
        id: 'm2', name: 'Омега-3 Ультра', dose: '', kind: 1,
        inn: 'ПНЖК омега-3, витамина Е', form: 'капсулы', maker: 'ООО «Эвалар»',
        packSize: 60, left: 40, perDay: null, expires: Date.UTC(2027, 0, 31),
        times: ['09:00'], perTime: 1, taken: [at(-3, 9), at(-2, 9), at(0, 9)], leftAt: now - DAY,
      },
      {
        id: 'm3', name: 'Оциллококцинум', dose: '', kind: 2, inn: '',
        form: 'Гранулы гомеопатические', maker: 'Лаборатория Буарон',
        packSize: 6, left: 4, perDay: null, expires: Date.UTC(2026, 8, 30),
      },
      {
        id: 'm4', name: 'Лозартан', dose: '50 мг', inn: 'Лозартан', form: 'Таблетки',
        maker: 'Озон', packSize: 30, left: 25, perDay: null, expires: Date.UTC(2027, 7, 31),
        times: ['21:00'], perTime: 1, taken: [],
      },
      {
        id: 'm5', name: 'Метформин', dose: '850 мг', inn: 'Метформин', form: 'Таблетки',
        maker: 'Гедеон Рихтер', packSize: 60, left: 30, perDay: 2,
        expires: Date.UTC(2027, 10, 30), times: ['08:00', '19:00'], perTime: 1,
        autoDeduct: true, taken: [], leftAt: now - 5 * DAY,
      },
    ]

    const readings = []
    for (let i = -29; i <= 0; i++) {
      readings.push({
        id: `bp-${i}`, kind: 'bp', ts: at(i, 8) + 600_000, user: 1, source: 'manual',
        sys: 128 + ((i % 7) + 7) % 7, dia: 82 + ((i % 4) + 4) % 4,
        bpm: 68 + ((i % 5) + 5) % 5, ihb: i % 11 === 0, mov: false,
      })
      if (i % 2 === 0) {
        readings.push({
          id: `gl-${i}`, kind: 'glucose', ts: at(i, 7) + 300_000, user: 1, source: 'manual',
          mmol: 5.4 + (((i % 6) + 6) % 6) * 0.4,
          context: i % 4 === 0 ? 'fasting' : 'after-meal',
        })
      }
    }

    const db = await new Promise((resolve, reject) => {
      // Без номера версии: открывается та, что уже создало приложение. С
      // жёстко указанной цифрой посев ломался при каждой миграции схемы —
      // прогон падал с VersionError ещё до первого снимка.
      const request = indexedDB.open('omron-bp')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['medicines', 'readings', 'meta'], 'readwrite')
      medicines.forEach((m) => tx.objectStore('medicines').put(m))
      readings.forEach((r) => tx.objectStore('readings').put(r))
      // Дневник сахара включаем явно: иначе раздел прячется и снимок пустой.
      // `onboarded` — тоже явно: без него приложение на пустом дневнике
      // показывает экран знакомства, а не себя.
      tx.objectStore('meta').put({ trackGlucose: true, onboarded: true }, 'settings')
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, frozen)
}

/** Ждём, пока React отрисует: без этого снимок ловит «Загрузка…». */
export const settle = async (page) => {
  await page.waitForSelector('nav.tabs', { timeout: 15_000 })
  await page.waitForTimeout(400)
}

/**
 * То же самое, но до засева.
 *
 * На пустом дневнике приложение показывает экран знакомства, а у него нет
 * вкладок — и ожидание `nav.tabs` валило весь прогон на первом же шаге, ещё до
 * единого снимка. Здесь достаточно дождаться, что React вообще отрисовал: база
 * к этому моменту уже создана, а засевать можно с любого экрана.
 */
export const settleAny = async (page) => {
  await page.waitForSelector('.app', { timeout: 15_000 })
  await page.waitForTimeout(400)
}

export async function go(page, screen) {
  if (screen.tab) {
    await page.locator('nav.tabs button', { hasText: screen.tab }).first().click()
  } else if (screen.tool) {
    await page.locator('header button', { hasText: screen.tool }).first().click()
  }
  await page.waitForTimeout(250)

  if (screen.open) {
    await page.locator('.pill__open', { hasText: screen.open }).first().click()
    await page.waitForTimeout(250)
  }
  if (screen.click) {
    await page.locator('button', { hasText: screen.click }).first().click()
    await page.waitForTimeout(250)
  }
  // Галка, а не кнопка: раскрывашки в настройках открываются переключателем, и
  // без этого их содержимое в снимок не попадает вовсе.
  if (screen.expand) {
    await page.locator('details', { hasText: screen.expand }).first().evaluate((el) => {
      el.open = true
    })
    await page.waitForTimeout(300)
  }
  if (screen.check) {
    await page.locator('label', { hasText: screen.check }).locator('input[type=checkbox]').first().check()
    await page.waitForTimeout(300)
  }
  // Прокрутка вверх: страницу мог утащить предыдущий экран, и снимок начался бы
  // с середины. Percy снимает документ целиком, но позиция влияет на «липкие»
  // элементы шапки.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(150)
}

async function main() {
  const browser = await chromium.launch()
  let count = 0

  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 900 },
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
      colorScheme: theme,
    })
    const page = await context.newPage()

    // Часы замораживаем до первого скрипта страницы: приложение читает время
    // сразу при запуске, и подмена после загрузки уже опоздала бы.
    await page.clock.install({ time: new Date(FROZEN) })

    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await settleAny(page)
    await seed(page, FROZEN)

    // Перезагрузка, а не обновление состояния: данные читаются один раз при
    // старте, дописывать их в живое приложение нечем.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await settle(page)

    // Тема ставится настройкой приложения, а не системной: снимок должен
    // показывать ровно то, что выбрал человек.
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme)
    await page.waitForTimeout(200)

    for (const screen of SCREENS) {
      try {
        await go(page, screen)
        await percySnapshot(page, `${screen.name} — ${theme === 'light' ? 'светлая' : 'тёмная'}`)
        count += 1
        console.log(`  снят: ${screen.name} (${theme})`)
      } catch (error) {
        // Один непойманный экран не должен ронять весь прогон: остальные
        // снимки полезны и сами по себе.
        console.error(`  ПРОПУЩЕН ${screen.name} (${theme}): ${error.message.split('\n')[0]}`)
      }
    }

    await context.close()
  }

  await browser.close()
  console.log(`\nснимков отправлено: ${count} из ${SCREENS.length * 2}`)
  if (count === 0) process.exitCode = 1
}

// Запускаем только при прямом вызове: проверка детерминизма импортирует
// отсюда посев и список экранов, и снимать при этом ничего не нужно.
if (process.argv[1]?.endsWith('visual.mjs')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
