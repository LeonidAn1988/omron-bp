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
}
