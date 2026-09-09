import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_PROXY ?? 'http://localhost:5202'

  return {
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },

    server: {
      port: 5173,
      strictPort: true,
      // En desarrollo /api viaja al backend, así el código usa rutas relativas
      // igual que en producción y no hace falta cambiar nada al publicar.
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },

    build: {
      // El build cae directo en wwwroot de la API: un solo sitio en IIS.
      outDir: path.resolve(import.meta.dirname, '../backend/Gbp.Tms.Api/wwwroot'),
      emptyOutDir: true,
      sourcemap: mode !== 'production',
    },
  }
})
