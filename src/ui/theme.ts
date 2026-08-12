import type { ThemeChoice } from '../types'

/**
 * Применение выбранной темы к документу.
 *
 * Тема хранится в настройках вместе со всем остальным, но продублирована в
 * localStorage: настройки лежат в IndexedDB и читаются асинхронно, а тему нужно
 * поставить до первой отрисовки — иначе тёмный экран мигает белым. Читает этот
 * дубликат маленький скрипт в index.html.
 */

const KEY = 'theme'

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement

  if (choice === 'auto') delete root.dataset.theme
  else root.dataset.theme = choice

  try {
    if (choice === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Приватный режим может запретить хранилище. Тема в этой сессии работает,
    // просто следующий запуск начнётся с системной — это лучше, чем падение.
  }

  paintBrowserChrome(choice)
}

/**
 * Цвет адресной строки и системных панелей.
 *
 * В разметке лежат два тега с медиавыражениями — они верны, пока тема системная.
 * Стоит пользователю выбрать тему принудительно, и медиавыражение начинает врать:
 * при системной тёмной и выбранной светлой браузер взял бы тёмный цвет. Поэтому
 * при явном выборе обоим тегам проставляется один и тот же цвет.
 */
function paintBrowserChrome(choice: ThemeChoice): void {
  const tags = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  if (tags.length === 0) return

  if (choice === 'auto') {
    // Возвращаем разметочные значения: каждый тег снова отвечает за свою систему.
    tags.forEach((tag) => {
      const dark = tag.media.includes('dark')
      tag.content = dark ? DARK_PAGE : LIGHT_PAGE
    })
    return
  }

  // Берём цвет из уже применённых токенов, а не из константы: так он не
  // разъедется с палитрой при следующей правке app.css.
  const page = getComputedStyle(document.documentElement).getPropertyValue('--page').trim()
  const color = page || (choice === 'dark' ? DARK_PAGE : LIGHT_PAGE)
  tags.forEach((tag) => {
    tag.content = color
  })
}

/** Запасные значения на случай, если стили ещё не применились. Совпадают с `--page`. */
const DARK_PAGE = '#0d0d0d'
const LIGHT_PAGE = '#f0efec'
