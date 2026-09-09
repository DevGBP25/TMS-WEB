import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { ApiError } from '@/api/client'
import Icon from '@/components/Icon'
import Bombilla from '@/components/Bombilla'
import FondoLuces from '@/components/FondoLuces'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [destello, setDestello] = useState(false)

  // A dónde iba antes de que lo mandaran al login.
  const destino = (location.state as { desde?: string } | null)?.desde ?? '/'

  /* La luz sube con el formulario: medio campo enciende a la mitad, los dos
     completos la encienden del todo. Es la señal de "listo para entrar". */
  const intensidad = (usuario.trim() ? 0.5 : 0) + (password ? 0.5 : 0)
  const listo = intensidad === 1

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      await login(usuario.trim(), password)

      // Destello antes de navegar: da cierre a la metáfora del encendido.
      setDestello(true)
      await new Promise((r) => setTimeout(r, 380))

      navigate(destino, { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo conectar con el servidor. Verifique su red.',
      )
      setPassword('')
      setEnviando(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-md overflow-hidden">
      <FondoLuces />

      {destello && (
        <div
          className="destello fixed inset-0 z-50 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 50% 38%, rgb(255 220 198 / 0.55), transparent 55%)',
          }}
          aria-hidden="true"
        />
      )}

      <div className="relative w-full max-w-[380px]">
        <div className="flex flex-col items-center mb-lg">
          <Bombilla intensidad={intensidad} />

          <h1 className="text-headline-lg text-accent-soft mt-md">GBP · TMS</h1>
          <p className="text-label-caps text-ink-faint uppercase mt-xs">Gestión de transporte</p>
        </div>

        <form
          onSubmit={enviar}
          /* El borde se enciende cuando el formulario está completo: refuerza
             el mismo lenguaje de la bombilla. */
          className="data-card rounded-xl p-lg flex flex-col gap-md transition-all duration-500"
          style={{
            borderColor: listo ? 'rgb(209 106 2 / 0.45)' : undefined,
            boxShadow: listo ? '0 0 40px rgb(209 106 2 / 0.14)' : undefined,
          }}
        >
          <h2 className="text-body-lg text-ink">Iniciar sesión</h2>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-sm rounded-xl border border-danger/20 bg-danger/10 p-sm text-body-sm text-danger"
            >
              <Icon name="error" size={18} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="usuario" className="block text-label-caps text-ink-faint uppercase mb-xs">
              Usuario
            </label>
            <input
              id="usuario"
              className="field"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              disabled={enviando}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-label-caps text-ink-faint uppercase mb-xs">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                className="field pr-xl"
                type={verClave ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={enviando}
              />
              <button
                type="button"
                onClick={() => setVerClave((v) => !v)}
                className="absolute right-sm top-1/2 -translate-y-1/2 text-ink-faint hover:text-accent-soft transition-colors"
                aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                tabIndex={-1}
              >
                <Icon name={verClave ? 'visibility_off' : 'visibility'} size={18} />
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-accent w-full mt-sm"
            disabled={enviando || !listo}
          >
            {enviando ? (
              <>
                <Icon name="progress_activity" size={18} className="animate-spin" />
                Verificando…
              </>
            ) : (
              <>
                <Icon name="power_settings_new" size={18} />
                Encender sesión
              </>
            )}
          </button>

          <p className="text-body-sm text-ink-faint text-center border-t border-white/5 pt-md">
            ¿Olvidó su contraseña? Solicítela al administrador del sistema.
          </p>
        </form>

        <p className="text-center text-[10px] tracking-wider text-ink-faint uppercase mt-lg opacity-60">
          Iluminación y distribución · Guatemala
        </p>
      </div>
    </div>
  )
}
