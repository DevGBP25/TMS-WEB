import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import App from './App.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Datos operativos: se revalidan al volver a la pestaña, sin reintentos agresivos.
      staleTime: 30_000,
      // Un 4xx es una respuesta definitiva (no existe, dato inválido): reintentarlo
      // no cambia nada y además deja la consulta atrapada en el retryer.
      retry: (intentos, error) =>
        error instanceof ApiError && error.status < 500 ? false : intentos < 1,
      refetchOnWindowFocus: true,
      // El TMS corre contra un IIS de la red interna: navigator.onLine no dice nada
      // sobre si ese servidor responde. Con el modo 'online' por defecto, React Query
      // deja la consulta en 'paused' y la pantalla en blanco sin mostrar el error.
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* BASE_URL lo fija Vite desde `base`: '/' en la raíz, '/TMS/' si la
          aplicación cuelga de una subruta de IIS. Sin esto el router creería
          estar en la raíz y ninguna ruta haría match.

          La barra final hay que quitarla: React Router exige que la ruta
          empiece por el basename completo, y '/TMS' no empieza por '/TMS/'.
          Con la barra, entrar sin ella deja la pantalla en blanco sin error. */}
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/+$/, '') || '/'}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
