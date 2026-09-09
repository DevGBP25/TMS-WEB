import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { usuariosApi, type Rol, type UsuarioLista } from '@/api/usuarios'
import { ApiError } from '@/api/client'
import Icon from '@/components/Icon'

const MINIMO_CLAVE = 4

interface Props {
  roles: Rol[]
  /** Presente al editar; ausente en el alta. */
  usuario?: UsuarioLista
  onListo: () => void
  onCancelar: () => void
}

export default function FormUsuario({ roles, usuario, onListo, onCancelar }: Props) {
  const editando = usuario !== undefined

  const [codigo, setCodigo] = useState(usuario?.usuario ?? '')
  const [nombre, setNombre] = useState(usuario?.nombre ?? '')
  const [password, setPassword] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [telefono, setTelefono] = useState(usuario?.telefono ?? '')
  const [dpi, setDpi] = useState(usuario?.dpi ?? '')
  const [licencia, setLicencia] = useState(usuario?.licencia ?? '')
  const [tipoLicencia, setTipoLicencia] = useState(usuario?.tipoLicencia ?? '')
  const [licenciaVence, setLicenciaVence] = useState(usuario?.licenciaVence?.slice(0, 10) ?? '')
  const [activo, setActivo] = useState(usuario?.activo ?? true)
  const [seleccion, setSeleccion] = useState<string[]>(usuario?.roles ?? [])
  const [error, setError] = useState<string | null>(null)

  const guardar = useMutation({
    mutationFn: () => {
      const datos = {
        nombre: nombre.trim(),
        telefono: telefono.trim() || undefined,
        dpi: dpi.trim() || undefined,
        licencia: licencia.trim() || undefined,
        tipoLicencia: tipoLicencia.trim() || undefined,
        licenciaVence: licenciaVence || null,
        roles: seleccion,
      }

      return editando
        ? usuariosApi.actualizar(usuario!.idUsuario, { ...datos, activo })
        : usuariosApi.crear({ ...datos, usuario: codigo.trim(), password })
    },
    onSuccess: onListo,
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar el usuario.'),
  })

  const alternarRol = (nombreRol: string) =>
    setSeleccion((prev) =>
      prev.includes(nombreRol) ? prev.filter((r) => r !== nombreRol) : [...prev, nombreRol],
    )

  const claveValida = editando || password.length >= MINIMO_CLAVE
  const valido = codigo.trim() && nombre.trim() && seleccion.length > 0 && claveValida

  // Los campos de licencia sólo aplican a quien conduce.
  const esPiloto = seleccion.includes('PILOTO')

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        <div>
          <label className="block text-label-caps text-ink-faint uppercase mb-xs">Código</label>
          <input
            className="field"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            /* El código identifica la cuenta en la bitácora y en los viajes:
               cambiarlo rompería la trazabilidad. */
            disabled={editando}
            placeholder="jperez"
            required
          />
          {editando && (
            <p className="text-body-sm text-ink-faint mt-xs">El código no se puede cambiar.</p>
          )}
        </div>

        <div>
          <label className="block text-label-caps text-ink-faint uppercase mb-xs">Nombre</label>
          <input
            className="field"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Juan Pérez"
            required
          />
        </div>
      </div>

      {!editando && (
        <div>
          <label className="block text-label-caps text-ink-faint uppercase mb-xs">Contraseña</label>
          <div className="relative">
            <input
              className="field pr-xl"
              type={verClave ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setVerClave((v) => !v)}
              className="absolute right-sm top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition-colors"
              aria-label={verClave ? 'Ocultar' : 'Mostrar'}
              tabIndex={-1}
            >
              <Icon name={verClave ? 'visibility_off' : 'visibility'} size={18} />
            </button>
          </div>
          <p
            className={`text-body-sm mt-xs ${
              password && !claveValida ? 'text-danger' : 'text-ink-faint'
            }`}
          >
            Mínimo {MINIMO_CLAVE} caracteres. El usuario no podrá cambiarla.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        <div>
          <label className="block text-label-caps text-ink-faint uppercase mb-xs">Teléfono</label>
          <input className="field" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </div>
        <div>
          <label className="block text-label-caps text-ink-faint uppercase mb-xs">DPI</label>
          <input className="field" value={dpi} onChange={(e) => setDpi(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="block text-label-caps text-ink-faint uppercase mb-xs">Roles</label>
        <div className="flex flex-wrap gap-xs">
          {roles.map((r) => {
            const activa = seleccion.includes(r.nombre)
            return (
              <button
                key={r.idRol}
                type="button"
                title={r.descripcion ?? undefined}
                onClick={() => alternarRol(r.nombre)}
                className={`px-sm py-xs rounded-lg border text-label-caps uppercase transition-colors ${
                  activa
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-field-border text-ink-faint hover:border-ink-faint'
                }`}
              >
                {r.nombre}
              </button>
            )
          })}
        </div>
        {seleccion.length === 0 && (
          <p className="text-body-sm text-danger mt-xs">Seleccione al menos un rol.</p>
        )}
      </div>

      {esPiloto && (
        <div className="border-t border-white/5 pt-md">
          <p className="text-label-caps text-accent uppercase mb-sm">Datos de licencia</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
            <div>
              <label className="block text-label-caps text-ink-faint uppercase mb-xs">Número</label>
              <input
                className="field"
                value={licencia}
                onChange={(e) => setLicencia(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-label-caps text-ink-faint uppercase mb-xs">Tipo</label>
              <input
                className="field"
                maxLength={5}
                value={tipoLicencia}
                onChange={(e) => setTipoLicencia(e.target.value)}
                placeholder="A"
              />
            </div>
            <div>
              <label className="block text-label-caps text-ink-faint uppercase mb-xs">Vence</label>
              <input
                type="date"
                className="field"
                value={licenciaVence}
                onChange={(e) => setLicenciaVence(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {editando && (
        <label className="flex items-center gap-sm cursor-pointer border-t border-white/5 pt-md">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="accent-[var(--color-accent)] w-4 h-4"
          />
          <span className="text-body-sm text-ink">
            Cuenta activa
            {usuario!.intentosFallidos > 0 && (
              <span className="text-ink-faint">
                {' '}
                · al activarla se reinician los {usuario!.intentosFallidos} intentos fallidos
              </span>
            )}
          </span>
        </label>
      )}

      <div className="flex justify-end gap-sm border-t border-white/5 pt-md">
        <button type="button" className="btn-ghost" onClick={onCancelar} disabled={guardar.isPending}>
          Cancelar
        </button>
        <button type="submit" className="btn-accent" disabled={!valido || guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear usuario'}
        </button>
      </div>
    </form>
  )
}
