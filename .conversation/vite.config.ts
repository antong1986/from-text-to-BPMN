import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Запросы к Claude API уходят на Express-прокси (server/index.js)
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
