import { Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'
import Icon from '@/components/Icon'

/**
 * Restringe un grupo de rutas a ciertos roles.
 *
 * Muestra un aviso en vez de redirigir: si alguien llega por un enlace
 * compartido, un salto silencioso al tablero parece un error de la aplicación.
 */
export default function RutaPorRol({ roles }: { roles: string[] }) {
  const { tieneRol } = useAuth()

  if (tieneRol(...roles)) return <Outlet />

  return (
    <div className="data-card rounded-xl p-xl flex flex-col items-center gap-sm text-center">
      <Icon name="lock" size={28} className="text-ink-faint" />
      <h2 className="text-body-lg text-ink">Sin permiso</h2>
      <p className="text-body-sm text-ink-faint">
        Esta sección requiere el rol {roles.join(' o ')}.
      </p>
    </div>
  )
}
