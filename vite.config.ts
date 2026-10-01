import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      // En desarrollo la API corre en otro proceso. El proxy hace que el navegador
      // la vea en el mismo origen, igual que en producción, y así no hacen falta
      // CORS ni reglas especiales de seguridad.
      '/api': {
        target: `http://localhost:${process.env.API_PORT ?? 8787}`,
        changeOrigin: false,
      },
    },
  },
})
