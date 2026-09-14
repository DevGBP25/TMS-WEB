import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { entregasApi } from '@/api/entregas'
import { ETIQUETA_VIAJE, viajesApi } from '@/api/viajes'
import { unidadesApi } from '@/api/unidades'
import { ApiError } from '@/api/client'
import { fmtFecha, fmtNum, hoy } from '@/utils/fechas'
import Icon from './Icon'
import Modal from './Modal'

interface Props {
  /** Boletas seleccionadas en la tabla. */
  ids: number[]
  onCerrar: () => void
  onListo: (mensaje: string) => void
}

type Destino = 'nuevo' | 'existente'

/**
 * Manda la selección a un viaje. Son dos caminos porque el supervisor hace
 * las dos cosas: arrancar un viaje nuevo con lo que acaba de escoger, o
 * completar uno que armó hace un rato y todavía no ha salido.
 */
export default function AsignarViaje({ ids, onCerrar, onListo }: Props) {
  const qc = useQueryClient()

  const [destino, setDestino] = useState<Destino>('nuevo')
  const [fecha, setFecha] = useState(hoy())
  const [idViaje, setIdViaje] = useState('')
  const [idPiloto, setIdPiloto] = useState('')
  const [idUnidad, setIdUnidad] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pilotos = useQuery({
    queryKey: ['pilotos', fecha],
    queryFn: () => viajesApi.pilotos(fecha),
    enabled: destino === 'nuevo',
  })

  const unidades = useQuery({
    queryKey: ['unidades', 'disponibles'],
    queryFn: () => unidadesApi.listar(undefined, undefined, true),
    enabled: destino === 'nuevo',
  })

  /* Sólo los viajes que todavía admiten carga. Ofrecer uno que ya salió
     sería ofrecer un error de 409. */
  const abiertos = useQuery({
    queryKey: ['viajes', 'abiertos'],
    queryFn: async () => {
      const todos = await viajesApi.listar({})
      return todos.filter((v) => v.estado === 'PLANIFICADO' || v.estado === 'ASIGNADO')
    },
    enabled: destino === 'existente',
  })

  const guardar = useMutation({
    mutationFn: async () => {
      if (destino === 'existente') {
        if (!idViaje) throw new ApiError('Elija el viaje al que se agregan.', 400)
        const r = await entregasApi.asignarViaje(Number(idViaje), ids)
        const v = abiertos.data?.find((x) => String(x.idViaje) === idViaje)
        return `${r.afectadas} entrega(s) agregadas al viaje ${v?.numero ?? idViaje}.`
      }

      // Unidad y piloto van juntos o no van: medio asignado no sirve de nada.
      if (Boolean(idPiloto) !== Boolean(idUnidad))
        throw new ApiError('Elija piloto y unidad juntos, o deje ambos en blanco.', 400)

      const r = await viajesApi.crear({
        fecha,
        idPiloto: idPiloto ? Number(idPiloto) : null,
        idUnidad: idUnidad ? Number(idUnidad) : null,
        observaciones: observaciones.trim() || undefined,
        entregas: ids,
      })

      return `Viaje ${r.numero} creado con ${ids.length} entrega(s).`
    },
    onSuccess: (mensaje) => {
      qc.invalidateQueries({ queryKey: ['entregas'] })
      qc.invalidateQueries({ queryKey: ['viajes'] })
      onListo(mensaje)
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'No se pudo completar la asignación.'),
  })

  const enviar = (ev: React.FormEvent) => {
    ev.preventDefault()
    setError(null)
    guardar.mutate()
  }

  const pestana = (valor: Destino, texto: string) => (
    <button
      type="button"
      onClick={() => { setDestino(valor); setError(null) }}
      className={`flex-1 py-sm rounded-lg text-label-caps uppercase transition-colors ${
        destino === valor ? 'bg-accent text-on-accent' : 'text-ink-muted hover:bg-field'
      }`}
    >
      {texto}
    </button>
  )

  return (
    <Modal
      titulo="Agrupar en un viaje"
      subtitulo="El viaje les pone camión y las despacha juntas. El piloto va por boleta."
      onCerrar={onCerrar}
    >
      <form onSubmit={enviar} className="flex flex-col gap-lg">
        {/* Lo seleccionado, siempre a la vista: es lo que se está por mover. */}
        <div className="rounded-xl bg-field border border-white/5 p-md flex flex-wrap gap-lg">
          <Resumen etiqueta="Boletas" valor={String(ids.length)} />
        </div>

        <div className="flex gap-xs p-xs rounded-xl bg-field border border-white/5">
          {pestana('nuevo', 'Viaje nuevo')}
          {pestana('existente', 'Viaje existente')}
        </div>

        {destino === 'nuevo' ? (
          <>
            <Campo etiqueta="Fecha del viaje">
              <input
                type="date"
                className="field"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                required
              />
            </Campo>

            <Campo
              etiqueta="Piloto"
              ayuda="Opcional. Se puede asignar después, antes de despachar."
            >
              <select className="field" value={idPiloto} onChange={(e) => setIdPiloto(e.target.value)}>
                <option value="">Sin asignar</option>
                {(pilotos.data ?? []).map((p) => (
                  <option key={p.idUsuario} value={p.idUsuario}>
                    {p.nombre}
                    {p.viajeDelDia ? ` — ya lleva ${p.viajeDelDia}` : ''}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo etiqueta="Unidad">
              <select className="field" value={idUnidad} onChange={(e) => setIdUnidad(e.target.value)}>
                <option value="">Sin asignar</option>
                {(unidades.data ?? [])
                  .filter((u) => u.estado === 'DISPONIBLE')
                  .map((u) => (
                    <option key={u.idUnidad} value={u.idUnidad}>
                      {u.codigo}
                      {u.placa ? ` · ${u.placa}` : ''} — {fmtNum(u.capacidadKg, 0)} kg
                    </option>
                  ))}
              </select>
            </Campo>

            <Campo etiqueta="Observaciones">
              <textarea
                className="field"
                rows={2}
                maxLength={500}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
              />
            </Campo>
          </>
        ) : (
          <Campo etiqueta="Viaje" ayuda="Sólo aparecen los que todavía no han salido.">
            {abiertos.isLoading ? (
              <p className="text-body-sm text-ink-faint">Cargando viajes…</p>
            ) : (abiertos.data ?? []).length === 0 ? (
              <p className="text-body-sm text-ink-faint">
                No hay viajes abiertos. Cree uno nuevo desde la otra pestaña.
              </p>
            ) : (
              <select className="field" value={idViaje} onChange={(e) => setIdViaje(e.target.value)}>
                <option value="">Elija un viaje…</option>
                {(abiertos.data ?? []).map((v) => (
                  <option key={v.idViaje} value={v.idViaje}>
                    {v.numero} · {fmtFecha(v.fecha)} · {ETIQUETA_VIAJE[v.estado]} ·{' '}
                    {v.totalEntregas} entrega(s)
                    {v.pilotoNombre ? ` · ${v.pilotoNombre}` : ''}
                  </option>
                ))}
              </select>
            )}
          </Campo>
        )}

        {error && <Aviso tono="danger">{error}</Aviso>}

        <div className="flex justify-end gap-md pt-sm border-t border-white/5">
          <button type="button" className="btn-ghost" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="btn-accent" disabled={guardar.isPending}>
            <Icon name={guardar.isPending ? 'hourglass_empty' : 'local_shipping'} size={18} />
            {guardar.isPending ? 'Asignando…' : 'Asignar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Resumen({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="text-label-caps text-ink-faint uppercase">{etiqueta}</div>
      <div className="text-headline-md text-ink tabular">{valor}</div>
    </div>
  )
}

function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string
  ayuda?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-xs">
      <span className="text-label-caps text-ink-muted uppercase">{etiqueta}</span>
      {children}
      {ayuda && <span className="text-body-sm text-ink-faint">{ayuda}</span>}
    </label>
  )
}

function Aviso({ children, tono = 'warn' }: { children: React.ReactNode; tono?: 'warn' | 'danger' }) {
  const color = tono === 'danger' ? 'text-danger border-danger/30' : 'text-accent-soft border-accent/30'
  return (
    <p className={`text-body-sm rounded-lg border px-md py-sm bg-field ${color}`}>{children}</p>
  )
}
