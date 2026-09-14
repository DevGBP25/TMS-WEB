import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ETIQUETA_VIAJE,
  TRANSICIONES,
  viajesApi,
  type EstadoViaje,
} from '@/api/viajes'
import { ETIQUETA_ENTREGA, entregasApi } from '@/api/entregas'
import { unidadesApi } from '@/api/unidades'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { fmtFecha, fmtHora, fmtNum } from '@/utils/fechas'
import Chip from '@/components/Chip'
import Icon from '@/components/Icon'
import Modal from '@/components/Modal'
import PageHeader from '@/components/PageHeader'

const th = 'py-sm px-md text-label-caps text-ink-faint uppercase font-normal whitespace-nowrap'

export default function ViajeDetalle() {
  const { id } = useParams()
  const idViaje = Number(id)
  const qc = useQueryClient()
  const { tieneRol } = useAuth()
  const puedeOperar = tieneRol('ADMIN', 'SUPERVISOR', 'DESPACHO')

  const [asignando, setAsignando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const detalle = useQuery({
    queryKey: ['viajes', idViaje],
    queryFn: () => viajesApi.obtener(idViaje),
    enabled: Number.isFinite(idViaje),
  })

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['viajes'] })
    qc.invalidateQueries({ queryKey: ['entregas'] })
  }

  const cambiar = useMutation({
    mutationFn: (estado: EstadoViaje) => viajesApi.cambiarEstado(idViaje, estado),
    onSuccess: () => { setError(null); refrescar() },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'No se pudo cambiar el estado.'),
  })

  const quitar = useMutation({
    mutationFn: (idEntrega: number) => entregasApi.liberar([idEntrega]),
    onSuccess: () => { setError(null); refrescar() },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'No se pudo quitar la entrega.'),
  })

  if (detalle.isLoading) {
    return <p className="py-2xl text-center text-ink-faint">Cargando viaje…</p>
  }

  if (detalle.isError || !detalle.data) {
    return (
      <div className="py-2xl text-center">
        <Icon name="error" size={26} className="text-danger mb-sm" />
        <p className="text-ink-muted">
          {detalle.error instanceof ApiError ? detalle.error.message : 'No se pudo cargar el viaje.'}
        </p>
        <Link to="/viajes" className="btn-ghost mt-md inline-flex">Volver a viajes</Link>
      </div>
    )
  }

  const { viaje: v, entregas } = detalle.data
  const siguientes = TRANSICIONES[v.estado] ?? []
  const editable = v.estado === 'PLANIFICADO' || v.estado === 'ASIGNADO'

  const monto = entregas.reduce((a, e) => a + e.monto, 0)
  const excedido = Boolean(v.unidadCapacidadKg && v.pesoKg > v.unidadCapacidadKg)

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader titulo={v.numero} subtitulo={`Viaje del ${fmtFecha(v.fecha)}`}>
        <Chip estado={v.estado} texto={ETIQUETA_VIAJE[v.estado]} />

        {puedeOperar &&
          siguientes.map((s) => (
            <button
              key={s}
              className={s === 'CANCELADO' ? 'btn-ghost' : 'btn-accent'}
              onClick={() => cambiar.mutate(s)}
              disabled={cambiar.isPending}
            >
              <Icon name={ICONO[s]} size={18} />
              {ACCION[s]}
            </button>
          ))}
      </PageHeader>

      {error && (
        <div className="data-card rounded-xl border border-danger/30 text-danger px-lg py-md flex items-start gap-md">
          <Icon name="error" size={18} />
          <p className="text-body-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} aria-label="Cerrar aviso">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-lg">
        {/* --- recursos --- */}
        <div className="data-card rounded-xl p-lg flex flex-col gap-md">
          <div className="flex items-center justify-between">
            <h3 className="text-label-caps text-ink-faint uppercase">Recursos</h3>
            {puedeOperar && editable && (
              <button
                className="text-accent-soft hover:underline text-body-sm"
                onClick={() => setAsignando(true)}
              >
                {v.idPiloto ? 'Cambiar' : 'Asignar'}
              </button>
            )}
          </div>

          <Dato
            icono="person"
            etiqueta="Piloto"
            valor={v.pilotoNombre ?? 'Sin asignar'}
            detalle={v.pilotoTelefono ?? undefined}
          />
          <Dato
            icono="local_shipping"
            etiqueta="Unidad"
            valor={v.unidadCodigo ?? 'Sin asignar'}
            detalle={v.unidadPlaca ?? undefined}
          />
        </div>

        {/* --- carga --- */}
        <div className="data-card rounded-xl p-lg flex flex-col gap-md">
          <h3 className="text-label-caps text-ink-faint uppercase">Carga</h3>

          <div className="flex gap-lg">
            <Cifra etiqueta="Entregas" valor={String(v.totalEntregas)} />
            <Cifra
              etiqueta="Completadas"
              valor={`${v.entregasCompletadas} / ${v.totalEntregas}`}
            />
          </div>

          <div className="flex gap-lg">
            <Cifra
              etiqueta="Peso"
              valor={`${fmtNum(v.pesoKg, 1)} kg`}
              alerta={excedido}
            />
            <Cifra etiqueta="Monto" valor={fmtNum(monto)} />
          </div>

          {excedido && (
            <p className="text-body-sm text-accent-soft">
              Supera los {fmtNum(v.unidadCapacidadKg ?? 0, 0)} kg de capacidad de la unidad.
            </p>
          )}
        </div>

        {/* --- tiempos --- */}
        <div className="data-card rounded-xl p-lg flex flex-col gap-md">
          <h3 className="text-label-caps text-ink-faint uppercase">Tiempos</h3>
          <Dato icono="schedule" etiqueta="Creado" valor={fmtHora(v.fechaCreacion)} />
          <Dato icono="play_arrow" etiqueta="Salida" valor={fmtHora(v.salidaReal)} />
          <Dato icono="flag" etiqueta="Retorno" valor={fmtHora(v.retornoReal)} />
        </div>
      </div>

      {v.observaciones && (
        <div className="data-card rounded-xl p-lg">
          <h3 className="text-label-caps text-ink-faint uppercase mb-sm">Observaciones</h3>
          <p className="text-body-sm text-ink-muted">{v.observaciones}</p>
        </div>
      )}

      <div className="data-card rounded-xl overflow-hidden">
        <div className="px-lg py-md border-b border-white/5 flex items-center justify-between">
          <h3 className="text-label-caps text-ink-faint uppercase">
            Entregas del viaje
          </h3>
          {puedeOperar && editable && (
            <Link to="/entregas" className="text-accent-soft hover:underline text-body-sm">
              Agregar más
            </Link>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5">
                <th className={`${th} w-10`}>#</th>
                <th className={th}>Boleta</th>
                <th className={`${th} hidden lg:table-cell`}>Orden venta</th>
                <th className={th}>Factura</th>
                <th className={th}>Cliente</th>
                <th className={`${th} hidden xl:table-cell`}>Municipio</th>
                <th className={`${th} text-right`}>Peso kg</th>
                <th className={th}>Estado</th>
                {puedeOperar && editable && <th className={`${th} text-right`}>Quitar</th>}
              </tr>
            </thead>

            <tbody className="text-body-sm divide-y divide-white/5">
              {entregas.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-xl text-center">
                    <Icon name="inventory_2" size={26} className="text-ink-faint mb-sm" />
                    <p className="text-ink-faint">Este viaje todavía no lleva entregas.</p>
                    {puedeOperar && editable && (
                      <Link to="/entregas" className="btn-accent mt-md inline-flex">
                        <Icon name="add" size={18} />
                        Cargarlo
                      </Link>
                    )}
                  </td>
                </tr>
              )}

              {entregas.map((e) => (
                <tr key={e.idEntrega} className="hover:bg-field transition-colors">
                  <td className="py-md px-md text-ink-faint tabular">{e.secuencia ?? '—'}</td>
                  <td className="py-md px-md font-medium text-ink tabular">{e.sapDocNum}</td>
                  <td className="py-md px-md text-ink-muted tabular hidden lg:table-cell">
                    {e.sapOrdenVenta ?? '—'}
                  </td>
                  <td className="py-md px-md tabular">{e.sapFacturaNum ?? '—'}</td>

                  <td className="py-md px-md">
                    <div className="text-ink">{e.clienteNombre}</div>
                    {e.direccion && (
                      <div className="text-label-caps text-ink-faint mt-xs truncate max-w-[22rem]">
                        {e.direccion}
                      </div>
                    )}
                    {e.motivoRechazo && (
                      <div className="text-body-sm text-danger mt-xs">{e.motivoRechazo}</div>
                    )}
                    {e.receptor && (
                      <div className="text-body-sm text-ink-faint mt-xs">
                        Recibió: {e.receptor}
                      </div>
                    )}
                  </td>

                  <td className="py-md px-md text-ink-muted hidden xl:table-cell">
                    {e.municipio ?? '—'}
                  </td>

                  <td className="py-md px-md text-mono-data text-right tabular">
                    {fmtNum(e.pesoKg, 1)}
                  </td>

                  <td className="py-md px-md">
                    <Chip estado={e.estado} texto={ETIQUETA_ENTREGA[e.estado]} />
                  </td>

                  {puedeOperar && editable && (
                    <td className="py-md px-md text-right">
                      <button
                        onClick={() => quitar.mutate(e.idEntrega)}
                        disabled={quitar.isPending}
                        className="text-ink-faint hover:text-danger transition-colors"
                        aria-label={`Quitar la boleta ${e.sapDocNum} del viaje`}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {asignando && (
        <FormRecursos
          idViaje={idViaje}
          fecha={v.fecha}
          pilotoActual={v.idPiloto}
          unidadActual={v.idUnidad}
          onCerrar={() => setAsignando(false)}
          onListo={() => { setAsignando(false); setError(null); refrescar() }}
        />
      )}
    </div>
  )
}

const ACCION: Record<EstadoViaje, string> = {
  PLANIFICADO: 'Devolver a planificado',
  ASIGNADO: 'Marcar asignado',
  EN_RUTA: 'Despachar',
  ENTREGADO: 'Cerrar viaje',
  LIQUIDADO: 'Liquidar',
  CANCELADO: 'Cancelar',
}

const ICONO: Record<EstadoViaje, string> = {
  PLANIFICADO: 'undo',
  ASIGNADO: 'assignment_turned_in',
  EN_RUTA: 'play_arrow',
  ENTREGADO: 'flag',
  LIQUIDADO: 'task_alt',
  CANCELADO: 'cancel',
}

/** Diálogo de camión y piloto. */
function FormRecursos({
  idViaje,
  fecha,
  pilotoActual,
  unidadActual,
  onCerrar,
  onListo,
}: {
  idViaje: number
  fecha: string
  pilotoActual?: number
  unidadActual?: number
  onCerrar: () => void
  onListo: () => void
}) {
  const [idPiloto, setIdPiloto] = useState(pilotoActual ? String(pilotoActual) : '')
  const [idUnidad, setIdUnidad] = useState(unidadActual ? String(unidadActual) : '')
  const [error, setError] = useState<string | null>(null)

  const pilotos  = useQuery({ queryKey: ['pilotos', fecha], queryFn: () => viajesApi.pilotos(fecha) })
  const unidades = useQuery({
    queryKey: ['unidades', 'disponibles'],
    queryFn: () => unidadesApi.listar(undefined, undefined, true),
  })

  const guardar = useMutation({
    mutationFn: () => viajesApi.asignarRecursos(idViaje, Number(idUnidad), Number(idPiloto)),
    onSuccess: onListo,
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'No se pudo asignar.'),
  })

  return (
    <Modal titulo="Camión y piloto" onCerrar={onCerrar}>
      <form
        className="flex flex-col gap-lg"
        onSubmit={(ev) => { ev.preventDefault(); setError(null); guardar.mutate() }}
      >
        <label className="flex flex-col gap-xs">
          <span className="text-label-caps text-ink-muted uppercase">Piloto</span>
          <select
            className="field"
            value={idPiloto}
            onChange={(e) => setIdPiloto(e.target.value)}
            required
          >
            <option value="">Elija un piloto…</option>
            {(pilotos.data ?? []).map((p) => (
              <option key={p.idUsuario} value={p.idUsuario}>
                {p.nombre}
                {p.viajeDelDia ? ` — ya lleva ${p.viajeDelDia}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-xs">
          <span className="text-label-caps text-ink-muted uppercase">Unidad</span>
          <select
            className="field"
            value={idUnidad}
            onChange={(e) => setIdUnidad(e.target.value)}
            required
          >
            <option value="">Elija una unidad…</option>
            {(unidades.data ?? [])
              .filter((u) => u.estado === 'DISPONIBLE' || u.idUnidad === unidadActual)
              .map((u) => (
                <option key={u.idUnidad} value={u.idUnidad}>
                  {u.codigo}
                  {u.placa ? ` · ${u.placa}` : ''} — {fmtNum(u.capacidadKg, 0)} kg
                </option>
              ))}
          </select>
        </label>

        {error && (
          <p className="text-body-sm text-danger rounded-lg border border-danger/30 bg-field px-md py-sm">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-md pt-sm border-t border-white/5">
          <button type="button" className="btn-ghost" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn-accent" disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Dato({
  icono,
  etiqueta,
  valor,
  detalle,
}: {
  icono: string
  etiqueta: string
  valor: string
  detalle?: string
}) {
  return (
    <div className="flex items-start gap-md">
      <Icon name={icono} size={18} className="text-ink-faint mt-xs" />
      <div className="min-w-0">
        <div className="text-label-caps text-ink-faint uppercase">{etiqueta}</div>
        <div className="text-ink truncate">{valor}</div>
        {detalle && <div className="text-body-sm text-ink-faint">{detalle}</div>}
      </div>
    </div>
  )
}

function Cifra({
  etiqueta,
  valor,
  alerta,
}: {
  etiqueta: string
  valor: string
  alerta?: boolean
}) {
  return (
    <div>
      <div className="text-label-caps text-ink-faint uppercase">{etiqueta}</div>
      <div className={`text-headline-md tabular ${alerta ? 'text-accent-soft' : 'text-ink'}`}>
        {valor}
      </div>
    </div>
  )
}
