import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Web Bluetooth требует secure context.
//   npm run dev      -> http://localhost:5199        (localhost считается защищённым, годится для Mac)
//   npm run dev:lan  -> https://<ip-мака>:5199       (самоподписанный сертификат, нужен для Android)
const lan = process.env.LAN === '1'

export default defineConfig({
  base: './',
  plugins: [react(), ...(lan ? [basicSsl()] : [])],
  server: {
    port: 5199,
    host: lan ? true : 'localhost',
    strictPort: true,
  },
  preview: { port: 5199, host: true },
})
