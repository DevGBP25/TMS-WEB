import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { viajesApi } from '@/api/viajes'
import { fmtFecha, fmtNum, hoy } from '@/utils/fechas'
import type { EstadoViaje, ViajeFiltro } from '@/types/tms'
import Icon from '@/components/Icon'
import Chip from '@/components/Chip'
import PageHeader from '@/components/PageHeader'

const thBase =
  'py-sm px-md text-label-caps text-ink-faint uppercase font-normal whitespace-nowrap'

const estados: EstadoViaje[] = [
  'Planificado',
  'Asignado',
  'EnRuta',
  'Entregado',
  'Liquidado',
  'Cancelado',
]

export default function Viajes() {
  const [filtro, setFiltro] = useState<ViajeFiltro>({
    desde: hoy(),
    hasta: hoy(),
    pagina: 1,
    porPagina: 50,
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['viajes', filtro],
    queryFn: () => viajesApi.listar(filtro),
  })

  // Cualquier cambio de filtro vuelve a la primera página.
  const set = (cambio: Partial<ViajeFiltro>) => setFiltro((f) => ({ ...f, ...cambio, pagina: 1 }))

  const limpiar = () =>
    setFiltro({ desde: hoy(), hasta: hoy(), pagina: 1, porPagina: filtro.porPagina })

  return (
    <>
      <PageHeader titulo="Viajes" subtitulo="Despachos planificados y su avance en ruta.">
        <div className="relative flex-1 min-w-0 md:max-w-[320px]">
          <Icon
            name="search"
            size={20}
            className="absolute left-sm top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
          />
          <input
            className="field pl-xl"
            placeholder="Número, placa o piloto…"
            value={filtro.buscar ?? ''}
            onChange={(e) => set({ buscar: e.target.value })}
          />
        </div>
        <Link to="/planificar" className="btn-accent">
          <Icon name="add" size={18} />
          <span className="hidden md:inline">Planificar</span>
        </Link>
      </PageHeader>

      {error && (
        <div className="data-card rounded-xl p-md flex items-center gap-sm text-danger">
          <Icon name="error" />
          {(error as Error).message}
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-lg flex-1">
        {/* Filtros */}
        <aside className="w-full xl:w-[260px] shrink-0 data-card rounded-xl p-md flex flex-col gap-md h-fit">
          <div className="flex justify-between items-center border-b border-white/5 pb-sm">
            <h3 className="text-label-caps text-accent uppercase">Filtros</h3>
            <button
              onClick={limpiar}
              className="text-label-caps text-ink-faint hover:text-ink uppercase transition-colors"
            >
              Limpiar
            </button>
          </div>

          <div>
            <label className="block text-label-caps text-ink-faint uppercase mb-xs">Desde</label>
            <input
              type="date"
              className="field"
              value={filtro.desde ?? ''}
              onChange={(e) => set({ desde: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-label-caps text-ink-faint uppercase mb-xs">Hasta</label>
            <input
              type="date"
              className="field"
              value={filtro.hasta ?? ''}
              onChange={(e) => set({ hasta: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-label-caps text-ink-faint uppercase mb-xs">Estado</label>
            <div className="flex flex-wrap gap-xs">
              <button
                onClick={() => set({ estado: undefined })}
                className={`px-sm py-xs rounded-lg border text-label-caps uppercase transition-colors ${
                  !filtro.estado
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-field-border text-ink-faint hover:border-ink-faint'
                }`}
              >
                Todos
              </button>
              {estados.map((s) => (
                <button
                  key={s}
                  onClick={() => set({ estado: s })}
                  className={`px-sm py-xs rounded-lg border text-label-caps uppercase transition-colors ${
                    filtro.estado === s
                      ? 'border-accent text-accent bg-accent/10'
                      : 'border-field-border text-ink-faint hover:border-ink-faint'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Tabla */}
        <div className="flex-1 data-card rounded-xl overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                {/* Las columnas se van ocultando de menos a más crítica según el ancho. */}
                <tr className="border-b border-white/5 bg-field/50">
                  <th className={thBase}>Número</th>
                  <th className={thBase}>Fecha</th>
                  <th className={thBase}>Estado</th>
                  <th className={`${thBase} hidden xl:table-cell`}>Ruta</th>
                  <th className={`${thBase} hidden sm:table-cell`}>Unidad</th>
                  <th className={`${thBase} hidden lg:table-cell`}>Piloto</th>
                  <th className={`${thBase} text-right`}>Peso (kg)</th>
                  <th className={`${thBase} text-center hidden md:table-cell`}>Paradas</th>
                  <th className={`${thBase} w-[90px] hidden sm:table-cell`}>Avance</th>
                </tr>
              </thead>

              <tbody className="text-body-sm divide-y divide-white/5">
                {isLoading && (
                  <tr>
                    <td colSpan={9} className="py-xl text-center text-ink-faint">
                      Cargando…
                    </td>
                  </tr>
                )}

                {!isLoading && data?.items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-xl text-center text-ink-faint">
                      Sin viajes para el filtro seleccionado.
                    </td>
                  </tr>
                )}

                {data?.items.map((v) => (
                  <tr key={v.viajeId} className="hover:bg-field transition-colors group">
                    <td className="py-md px-md">
                      <Link
                        to={`/viajes/${v.viajeId}`}
                        className="font-medium text-ink group-hover:text-accent transition-colors whitespace-nowrap"
                      >
                        {v.numero}
                      </Link>
                    </td>
                    <td className="py-md px-md text-ink-muted whitespace-nowrap">
                      {fmtFecha(v.fecha)}
                    </td>
                    <td className="py-md px-md">
                      <Chip estado={v.estado} texto={v.estadoNombre} />
                    </td>
                    <td className="py-md px-md text-ink-muted hidden xl:table-cell">
                      {v.rutaNombre ?? '—'}
                    </td>
                    <td className="py-md px-md text-ink-muted whitespace-nowrap hidden sm:table-cell">
                      {v.unidadPlaca ?? '—'}
                    </td>
                    <td className="py-md px-md text-ink-muted hidden lg:table-cell">
                      {v.pilotoNombre ?? '—'}
                    </td>
                    <td className="py-md px-md text-mono-data text-right tabular">
                      {fmtNum(v.pesoKg)}
                    </td>
                    <td className="py-md px-md text-mono-data text-center tabular text-ink-muted hidden md:table-cell">
                      {v.paradasEntregadas}/{v.totalParadas}
                    </td>
                    <td className="py-md px-md hidden sm:table-cell">
                      <div
                        className="h-1.5 rounded-full bg-field overflow-hidden"
                        title={`${v.avancePct}%`}
                      >
                        <div
                          className="h-full bg-ok rounded-full"
                          style={{ width: `${v.avancePct}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="mt-auto border-t border-white/5 py-sm px-md flex justify-between items-center bg-field/30">
            <span className="text-mono-data text-ink-faint tabular">
              {data ? `${data.items.length} de ${data.total} viaje(s)` : '—'}
            </span>
            <div className="flex items-center gap-sm">
              {data && data.totalPaginas > 1 && (
                <span className="text-mono-data text-ink-faint tabular">
                  Página {data.pagina} de {data.totalPaginas}
                </span>
              )}
              <div className="flex gap-xs">
                <button
                  disabled={!data || data.pagina <= 1}
                  onClick={() => setFiltro((f) => ({ ...f, pagina: (f.pagina ?? 1) - 1 }))}
                  className="p-xs rounded-lg border border-white/10 text-ink-muted hover:bg-elevated/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon name="chevron_left" size={18} />
                </button>
                <button
                  disabled={!data || data.pagina >= data.totalPaginas}
                  onClick={() => setFiltro((f) => ({ ...f, pagina: (f.pagina ?? 1) + 1 }))}
                  className="p-xs rounded-lg border border-white/10 text-ink-muted hover:bg-elevated/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon name="chevron_right" size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
