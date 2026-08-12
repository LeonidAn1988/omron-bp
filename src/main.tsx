import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installWebPlatform } from './platform/web'
import './app.css'

// Платформа устанавливается до первого рендера: ядро обращается к портам сразу.
installWebPlatform()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Офлайн-режим нужен только в собранной версии: в dev это мешает горячей перезагрузке.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI)).catch(() => {
      /* офлайн — приятный бонус, а не обязательное условие */
    })
  })
}
