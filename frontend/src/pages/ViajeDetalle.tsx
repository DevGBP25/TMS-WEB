import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { catalogosApi, viajesApi } from '@/api/viajes'
import { fmtFecha, fmtHora, fmtNum } from '@/utils/fechas'
import type { EstadoParada } from '@/types/tms'
import Icon from '@/components/Icon'
import Chip from '@/components/Chip'

const iconoParada: Record<EstadoParada, string> = {
  Pendiente: 'schedule',
  EnSitio: 'pin_drop',
  Entregada: 'check_circle',
  Rechazada: 'cancel',
  Parcial: 'error',
}

/** Anillo de avance del viaje. */
function Anillo({ pct }: { pct: number }) {
  const r = 52
  const circ = 2 * Math.PI * r
  return (
    <div className="relative w-[112px] h-[112px]">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-field)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - (circ * pct) / 100}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-headline-lg text-ink tabular">{fmtNum(pct, 0)}</span>
        <span className="text-label-caps text-ink-faint uppercase">por ciento</span>
      </div>
    </div>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="text-label-caps text-ink-faint uppercase mb-xs">{etiqueta}</div>
      <div className="text-body-sm text-ink">{valor}</div>
    </div>
  )
}

export default function ViajeDetalle() {
  const { id } = useParams()
  const viajeId = Number(id)
  const qc = useQueryClient()

  const [unidadId, setUnidadId] = useState('')
  const [pilotoId, setPilotoId] = useState('')

  const viaje = useQuery({
    queryKey: ['viaje', viajeId],
    queryFn: () => viajesApi.obtener(viajeId),
    enabled: Number.isFinite(viajeId),
  })

  const unidades = useQuery({
    queryKey: ['unidades', 'Disponible'],
    queryFn: () => catalogosApi.unidades('Disponible'),
  })

  const pilotos = useQuery({ queryKey: ['pilotos'], queryFn: () => catalogosApi.pilotos() })

  const refrescar = () => qc.invalidateQueries({ queryKey: ['viaje', viajeId] })

  const asignar = useMutation({
    mutationFn: () => viajesApi.asignar(viajeId, Number(unidadId), Number(pilotoId)),
    onSuccess: refrescar,
  })

  const cambiarEstado = useMutation({
    mutationFn: (estado: string) => viajesApi.cambiarEstado(viajeId, estado),
    onSuccess: refrescar,
  })

  if (viaje.isLoading) {
    return <div className="data-card rounded-xl p-xl text-center text-ink-faint">Cargando…</div>
  }

  if (viaje.error) {
    return (
      <div className="data-card rounded-xl p-md flex items-center gap-sm text-danger">
        <Icon name="error" />
        {(viaje.error as Error).message}
      </div>
    )
  }

  // Sin datos y sin error: la consulta quedó en pausa o el id no es válido.
  if (!viaje.data) {
    return (
      <div className="data-card rounded-xl p-md flex items-center justify-between gap-md">
        <span className="text-ink-muted">No se pudo cargar el viaje {id}.</span>
        <button className="btn-ghost" onClick={() => viaje.refetch()}>
          Reintentar
        </button>
      </div>
    )
  }

  const v = viaje.data
  const puedeAsignar = v.estado === 'Planificado' || v.estado === 'Asignado'

  const siguiente =
    v.estado === 'Asignado'
      ? 'EnRuta'
      : v.estado === 'EnRuta'
        ? 'Entregado'
        : v.estado === 'Entregado'
          ? 'Liquidado'
          : null

  const errorAccion = (asignar.error ?? cambiarEstado.error) as Error | null

  return (
    <>
      {/* Cabecera del viaje */}
      <div className="data-card rounded-xl p-lg flex flex-col md:flex-row md:items-center gap-md">
        <div className="w-11 h-11 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0">
          <Icon name="local_shipping" size={22} className="text-accent" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-sm flex-wrap">
            <Link to="/viajes" className="text-ink-faint hover:text-accent transition-colors">
              <Icon name="arrow_back" size={18} />
            </Link>
            <h2 className="font-display text-headline-lg text-ink">{v.numero}</h2>
            <Chip estado={v.estado} texto={v.estadoNombre} />
          </div>
          <div className="flex flex-wrap items-center gap-md mt-xs text-body-sm text-ink-faint">
            <span className="flex items-center gap-xs">
              <Icon name="event" size={16} />
              {fmtFecha(v.fecha)}
            </span>
            <span className="flex items-center gap-xs">
              <Icon name="route" size={16} />
              {v.rutaNombre ?? 'Sin ruta'}
            </span>
          </div>
        </div>

        {siguiente && (
          <button
            className="btn-accent"
            onClick={() => cambiarEstado.mutate(siguiente)}
            disabled={cambiarEstado.isPending}
          >
            <Icon name="arrow_forward" size={18} />
            {cambiarEstado.isPending ? 'Guardando…' : `Marcar ${siguiente}`}
          </button>
        )}
      </div>

      {errorAccion && (
        <div className="data-card rounded-xl p-md flex items-center gap-sm text-danger">
          <Icon name="error" />
          {errorAccion.message}
        </div>
      )}

      {/* Con la escala compacta las tres columnas ya entran desde lg; en xl se
          ensanchan los laterales. minmax(0,1fr) evita que el centro desborde. */}
      <div className="grid grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)_240px] xl:grid-cols-[240px_minmax(0,1fr)_280px] gap-lg items-start">
        {/* Columna izquierda: datos y avance */}
        <div className="flex flex-col gap-lg">
          <div className="data-card rounded-xl p-md flex flex-col gap-md">
            <h3 className="flex items-center gap-sm text-label-caps text-accent uppercase">
              <Icon name="info" size={18} />
              Resumen
            </h3>
            <Dato etiqueta="Peso" valor={`${fmtNum(v.pesoKg)} kg`} />
            <Dato etiqueta="Volumen" valor={`${fmtNum(v.volumenM3)} m³`} />
            <Dato etiqueta="Salida programada" valor={fmtHora(v.salidaProgramada)} />
            <Dato etiqueta="Salida real" valor={fmtHora(v.salidaReal)} />
            <Dato etiqueta="Retorno" valor={fmtHora(v.retornoReal)} />
            {v.observaciones && <Dato etiqueta="Observaciones" valor={v.observaciones} />}
          </div>

          <div className="data-card rounded-xl p-md flex flex-col items-center gap-sm">
            <h3 className="self-start flex items-center gap-sm text-label-caps text-accent uppercase">
              <Icon name="donut_large" size={18} />
              Avance
            </h3>
            <Anillo pct={v.avancePct} />
            <span className="text-body-sm text-ink-faint">
              {v.paradas.filter((p) => p.estado === 'Entregada').length} de {v.paradas.length}{' '}
              entregadas
            </span>
          </div>
        </div>

        {/* Columna central: paradas como línea de tiempo */}
        <div className="data-card rounded-xl p-md flex flex-col gap-md min-w-0">
          <h3 className="flex items-center gap-sm text-label-caps text-accent uppercase">
            <Icon name="pin_drop" size={18} />
            Paradas ({v.paradas.length})
          </h3>

          {v.paradas.length === 0 && (
            <p className="text-center text-ink-faint py-lg">El viaje no tiene paradas.</p>
          )}

          <ol className="flex flex-col">
            {v.paradas.map((p, i) => (
              <li key={p.paradaId} className="flex gap-md">
                {/* Rail de la línea de tiempo */}
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-2xl bg-field flex items-center justify-center shrink-0">
                    <Icon
                      name={iconoParada[p.estado] ?? 'pin_drop'}
                      size={18}
                      className={
                        p.estado === 'Entregada'
                          ? 'text-ok'
                          : p.estado === 'Rechazada'
                            ? 'text-danger'
                            : 'text-ink-faint'
                      }
                    />
                  </div>
                  {i < v.paradas.length - 1 && <div className="w-px flex-1 bg-white/10 my-xs" />}
                </div>

                <div className="flex-1 min-w-0 pb-lg">
                  <div className="flex items-start justify-between gap-sm flex-wrap">
                    <div className="min-w-0">
                      <div className="text-body-sm font-medium text-ink truncate">
                        {p.secuencia}. {p.clienteNombre}
                      </div>
                      <div className="text-label-caps text-ink-faint uppercase mt-xs">
                        {p.clienteCodigo}
                        {p.sapDocNum ? ` · Entrega SAP ${p.sapDocNum}` : ''}
                      </div>
                    </div>
                    <Chip estado={p.estado} texto={p.estadoNombre} />
                  </div>

                  {p.direccion && (
                    <p className="text-body-sm text-ink-faint mt-xs">{p.direccion}</p>
                  )}

                  <div className="flex flex-wrap gap-md mt-sm text-mono-data text-ink-muted tabular">
                    <span>{fmtNum(p.pesoKg)} kg</span>
                    <span>Q {fmtNum(p.monto)}</span>
                    {p.llegadaReal && <span>Llegada {fmtHora(p.llegadaReal)}</span>}
                  </div>

                  {p.motivoRechazo && (
                    <p className="text-body-sm text-danger mt-xs">{p.motivoRechazo}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Columna derecha: asignación */}
        <div className="data-card rounded-xl p-md flex flex-col gap-md">
          <h3 className="flex items-center gap-sm text-label-caps text-accent uppercase">
            <Icon name="assignment_ind" size={18} />
            Asignación
          </h3>

          <div className="flex flex-col gap-sm">
            <div className="flex items-center gap-sm">
              <Icon name="local_shipping" size={18} className="text-ink-faint" />
              <span className="text-body-sm text-ink">{v.unidadPlaca ?? 'Sin unidad'}</span>
            </div>
            <div className="flex items-center gap-sm">
              <Icon name="person" size={18} className="text-ink-faint" />
              <span className="text-body-sm text-ink">{v.pilotoNombre ?? 'Sin piloto'}</span>
            </div>
          </div>

          <div className="border-t border-white/5 pt-md flex flex-col gap-sm">
            <label className="block text-label-caps text-ink-faint uppercase">Unidad</label>
            <select
              className="field"
              value={unidadId}
              onChange={(e) => setUnidadId(e.target.value)}
              disabled={!puedeAsignar}
            >
              <option value="">Seleccionar…</option>
              {unidades.data?.map((u) => (
                <option key={u.unidadId} value={u.unidadId}>
                  {u.placa} · {fmtNum(u.capacidadKg, 0)} kg
                </option>
              ))}
            </select>

            <label className="block text-label-caps text-ink-faint uppercase mt-sm">Piloto</label>
            <select
              className="field"
              value={pilotoId}
              onChange={(e) => setPilotoId(e.target.value)}
              disabled={!puedeAsignar}
            >
              <option value="">Seleccionar…</option>
              {pilotos.data?.map((p) => (
                <option key={p.pilotoId} value={p.pilotoId}>
                  {p.nombre}
                </option>
              ))}
            </select>

            <button
              className="btn-accent mt-sm"
              onClick={() => asignar.mutate()}
              disabled={!puedeAsignar || !unidadId || !pilotoId || asignar.isPending}
            >
              {asignar.isPending ? 'Asignando…' : 'Asignar'}
            </button>

            {!puedeAsignar && (
              <p className="text-body-sm text-ink-faint">
                El viaje está en {v.estadoNombre} y ya no admite reasignación.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
