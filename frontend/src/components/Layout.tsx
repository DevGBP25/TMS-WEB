import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import Icon from './Icon'

interface Enlace {
  to: string
  label: string
  icon: string
  end?: boolean
  /** Si se indica, el enlace sólo aparece para quien tenga alguno de estos roles. */
  roles?: string[]
}

const enlaces: Enlace[] = [
  { to: '/', label: 'Tablero', icon: 'dashboard', end: true },
  { to: '/viajes', label: 'Viajes', icon: 'route' },
  { to: '/planificar', label: 'Planificar', icon: 'edit_calendar' },
  { to: '/unidades', label: 'Unidades', icon: 'local_shipping' },
  { to: '/usuarios', label: 'Usuarios', icon: 'group', roles: ['ADMIN'] },
]

const enlaceBase =
  'flex items-center gap-md px-md py-sm rounded-xl text-label-caps uppercase transition-all duration-200'

function claseEnlace({ isActive }: { isActive: boolean }) {
  return isActive
    ? `${enlaceBase} bg-accent text-on-accent`
    : `${enlaceBase} text-ink-muted hover:bg-elevated/50 hover:text-ink`
}

/** Contenido de la barra lateral, compartido por el rail fijo y el cajón móvil. */
function Navegacion({ onNavegar }: { onNavegar?: () => void }) {
  const { usuario, salir, tieneRol } = useAuth()

  const visibles = enlaces.filter((e) => !e.roles || tieneRol(...e.roles))

  return (
    <>
      <div className="px-lg mb-xl flex items-center gap-md">
        <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center">
          <Icon name="local_shipping" size={18} className="text-accent-soft" />
        </div>
        <div>
          <h1 className="text-headline-md text-accent-soft tracking-tight">GBP · TMS</h1>
          {/* 10px para que quepa en una línea con el rail a 232px. */}
          <p className="text-[10px] tracking-wider text-ink-faint uppercase opacity-70 whitespace-nowrap">
            Gestión de transporte
          </p>
        </div>
      </div>

      <div className="px-md mb-lg">
        <NavLink to="/planificar" onClick={onNavegar} className="btn-accent w-full">
          <Icon name="add" size={18} />
          Planificar viaje
        </NavLink>
      </div>

      <div className="flex-1 px-md flex flex-col gap-xs overflow-y-auto">
        {visibles.map((e) => (
          <NavLink key={e.to} to={e.to} end={e.end} onClick={onNavegar} className={claseEnlace}>
            {({ isActive }) => (
              <>
                <Icon name={e.icon} fill={isActive} />
                {e.label}
              </>
            )}
          </NavLink>
        ))}
      </div>

      <div className="px-md mt-auto flex flex-col gap-xs pt-lg border-t border-white/5">
        <a
          href="/swagger"
          target="_blank"
          rel="noreferrer"
          className={`${enlaceBase} text-ink-muted hover:bg-elevated/50 hover:text-ink`}
        >
          <Icon name="api" />
          API
        </a>
        <div className="px-md py-sm flex items-center gap-sm min-w-0">
          <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-semibold text-accent-soft">
              {(usuario?.nombre ?? '?').slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-body-sm text-ink truncate">{usuario?.nombre}</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-faint truncate">
              {usuario?.roles.join(' · ')}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => { onNavegar?.(); void salir() }}
          className={`${enlaceBase} w-full text-ink-muted hover:bg-elevated/50 hover:text-ink`}
        >
          <Icon name="logout" />
          Salir
        </button>
      </div>
    </>
  )
}

/** Avatar con las iniciales del usuario autenticado. */
function Iniciales() {
  const { usuario } = useAuth()
  return (
    <div
      title={usuario?.nombre}
      className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center"
    >
      <span className="text-[10px] font-semibold text-accent-soft">
        {(usuario?.nombre ?? '?').slice(0, 2).toUpperCase()}
      </span>
    </div>
  )
}

export default function Layout() {
  const [cajonAbierto, setCajonAbierto] = useState(false)
  const { pathname } = useLocation()

  // El cajón se cierra al cambiar de ruta y con Escape.
  useEffect(() => setCajonAbierto(false), [pathname])

  useEffect(() => {
    if (!cajonAbierto) return
    const cerrar = (e: KeyboardEvent) => e.key === 'Escape' && setCajonAbierto(false)
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [cajonAbierto])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Rail fijo — escritorio */}
      <nav className="hidden lg:flex flex-col h-screen w-rail shrink-0 py-lg bg-rail border-r border-white/5 z-40">
        <Navegacion />
      </nav>

      {/* Cajón — móvil y tableta */}
      {cajonAbierto && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setCajonAbierto(false)}
          />
          <nav className="relative flex flex-col h-full w-rail max-w-[85vw] py-lg bg-rail border-r border-white/5 shadow-2xl">
            <Navegacion onNavegar={() => setCajonAbierto(false)} />
          </nav>
        </div>
      )}

      {/* Área principal: cabecera fija y lienzo con scroll propio */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <header className="shrink-0 h-xxl px-md md:px-lg flex items-center gap-md bg-rail/80 backdrop-blur-xl border-b border-white/5 z-30">
          <button
            onClick={() => setCajonAbierto(true)}
            className="lg:hidden text-ink-muted hover:text-accent-soft transition-colors"
            aria-label="Abrir menú"
          >
            <Icon name="menu" size={20} />
          </button>

          {/* Valor explícito: max-w-md daría 16px por la escala de espaciado. */}
          <div className="flex-1 max-w-[28rem] min-w-0">
            <div className="input-glow flex items-center gap-sm rounded-xl bg-field border border-field-border px-md py-[5px] transition-all">
              <Icon name="search" size={18} className="text-ink-faint" />
              <input
                className="w-full bg-transparent border-none p-0 text-body-sm text-ink placeholder:text-ink-faint focus:outline-none"
                placeholder="Buscar viaje, placa o piloto…"
                type="text"
              />
            </div>
          </div>

          <div className="flex items-center gap-md">
            <button className="relative text-ink-muted hover:text-accent-soft transition-colors active:scale-95">
              <Icon name="notifications" size={20} />
              <span className="absolute top-0 right-0 w-2 h-2 bg-accent rounded-full animate-pulse" />
            </button>
            <div className="h-6 w-px bg-white/10 hidden sm:block" />
            <Iniciales />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-app mx-auto p-md md:p-lg lg:p-xl flex flex-col gap-lg">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}
