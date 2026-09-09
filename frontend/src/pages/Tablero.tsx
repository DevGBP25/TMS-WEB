import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { viajesApi } from '@/api/viajes'
import { ETIQUETA_ESTADO, unidadesApi } from '@/api/unidades'
import { aIso, fmtNum, hoy } from '@/utils/fechas'
import Icon from '@/components/Icon'
import Chip from '@/components/Chip'

const DIAS_SERIE = 7

/** Las últimas N fechas en formato yyyy-MM-dd, de más antigua a hoy. */
function ultimosDias(n: number): string[] {
  const base = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() - (n - 1 - i))
    return aIso(d)
  })
}

const diaCorto = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-GT', { weekday: 'short' }).slice(0, 3)

export default function Tablero() {
  const fecha = hoy()
  const dias = ultimosDias(DIAS_SERIE)

  // No hay endpoint de serie: se piden los N días en paralelo. Son consultas
  // agregadas y baratas; si la ventana crece, conviene un endpoint dedicado.
  const serie = useQueries({
    queries: dias.map((d) => ({
      queryKey: ['indicadores', d],
      queryFn: () => viajesApi.indicadores(d, d),
      staleTime: 60_000,
    })),
  })

  const viajesHoy = useQuery({
    queryKey: ['viajes', 'hoy', fecha],
    queryFn: () => viajesApi.listar({ desde: fecha, hasta: fecha, porPagina: 8 }),
  })

  const unidades = useQuery({
    queryKey: ['unidades', 'flota'],
    queryFn: () => unidadesApi.listar(undefined, undefined, true),
  })

  const cargando = serie.some((q) => q.isLoading)
  const error = serie.find((q) => q.error)?.error as Error | undefined

  const pesos = serie.map((q) => q.data?.pesoTotalKg ?? 0)
  const maxPeso = Math.max(...pesos, 1)

  const d = serie[DIAS_SERIE - 1]?.data
  const pesoHoy = d?.pesoTotalKg ?? 0
  const pesoAyer = serie[DIAS_SERIE - 2]?.data?.pesoTotalKg ?? 0
  const variacion = pesoAyer > 0 ? ((pesoHoy - pesoAyer) / pesoAyer) * 100 : null

  const activos = (d?.planificados ?? 0) + (d?.asignados ?? 0) + (d?.enRuta ?? 0)
  const paradasTotales = (d?.paradasPendientes ?? 0) + (d?.paradasEntregadas ?? 0)
  const avance = paradasTotales === 0 ? 0 : ((d?.paradasEntregadas ?? 0) / paradasTotales) * 100

  return (
    <>
      {/* Cabecera */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-md">
        <div>
          <h2 className="text-headline-md md:text-headline-lg text-ink mb-xs">
            Centro de operación
          </h2>
          <p className="text-body-sm text-ink-faint">
            Actividad de transporte en tiempo real · {fecha}
          </p>
        </div>
        <div className="flex items-center gap-xs px-md py-sm rounded-xl border border-white/10 text-label-caps text-ink-muted uppercase">
          <Icon name="calendar_today" size={16} />
          Últimos {DIAS_SERIE} días
        </div>
      </div>

      {error && (
        <div className="data-card rounded-xl p-md flex items-center gap-sm text-danger">
          <Icon name="error" />
          {error.message}
        </div>
      )}

      {/* Bento superior */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">
        {/* Carga despachada con serie de 7 días */}
        <div className="glow-card rounded-xl p-lg md:col-span-2 flex flex-col relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

          <div className="flex justify-between items-start mb-md relative z-10">
            <div>
              <p className="text-label-caps text-ink-faint uppercase mb-xs">Carga despachada hoy</p>
              <h3 className="text-display-xl text-ink tabular leading-none">
                {cargando ? '—' : fmtNum(pesoHoy, 0)}
                <span className="text-headline-md text-ink-faint ml-sm">kg</span>
              </h3>
            </div>

            {variacion !== null && (
              <div
                className={`px-sm py-[2px] rounded-lg text-mono-data flex items-center gap-xs border ${
                  variacion >= 0
                    ? 'bg-ok/10 text-ok border-ok/20'
                    : 'bg-danger/10 text-danger border-danger/20'
                }`}
              >
                <Icon name={variacion >= 0 ? 'trending_up' : 'trending_down'} size={14} />
                {variacion >= 0 ? '+' : ''}
                {fmtNum(variacion, 1)}%
              </div>
            )}
          </div>

          <div className="flex-1 min-h-[112px] w-full mt-auto relative z-10 border-t border-white/5 pt-md">
            <div className="h-[96px] flex items-end justify-between gap-sm">
              {dias.map((dia, i) => {
                const esHoy = i === DIAS_SERIE - 1
                const alto = maxPeso === 0 ? 0 : (pesos[i] / maxPeso) * 100
                return (
                  <div key={dia} className="flex-1 h-full flex flex-col justify-end items-center gap-xs">
                    <div
                      title={`${diaCorto(dia)} · ${fmtNum(pesos[i], 0)} kg`}
                      className={`w-full rounded-t-sm transition-colors ${
                        esHoy
                          ? 'bg-accent/40 border-t-2 border-accent shadow-[0_-5px_15px_rgb(209_106_2/0.5)]'
                          : 'bg-accent/20 hover:bg-accent/40'
                      }`}
                      // Mínimo visible para que un día sin carga no desaparezca.
                      style={{ height: `${Math.max(alto, 2)}%` }}
                    />
                    <span
                      className={`text-[10px] uppercase tracking-wider ${
                        esHoy ? 'text-accent-soft' : 'text-ink-faint'
                      }`}
                    >
                      {diaCorto(dia)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Dos tarjetas apiladas */}
        <div className="grid grid-rows-2 gap-lg">
          <Link
            to="/viajes"
            className="glow-card rounded-xl p-lg flex flex-col justify-center relative overflow-hidden"
          >
            <div className="absolute right-[-20px] top-[-20px] w-20 h-20 bg-ok/10 rounded-full blur-xl" />
            <p className="text-label-caps text-ink-faint uppercase mb-xs">Viajes activos</p>
            <h3 className="text-headline-lg text-ink tabular">{cargando ? '—' : activos}</h3>
            <p className="text-mono-data text-ink-faint mt-xs">
              {d?.enRuta ?? 0} en ruta · {d?.entregados ?? 0} entregados
            </p>
          </Link>

          <div className="glow-card rounded-xl p-lg flex flex-col justify-center relative overflow-hidden">
            <div className="absolute right-[-20px] top-[-20px] w-20 h-20 bg-accent/10 rounded-full blur-xl" />
            <p className="text-label-caps text-ink-faint uppercase mb-xs">Avance de entregas</p>
            <div className="flex items-end gap-sm">
              <h3 className="text-headline-lg text-ink tabular">{fmtNum(avance, 0)}%</h3>
              <span className="text-mono-data text-ink-faint mb-[6px]">
                {d?.paradasEntregadas ?? 0}/{paradasTotales}
              </span>
            </div>
            <div className="w-full h-1.5 bg-elevated rounded-full mt-md overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-[width] duration-500"
                style={{ width: `${avance}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bento inferior */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg lg:h-[330px]">
        {/* Viajes del día */}
        <div className="glow-card rounded-xl lg:col-span-2 flex flex-col overflow-hidden">
          <div className="p-lg border-b border-white/5 flex justify-between items-center bg-[#131b2c]">
            <h3 className="text-body-lg font-semibold text-ink flex items-center gap-sm">
              <Icon name="local_shipping" size={18} className="text-accent-soft" />
              Viajes de hoy
            </h3>
            <Link
              to="/viajes"
              className="text-accent-soft text-label-caps uppercase hover:text-accent transition-colors"
            >
              Ver todos
            </Link>
          </div>

          <div className="flex-1 overflow-y-auto">
            {viajesHoy.isLoading && (
              <p className="p-lg text-center text-ink-faint">Cargando…</p>
            )}

            {!viajesHoy.isLoading && viajesHoy.data?.items.length === 0 && (
              <div className="p-xl text-center">
                <Icon name="event_busy" size={26} className="text-ink-faint mb-sm" />
                <p className="text-ink-faint">No hay viajes programados para hoy.</p>
                <Link to="/planificar" className="btn-accent mt-md inline-flex">
                  <Icon name="add" size={18} />
                  Planificar uno
                </Link>
              </div>
            )}

            <ul className="divide-y divide-white/5">
              {viajesHoy.data?.items.map((v) => (
                <li key={v.viajeId} className="hover:bg-elevated/30 transition-colors">
                  <Link to={`/viajes/${v.viajeId}`} className="p-md flex items-start gap-md">
                    <div className="w-8 h-8 rounded-xl bg-field flex items-center justify-center shrink-0">
                      <Icon name="local_shipping" size={18} className="text-ink-faint" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="text-ink font-medium">{v.numero}</h4>
                      <p className="text-body-sm text-ink-faint mt-1 truncate">
                        {v.rutaNombre ?? 'Sin ruta'} · {v.unidadPlaca ?? 'sin unidad'} ·{' '}
                        {v.pilotoNombre ?? 'sin piloto'}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Chip estado={v.estado} texto={v.estadoNombre} />
                      <span className="text-mono-data text-ink-faint tabular">
                        {v.paradasEntregadas}/{v.totalParadas} paradas
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Estado de la flota */}
        <div className="glow-card rounded-xl flex flex-col overflow-hidden">
          <div className="p-lg border-b border-white/5 bg-[#131b2c]">
            <h3 className="text-body-lg font-semibold text-ink flex items-center gap-sm">
              <Icon name="garage" size={18} className="text-accent-soft" />
              Estado de la flota
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-lg">
            {unidades.isLoading && <p className="text-center text-ink-faint">Cargando…</p>}

            <div className="relative border-l border-white/10 ml-[9px] space-y-md">
              {unidades.data?.map((u) => (
                <div key={u.idUnidad} className="relative pl-lg">
                  <div
                    className={`absolute left-[-5px] top-[6px] w-2.5 h-2.5 rounded-full ring-4 ring-card ${
                      u.estado === 'DISPONIBLE'
                        ? 'bg-ok'
                        : u.estado === 'EN_RUTA'
                          ? 'bg-accent shadow-[0_0_8px_rgb(209_106_2/0.8)]'
                          : 'bg-elevated border border-ink-faint'
                    }`}
                  />
                  <p className="text-body-sm text-ink">
                    <strong>{u.placa ?? u.codigo}</strong> · {u.tipo ?? 'unidad'}
                  </p>
                  <p className="text-body-sm text-ink-faint text-[13px] mt-1">
                    {u.transportista ?? 'Propia'} · {fmtNum(u.capacidadKg, 0)} kg
                  </p>
                  <div className="mt-1">
                    <Chip estado={u.estado} texto={ETIQUETA_ESTADO[u.estado]} />
                  </div>
                </div>
              ))}
            </div>

            {!unidades.isLoading && unidades.data?.length === 0 && (
              <p className="text-center text-ink-faint">Sin unidades registradas.</p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
