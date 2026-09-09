import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { usuariosApi } from '@/api/usuarios'
import { ApiError } from '@/api/client'
import Icon from '@/components/Icon'

const MINIMO = 4

interface Props {
  idUsuario: number
  onListo: () => void
  onCancelar: () => void
}

export default function FormPassword({ idUsuario, onListo, onCancelar }: Props) {
  const [password, setPassword] = useState('')
  const [confirma, setConfirma] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guardar = useMutation({
    mutationFn: () => usuariosApi.restablecerPassword(idUsuario, password),
    onSuccess: onListo,
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'No se pudo definir la contraseña.'),
  })

  const suficiente = password.length >= MINIMO
  const coinciden = password === confirma
  const valido = suficiente && coinciden

  function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    guardar.mutate()
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-md">
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
        <label className="block text-label-caps text-ink-faint uppercase mb-xs">
          Contraseña nueva
        </label>
        <div className="relative">
          <input
            className="field pr-xl"
            type={ver ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
            required
          />
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            className="absolute right-sm top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition-colors"
            aria-label={ver ? 'Ocultar' : 'Mostrar'}
            tabIndex={-1}
          >
            <Icon name={ver ? 'visibility_off' : 'visibility'} size={18} />
          </button>
        </div>
        <p
          className={`text-body-sm mt-xs ${
            password && !suficiente ? 'text-danger' : 'text-ink-faint'
          }`}
        >
          Mínimo {MINIMO} caracteres.
        </p>
      </div>

      <div>
        <label className="block text-label-caps text-ink-faint uppercase mb-xs">Repetir</label>
        <input
          className="field"
          type={ver ? 'text' : 'password'}
          value={confirma}
          onChange={(e) => setConfirma(e.target.value)}
          autoComplete="new-password"
          required
        />
        {confirma && !coinciden && (
          <p className="text-body-sm text-danger mt-xs">Las contraseñas no coinciden.</p>
        )}
      </div>

      <p className="text-body-sm text-ink-faint">
        También se reinician los intentos fallidos, por si la cuenta estaba bloqueada.
      </p>

      <div className="flex justify-end gap-sm border-t border-white/5 pt-md">
        <button type="button" className="btn-ghost" onClick={onCancelar} disabled={guardar.isPending}>
          Cancelar
        </button>
        <button type="submit" className="btn-accent" disabled={!valido || guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Definir contraseña'}
        </button>
      </div>
    </form>
  )
}
