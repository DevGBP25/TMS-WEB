import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { entregasApi } from '@/api/entregas'
import { viajesApi } from '@/api/viajes'
import { ApiError } from '@/api/client'
import { hoy } from '@/utils/fechas'
import Icon from './Icon'
import Modal from './Modal'

interface Props {
  /**
   * Al repartir, los DocEntry de las órdenes de venta; al cambiar de piloto,
   * los id de las boletas que ya están en el TMS. Son dos mundos distintos y
   * por eso el modo viene aparte en vez de adivinarse.
   */
  ids: number[]
  modo: 'ASIGNAR' | 'CAMBIAR'
  onCerrar: () => void
  onListo: (mensaje: string) => void
}

/**
 * Pone boletas en manos de un piloto, sea la primera vez o un cambio.
 *
 * Repartir es el momento en que la orden deja de ser una lectura de SAP y
 * pasa a existir en el TMS. Cambiar de piloto no mueve nada de eso: la
 * boleta es la misma, con sus productos y su historia; sólo cambia de manos.
 */
export default function AsignarPiloto({ ids, modo, onCerrar, onListo }: Props) {
  const cambio = modo === 'CAMBIAR' 
  const qc = useQueryClient()

  const [idPiloto, setIdPiloto] = useState('')
  const [error, setError] = useState<string | null>(null)

  /* La carga del día se consulta para avisar de quién ya va cargado. No
     bloquea nada: quién aguanta más lo sabe el supervisor. */
  const pilotos = useQuery({
    queryKey: ['pilotos', hoy()],
    queryFn: () => viajesApi.pilotos(hoy()),
  })

  const guardar = useMutation({
    mutationFn: async () => {
      if (!idPiloto) throw new ApiError('Elija el piloto.', 400)

      const r = cambio
        ? await entregasApi.cambiarPiloto(Number(idPiloto), ids)
        : await entregasApi.asignarPiloto(Number(idPiloto), ids)

      const p = pilotos.data?.find((x) => String(x.idUsuario) === idPiloto)
      const quien = p?.nombre ?? 'el piloto'

      return cambio
        ? `${r.afectadas} boleta(s) pasaron a ${quien}.`
        : `${r.afectadas} boleta(s) asignadas a ${quien}.`
    },
    onSuccess: (mensaje) => {
      qc.invalidateQueries({ queryKey: ['entregas'] })
      qc.invalidateQueries({ queryKey: ['viajes'] })
      onListo(mensaje)
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'No se pudo cambiar el piloto.'),
  })

  return (
    <Modal
      titulo={cambio ? 'Cambiar de piloto' : 'Asignar piloto'}
      subtitulo={
        cambio
          ? 'La boleta sigue siendo la misma: sólo cambia de manos.'
          : 'Se guarda la orden con sus productos. La boleta y la factura se traen de SAP cuando existan.'
      }
      onCerrar={onCerrar}
    >
      <form
        className="flex flex-col gap-lg"
        onSubmit={(ev) => { ev.preventDefault(); setError(null); guardar.mutate() }}
      >
        <div className="rounded-xl bg-field border border-white/5 p-md flex flex-wrap gap-lg">
          <Dato etiqueta={cambio ? 'Boletas' : 'Órdenes'} valor={String(ids.length)} />
        </div>

        <label className="flex flex-col gap-xs">
          <span className="text-label-caps text-ink-muted uppercase">Piloto</span>

          {pilotos.isLoading ? (
            <p className="text-body-sm text-ink-faint">Cargando pilotos…</p>
          ) : (pilotos.data ?? []).length === 0 ? (
            <p className="text-body-sm text-ink-faint">
              No hay usuarios con rol PILOTO. Créelos primero en Usuarios.
            </p>
          ) : (
            <select
              className="field"
              value={idPiloto}
              onChange={(e) => setIdPiloto(e.target.value)}
              required
              autoFocus
            >
              <option value="">Elija un piloto…</option>
              {(pilotos.data ?? []).map((p) => (
                <option key={p.idUsuario} value={p.idUsuario}>
                  {p.nombre}
                  {p.viajeDelDia ? ` — hoy lleva ${p.viajeDelDia}` : ''}
                </option>
              ))}
            </select>
          )}
        </label>

        {error && (
          <p className="text-body-sm text-danger rounded-lg border border-danger/30 bg-field px-md py-sm">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-md pt-sm border-t border-white/5">
          <button type="button" className="btn-ghost" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="btn-accent" disabled={guardar.isPending}>
            <Icon
              name={guardar.isPending ? 'hourglass_empty' : cambio ? 'swap_horiz' : 'how_to_reg'}
              size={18}
            />
            {guardar.isPending
              ? cambio ? 'Cambiando…' : 'Asignando…'
              : cambio ? 'Cambiar' : 'Asignar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="text-label-caps text-ink-faint uppercase">{etiqueta}</div>
      <div className="text-headline-md text-ink tabular">{valor}</div>
    </div>
  )
}
