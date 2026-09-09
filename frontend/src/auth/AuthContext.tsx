import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { alCaducarSesion, definirToken } from '@/api/client'
import { authApi, type UsuarioAutenticado } from '@/api/auth'

const CLAVE_TOKEN = 'tms.token'
const CLAVE_EXPIRA = 'tms.expira'

interface Sesion {
  token: string
  expira: string
  usuario: UsuarioAutenticado
}

interface AuthContextValue {
  usuario: UsuarioAutenticado | null
  autenticado: boolean
  /** true mientras se restaura la sesión guardada al cargar la página. */
  cargando: boolean
  login: (usuario: string, password: string) => Promise<UsuarioAutenticado>
  salir: () => Promise<void>
  /** Refresca los datos del usuario tras cambiar la contraseña. */
  refrescar: () => Promise<void>
  tieneRol: (...roles: string[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

/* localStorage: la sesión sobrevive al recargar y a abrir otra pestaña.
   Contrapartida: es legible por JavaScript, así que un XSS puede robar el
   token. Se acepta porque es una app interna y el token dura una hora. */
function leerToken(): { token: string; expira: string } | null {
  try {
    const token = localStorage.getItem(CLAVE_TOKEN)
    const expira = localStorage.getItem(CLAVE_EXPIRA)
    if (!token || !expira) return null

    // Un token ya vencido no sirve: se descarta sin llamar a la API.
    if (new Date(expira).getTime() <= Date.now()) return null

    return { token, expira }
  } catch {
    return null // modo privado o almacenamiento bloqueado
  }
}

function guardarToken(s: Sesion | null) {
  try {
    if (s) {
      localStorage.setItem(CLAVE_TOKEN, s.token)
      localStorage.setItem(CLAVE_EXPIRA, s.expira)
    } else {
      localStorage.removeItem(CLAVE_TOKEN)
      localStorage.removeItem(CLAVE_EXPIRA)
    }
  } catch {
    // sin almacenamiento la sesión sólo dura lo que la pestaña
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(null)
  const [cargando, setCargando] = useState(true)

  const limpiar = useCallback(() => {
    definirToken(null)
    guardarToken(null)
    setUsuario(null)
  }, [])

  // Al arrancar: si hay token vigente, se confirma contra la API.
  useEffect(() => {
    const guardado = leerToken()

    if (!guardado) {
      setCargando(false)
      return
    }

    definirToken(guardado.token)

    authApi
      .yo()
      .then(setUsuario)
      .catch(limpiar) // token inválido del lado del servidor
      .finally(() => setCargando(false))
  }, [limpiar])

  // Cualquier 401 con token presente cierra la sesión.
  useEffect(() => {
    alCaducarSesion(limpiar)
  }, [limpiar])

  const login = useCallback(async (nombreUsuario: string, password: string) => {
    const r = await authApi.login(nombreUsuario, password)
    definirToken(r.token)
    guardarToken({ token: r.token, expira: r.expira, usuario: r.usuario })
    setUsuario(r.usuario)
    return r.usuario
  }, [])

  const salir = useCallback(async () => {
    try {
      await authApi.salir() // deja constancia en la bitácora
    } catch {
      // si falla, igual se cierra del lado del cliente
    }
    limpiar()
  }, [limpiar])

  const refrescar = useCallback(async () => {
    setUsuario(await authApi.yo())
  }, [])

  const tieneRol = useCallback(
    (...roles: string[]) => roles.some((r) => usuario?.roles.includes(r) ?? false),
    [usuario],
  )

  const valor = useMemo<AuthContextValue>(
    () => ({
      usuario,
      autenticado: usuario !== null,
      cargando,
      login,
      salir,
      refrescar,
      tieneRol,
    }),
    [usuario, cargando, login, salir, refrescar, tieneRol],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>.')
  return ctx
}
