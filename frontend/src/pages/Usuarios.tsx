import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usuariosApi, type UsuarioLista } from '@/api/usuarios'
import { fmtFecha, fmtHora } from '@/utils/fechas'
import Icon from '@/components/Icon'
import PageHeader from '@/components/PageHeader'
import Confirmar from '@/components/Confirmar'
import Modal from '@/components/Modal'
import FormUsuario from '@/components/FormUsuario'
import FormPassword from '@/components/FormPassword'

const th = 'py-sm px-md text-label-caps text-ink-faint uppercase font-normal whitespace-nowrap'

export default function Usuarios() {
  const qc = useQueryClient()
  const [buscar, setBuscar] = useState('')
  const [soloActivos, setSoloActivos] = useState(false)

  // Qué panel está abierto y sobre qué usuario.
  const [alta, setAlta] = useState(false)
  const [editando, setEditando] = useState<UsuarioLista | null>(null)
  const [cambiandoClave, setCambiandoClave] = useState<UsuarioLista | null>(null)

  const usuarios = useQuery({
    queryKey: ['usuarios', buscar, soloActivos],
    queryFn: () => usuariosApi.listar(buscar || undefined, soloActivos),
  })

  const roles = useQuery({ queryKey: ['roles'], queryFn: () => usuariosApi.roles() })

  const refrescar = () => qc.invalidateQueries({ queryKey: ['usuarios'] })

  /* Usuario cuyo acceso se está por activar o desactivar, mientras se
     pregunta. Desactivar deja a alguien fuera del sistema; no es un clic
     que deba resolverse solo. */
  const [alternando, setAlternando] = useState<UsuarioLista | null>(null)

  const alternarEstado = useMutation({
    mutationFn: (u: UsuarioLista) =>
      usuariosApi.actualizar(u.idUsuario, {
        nombre: u.nombre,
        telefono: u.telefono,
        dpi: u.dpi,
        licencia: u.licencia,
        tipoLicencia: u.tipoLicencia,
        licenciaVence: u.licenciaVence ?? null,
        activo: !u.activo,
        roles: u.roles,
      }),
    onSuccess: refrescar,
  })

  const error = (usuarios.error ?? alternarEstado.error) as Error | null
  const lista = usuarios.data ?? []

  return (
    <>
      <PageHeader titulo="Usuarios" subtitulo="Cuentas de acceso a la web y a la app móvil.">
        <div className="relative flex-1 min-w-0 md:max-w-[280px]">
          <Icon
            name="search"
            size={18}
            className="absolute left-sm top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
          />
          <input
            className="field pl-xl"
            placeholder="Código o nombre…"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        <button className="btn-accent" onClick={() => setAlta(true)}>
          <Icon name="person_add" size={18} />
          <span className="hidden md:inline">Nuevo usuario</span>
        </button>
      </PageHeader>

      {error && (
        <div className="data-card rounded-xl p-md flex items-center gap-sm text-danger">
          <Icon name="error" />
          {error.message}
        </div>
      )}

      <div className="data-card rounded-xl overflow-hidden flex flex-col">
        <div className="flex items-center gap-md p-md border-b border-white/5 bg-field/30">
          <label className="flex items-center gap-xs text-label-caps text-ink-muted uppercase cursor-pointer">
            <input
              type="checkbox"
              checked={soloActivos}
              onChange={(e) => setSoloActivos(e.target.checked)}
              className="accent-[var(--color-accent)] w-4 h-4"
            />
            Sólo activos
          </label>
          <span className="ml-auto text-mono-data text-ink-faint tabular">
            {lista.length} usuario(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5">
                <th className={th}>Usuario</th>
                <th className={th}>Nombre</th>
                <th className={`${th} hidden lg:table-cell`}>Roles</th>
                <th className={`${th} hidden xl:table-cell`}>Licencia</th>
                <th className={th}>Estado</th>
                <th className={`${th} hidden md:table-cell`}>Último acceso</th>
                <th className={`${th} text-right`}>Acciones</th>
              </tr>
            </thead>

            <tbody className="text-body-sm divide-y divide-white/5">
              {usuarios.isLoading && (
                <tr>
                  <td colSpan={7} className="py-xl text-center text-ink-faint">
                    Cargando…
                  </td>
                </tr>
              )}

              {!usuarios.isLoading && lista.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-xl text-center text-ink-faint">
                    No hay usuarios que coincidan.
                  </td>
                </tr>
              )}

              {lista.map((u) => (
                <tr key={u.idUsuario} className="hover:bg-field transition-colors">
                  <td className="py-md px-md font-medium text-ink whitespace-nowrap">{u.usuario}</td>
                  <td className="py-md px-md text-ink-muted">{u.nombre}</td>

                  <td className="py-md px-md hidden lg:table-cell">
                    <div className="flex flex-wrap gap-xs">
                      {u.roles.map((r) => (
                        <span key={r} className="chip chip-info">
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>

                  <td className="py-md px-md text-ink-muted hidden xl:table-cell whitespace-nowrap">
                    {u.licencia ? `${u.licencia} · ${fmtFecha(u.licenciaVence)}` : '—'}
                  </td>

                  <td className="py-md px-md">
                    {u.activo ? (
                      <span className="chip chip-ok">Activo</span>
                    ) : (
                      <span className="chip chip-danger">Inactivo</span>
                    )}
                    {/* Un contador alto sin llegar al tope avisa de intentos recientes. */}
                    {u.intentosFallidos > 0 && (
                      <span className="ml-xs text-mono-data text-danger" title="Intentos fallidos">
                        {u.intentosFallidos}
                      </span>
                    )}
                  </td>

                  <td className="py-md px-md text-ink-muted hidden md:table-cell whitespace-nowrap">
                    {fmtHora(u.ultimoAcceso)}
                  </td>

                  <td className="py-md px-md">
                    <div className="flex items-center justify-end gap-xs">
                      <button
                        onClick={() => setEditando(u)}
                        title="Editar"
                        className="p-xs rounded-lg text-ink-faint hover:text-accent-soft hover:bg-elevated/50 transition-colors"
                      >
                        <Icon name="edit" size={18} />
                      </button>
                      <button
                        onClick={() => setCambiandoClave(u)}
                        title="Definir contraseña"
                        className="p-xs rounded-lg text-ink-faint hover:text-accent-soft hover:bg-elevated/50 transition-colors"
                      >
                        <Icon name="key" size={18} />
                      </button>
                      <button
                        onClick={() => setAlternando(u)}
                        disabled={alternarEstado.isPending}
                        title={u.activo ? 'Desactivar' : 'Activar'}
                        className="p-xs rounded-lg text-ink-faint hover:text-accent-soft hover:bg-elevated/50 transition-colors disabled:opacity-40"
                      >
                        <Icon name={u.activo ? 'toggle_on' : 'toggle_off'} size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {alta && (
        <Modal
          titulo="Nuevo usuario"
          subtitulo="La contraseña la define usted; el usuario no la cambia."
          onCerrar={() => setAlta(false)}
        >
          <FormUsuario
            roles={roles.data ?? []}
            onListo={() => {
              setAlta(false)
              refrescar()
            }}
            onCancelar={() => setAlta(false)}
          />
        </Modal>
      )}

      {editando && (
        <Modal
          titulo={`Editar ${editando.usuario}`}
          onCerrar={() => setEditando(null)}
        >
          <FormUsuario
            roles={roles.data ?? []}
            usuario={editando}
            onListo={() => {
              setEditando(null)
              refrescar()
            }}
            onCancelar={() => setEditando(null)}
          />
        </Modal>
      )}

      {cambiandoClave && (
        <Modal
          titulo="Definir contraseña"
          subtitulo={`${cambiandoClave.nombre} · ${cambiandoClave.usuario}`}
          onCerrar={() => setCambiandoClave(null)}
          ancho="max-w-[420px]"
        >
          <FormPassword
            idUsuario={cambiandoClave.idUsuario}
            onListo={() => {
              setCambiandoClave(null)
              refrescar()
            }}
            onCancelar={() => setCambiandoClave(null)}
          />
        </Modal>
      )}

      {alternando && (
        <Confirmar
          titulo={alternando.activo ? 'Desactivar usuario' : 'Activar usuario'}
          tono={alternando.activo ? 'danger' : 'accent'}
          textoAceptar={alternando.activo ? 'Sí, desactivar' : 'Sí, activar'}
          mensaje={
            alternando.activo
              ? `${alternando.nombre} dejará de poder entrar al sistema.`
              : `${alternando.nombre} podrá volver a entrar al sistema.`
          }
          detalle={`Usuario ${alternando.usuario}`}
          cargando={alternarEstado.isPending}
          onConfirmar={() => { const u = alternando; setAlternando(null); alternarEstado.mutate(u) }}
          onCancelar={() => setAlternando(null)}
        />
      )}
    </>
  )
}
