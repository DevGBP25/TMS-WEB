import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ETIQUETA_ESTADO,
  unidadesApi,
  type EstadoUnidad,
  type Unidad,
} from '@/api/unidades'
import { useAuth } from '@/auth/AuthContext'
import { fmtHora, fmtNum } from '@/utils/fechas'
import Icon from '@/components/Icon'
import PageHeader from '@/components/PageHeader'
import Modal from '@/components/Modal'
import FormUnidad from '@/components/FormUnidad'

const th = 'py-sm px-md text-label-caps text-ink-faint uppercase font-normal whitespace-nowrap'

const FILTROS: (EstadoUnidad | 'TODOS')[] = [
  'TODOS',
  'DISPONIBLE',
  'EN_RUTA',
  'MANTENIMIENTO',
  'FUERA_SERVICIO',
]

/** Cada estado tiene un tono fijo, igual que en el resto del sistema. */
const TONO: Record<EstadoUnidad, string> = {
  DISPONIBLE: 'chip-ok',
  EN_RUTA: 'chip-warn',
  MANTENIMIENTO: 'chip-info',
  FUERA_SERVICIO: 'chip-danger',
}

export default function Unidades() {
  const qc = useQueryClient()
  const { tieneRol } = useAuth()
  const puedeEditar = tieneRol('ADMIN', 'DESPACHO')

  const [buscar, setBuscar] = useState('')
  const [filtro, setFiltro] = useState<EstadoUnidad | 'TODOS'>('TODOS')
  const [soloActivas, setSoloActivas] = useState(true)
  const [alta, setAlta] = useState(false)
  const [editando, setEditando] = useState<Unidad | null>(null)

  const unidades = useQuery({
    queryKey: ['unidades', buscar, filtro, soloActivas],
    queryFn: () =>
      unidadesApi.listar(buscar || undefined, filtro === 'TODOS' ? undefined : filtro, soloActivas),
  })

  const refrescar = () => qc.invalidateQueries({ queryKey: ['unidades'] })

  const lista = unidades.data ?? []

  // Resumen por estado, para ver la flota de un vistazo.
  const resumen = lista.reduce<Record<string, number>>((acc, u) => {
    acc[u.estado] = (acc[u.estado] ?? 0) + 1
    return acc
  }, {})

  const capacidadTotal = lista
    .filter((u) => u.estado === 'DISPONIBLE')
    .reduce((s, u) => s + u.capacidadKg, 0)

  return (
    <>
      <PageHeader titulo="Unidades" subtitulo="Flota disponible para el reparto.">
        <div className="relative flex-1 min-w-0 md:max-w-[280px]">
          <Icon
            name="search"
            size={18}
            className="absolute left-sm top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
          />
          <input
            className="field pl-xl"
            placeholder="Código, placa, marca…"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        {puedeEditar && (
          <button className="btn-accent" onClick={() => setAlta(true)}>
            <Icon name="add" size={18} />
            <span className="hidden md:inline">Nueva unidad</span>
          </button>
        )}
      </PageHeader>

      {unidades.error && (
        <div className="data-card rounded-xl p-md flex items-center gap-sm text-danger">
          <Icon name="error" />
          {(unidades.error as Error).message}
        </div>
      )}

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-md">
        {(['DISPONIBLE', 'EN_RUTA', 'MANTENIMIENTO'] as EstadoUnidad[]).map((s) => (
          <div key={s} className="data-card rounded-xl p-md">
            <div className="text-label-caps text-ink-faint uppercase mb-xs">
              {ETIQUETA_ESTADO[s]}
            </div>
            <div className="text-headline-lg text-ink tabular">{resumen[s] ?? 0}</div>
          </div>
        ))}
        <div className="data-card rounded-xl p-md">
          <div className="text-label-caps text-ink-faint uppercase mb-xs">Capacidad libre</div>
          <div className="text-headline-lg text-accent-soft tabular">
            {fmtNum(capacidadTotal, 0)}
            <span className="text-body-sm text-ink-faint ml-xs">kg</span>
          </div>
        </div>
      </div>

      <div className="data-card rounded-xl overflow-hidden flex flex-col">
        <div className="flex flex-wrap items-center gap-md p-md border-b border-white/5 bg-field/30">
          <div className="flex flex-wrap gap-xs">
            {FILTROS.map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-sm py-xs rounded-lg border text-label-caps uppercase transition-colors ${
                  filtro === f
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-field-border text-ink-faint hover:border-ink-faint'
                }`}
              >
                {f === 'TODOS' ? 'Todas' : ETIQUETA_ESTADO[f]}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-xs text-label-caps text-ink-muted uppercase cursor-pointer">
            <input
              type="checkbox"
              checked={soloActivas}
              onChange={(e) => setSoloActivas(e.target.checked)}
              className="accent-[var(--color-accent)] w-4 h-4"
            />
            En circulación
          </label>

          <span className="ml-auto text-mono-data text-ink-faint tabular">
            {lista.length} unidad(es)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5">
                <th className={th}>Código</th>
                <th className={th}>Placa</th>
                <th className={`${th} hidden md:table-cell`}>Vehículo</th>
                <th className={`${th} hidden xl:table-cell`}>Transportista</th>
                <th className={`${th} text-right`}>Cap. kg</th>
                <th className={`${th} text-right hidden lg:table-cell`}>Odómetro</th>
                <th className={th}>Estado</th>
                <th className={`${th} hidden lg:table-cell`}>Turno</th>
                {puedeEditar && <th className={`${th} text-right`}>Acciones</th>}
              </tr>
            </thead>

            <tbody className="text-body-sm divide-y divide-white/5">
              {unidades.isLoading && (
                <tr>
                  <td colSpan={9} className="py-xl text-center text-ink-faint">
                    Cargando…
                  </td>
                </tr>
              )}

              {!unidades.isLoading && lista.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-xl text-center">
                    <Icon name="local_shipping" size={26} className="text-ink-faint mb-sm" />
                    <p className="text-ink-faint">No hay unidades que coincidan.</p>
                    {puedeEditar && (
                      <button className="btn-accent mt-md inline-flex" onClick={() => setAlta(true)}>
                        <Icon name="add" size={18} />
                        Registrar la primera
                      </button>
                    )}
                  </td>
                </tr>
              )}

              {lista.map((u) => (
                <tr key={u.idUnidad} className="hover:bg-field transition-colors">
                  <td className="py-md px-md font-medium text-ink whitespace-nowrap">{u.codigo}</td>
                  <td className="py-md px-md text-ink-muted whitespace-nowrap">{u.placa ?? '—'}</td>

                  <td className="py-md px-md text-ink-muted hidden md:table-cell">
                    {[u.marca, u.modelo].filter(Boolean).join(' ') || '—'}
                    {u.anio && <span className="text-ink-faint"> · {u.anio}</span>}
                    {u.tipo && (
                      <div className="text-label-caps text-ink-faint uppercase mt-xs">{u.tipo}</div>
                    )}
                  </td>

                  <td className="py-md px-md text-ink-muted hidden xl:table-cell">
                    {u.transportista ?? 'Propia'}
                  </td>

                  <td className="py-md px-md text-mono-data text-right tabular">
                    {fmtNum(u.capacidadKg, 0)}
                  </td>

                  <td className="py-md px-md text-mono-data text-right tabular text-ink-muted hidden lg:table-cell">
                    {fmtNum(u.odometroKm, 0)}
                  </td>

                  <td className="py-md px-md">
                    <span className={`chip ${TONO[u.estado]}`}>{ETIQUETA_ESTADO[u.estado]}</span>
                    {!u.activo && <span className="chip chip-danger ml-xs">De baja</span>}
                  </td>

                  <td className="py-md px-md hidden lg:table-cell">
                    {u.pilotoActual ? (
                      <div>
                        <div className="text-ink">{u.pilotoActual}</div>
                        <div className="text-label-caps text-ink-faint uppercase mt-xs">
                          desde {fmtHora(u.turnoDesde)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>

                  {puedeEditar && (
                    <td className="py-md px-md text-right">
                      <button
                        onClick={() => setEditando(u)}
                        title="Editar"
                        className="p-xs rounded-lg text-ink-faint hover:text-accent-soft hover:bg-elevated/50 transition-colors"
                      >
                        <Icon name="edit" size={18} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {alta && (
        <Modal
          titulo="Nueva unidad"
          subtitulo="Camión, panel, remolque o cualquier vehículo de reparto."
          onCerrar={() => setAlta(false)}
          ancho="max-w-[640px]"
        >
          <FormUnidad
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
          titulo={`Editar ${editando.codigo}`}
          subtitulo={editando.placa ?? undefined}
          onCerrar={() => setEditando(null)}
          ancho="max-w-[640px]"
        >
          <FormUnidad
            unidad={editando}
            onListo={() => {
              setEditando(null)
              refrescar()
            }}
            onCancelar={() => setEditando(null)}
          />
        </Modal>
      )}
    </>
  )
}
