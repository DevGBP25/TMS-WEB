import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ETIQUETA_VIAJE, viajesApi, type EstadoViaje } from '@/api/viajes'
import { fmtFecha, fmtHora, fmtNum } from '@/utils/fechas'
import Chip from '@/components/Chip'
import Icon from '@/components/Icon'
import PageHeader from '@/components/PageHeader'

const th = 'py-sm px-md text-label-caps text-ink-faint uppercase font-normal whitespace-nowrap'

const FILTROS: (EstadoViaje | 'TODOS')[] = [
  'TODOS',
  'PLANIFICADO',
  'ASIGNADO',
  'EN_RUTA',
  'ENTREGADO',
  'LIQUIDADO',
]

export default function Viajes() {
  const [buscar, setBuscar] = useState('')
  const [filtro, setFiltro] = useState<EstadoViaje | 'TODOS'>('TODOS')

  const viajes = useQuery({
    queryKey: ['viajes', buscar, filtro],
    queryFn: () =>
      viajesApi.listar({
        buscar: buscar || undefined,
        estado: filtro === 'TODOS' ? undefined : filtro,
      }),
  })

  const lista = viajes.data ?? []

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader titulo="Viajes" subtitulo="Salidas armadas y su avance">
        <div className="relative flex-1 min-w-0 max-w-[28rem]">
          <Icon
            name="search"
            size={18}
            className="absolute left-md top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
          />
          <input
            className="field pl-2xl"
            placeholder="Número, piloto o unidad…"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>

        <Link to="/entregas" className="btn-accent shrink-0">
          <Icon name="add" size={18} />
          <span className="hidden md:inline">Armar viaje</span>
        </Link>
      </PageHeader>

      <div className="flex flex-wrap gap-xs">
        {FILTROS.map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-md py-xs rounded-lg text-label-caps uppercase transition-colors ${
              filtro === f ? 'bg-accent text-on-accent' : 'bg-field text-ink-muted hover:text-ink'
            }`}
          >
            {f === 'TODOS' ? 'Todos' : ETIQUETA_VIAJE[f]}
          </button>
        ))}
      </div>

      <div className="data-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5">
                <th className={th}>Viaje</th>
                <th className={th}>Fecha</th>
                <th className={th}>Piloto</th>
                <th className={`${th} hidden md:table-cell`}>Unidad</th>
                <th className={`${th} text-right`}>Entregas</th>
                <th className={`${th} text-right hidden lg:table-cell`}>Peso kg</th>
                <th className={th}>Estado</th>
                <th className={`${th} hidden xl:table-cell`}>Salida</th>
              </tr>
            </thead>

            <tbody className="text-body-sm divide-y divide-white/5">
              {viajes.isLoading && (
                <tr>
                  <td colSpan={8} className="py-xl text-center text-ink-faint">Cargando…</td>
                </tr>
              )}

              {viajes.isError && (
                <tr>
                  <td colSpan={8} className="py-xl text-center">
                    <Icon name="error" size={26} className="text-danger mb-sm" />
                    <p className="text-danger">No se pudo cargar el listado.</p>
                    <button className="btn-ghost mt-md inline-flex" onClick={() => viajes.refetch()}>
                      <Icon name="refresh" size={18} />
                      Reintentar
                    </button>
                  </td>
                </tr>
              )}

              {!viajes.isLoading && !viajes.isError && lista.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-xl text-center">
                    <Icon name="route" size={26} className="text-ink-faint mb-sm" />
                    <p className="text-ink-faint">No hay viajes que coincidan.</p>
                    <Link to="/entregas" className="btn-accent mt-md inline-flex">
                      <Icon name="add" size={18} />
                      Armar uno
                    </Link>
                  </td>
                </tr>
              )}

              {lista.map((v) => (
                <tr key={v.idViaje} className="hover:bg-field transition-colors">
                  <td className="py-md px-md whitespace-nowrap">
                    <Link
                      to={`/viajes/${v.idViaje}`}
                      className="font-medium text-accent-soft hover:underline"
                    >
                      {v.numero}
                    </Link>
                  </td>

                  <td className="py-md px-md text-ink-muted whitespace-nowrap">
                    {fmtFecha(v.fecha)}
                  </td>

                  <td className="py-md px-md text-ink">
                    {v.pilotoNombre ?? <span className="text-ink-faint">Sin asignar</span>}
                  </td>

                  <td className="py-md px-md text-ink-muted hidden md:table-cell whitespace-nowrap">
                    {v.unidadCodigo ? (
                      <>
                        {v.unidadCodigo}
                        {v.unidadPlaca && (
                          <span className="text-ink-faint"> · {v.unidadPlaca}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-faint">Sin asignar</span>
                    )}
                  </td>

                  {/* El avance importa más que el total: dice cuánto falta. */}
                  <td className="py-md px-md text-mono-data text-right tabular whitespace-nowrap">
                    {v.entregasCompletadas}
                    <span className="text-ink-faint"> / {v.totalEntregas}</span>
                  </td>

                  <td className="py-md px-md text-mono-data text-right tabular text-ink-muted hidden lg:table-cell">
                    {fmtNum(v.pesoKg, 1)}
                  </td>

                  <td className="py-md px-md">
                    <Chip estado={v.estado} texto={ETIQUETA_VIAJE[v.estado]} />
                  </td>

                  <td className="py-md px-md text-ink-muted hidden xl:table-cell whitespace-nowrap">
                    {v.salidaReal ? fmtHora(v.salidaReal) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
