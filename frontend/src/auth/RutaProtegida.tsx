import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import Icon from '@/components/Icon'

/** Deja pasar sólo a usuarios autenticados. */
export default function RutaProtegida() {
  const { autenticado, cargando } = useAuth()
  const location = useLocation()

  // Sin esto se vería un parpadeo al login en cada recarga con sesión válida.
  if (cargando) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-md text-ink-faint">
        <Icon name="progress_activity" size={28} className="animate-spin text-accent" />
        <span className="text-body-sm">Verificando sesión…</span>
      </div>
    )
  }

  if (!autenticado) {
    return <Navigate to="/login" replace state={{ desde: location.pathname }} />
  }

  return <Outlet />
}
