/**
 * Реализация FilePort в браузере: временная ссылка на Blob.
 *
 * На нативных платформах здесь будет системный диалог сохранения или «поделиться»,
 * а ядро об этом не узнает.
 */

import type { FilePort } from '../ports'

export const webFiles: FilePort = {
  async save(filename, content, mime) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    // Освобождаем не сразу: Safari успевает начать скачивание только после кадра.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },

  canShare() {
    // Проверяем именно передачу файлов: navigator.share есть и там, где умеет
    // только ссылку с текстом, а нам нужен файл.
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
    try {
      return navigator.canShare({ files: [new File([''], 'проба.json', { type: 'application/json' })] })
    } catch {
      return false
    }
  },

  async share(filename, content, mime) {
    const file = new File([content], filename, { type: mime })
    try {
      await navigator.share({ files: [file], title: filename })
      return true
    } catch (error) {
      // Закрытое окно «поделиться» — не ошибка.
      if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError')) {
        return false
      }
      throw error
    }
  },
}
