import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ETIQUETA_ENTREGA, entregasApi } from '@/api/entregas'
import { ApiError } from '@/api/client'
import { fmtFecha, fmtFechaHora, fmtHora } from '@/utils/fechas'
import Chip from './Chip'
import Modal from './Modal'
import TablaProductos from './TablaProductos'

interface Props {
  idEntrega: number
  onCerrar: () => void
}

export default function DetalleEntrega({ idEntrega, onCerrar }: Props) {
  const detalle = useQuery({
    queryKey: ['entregas', 'detalle', idEntrega],
    queryFn: () => entregasApi.obtener(idEntrega),
  })

  const e = detalle.data
  const asignada = detalle.data

  return (
    <Modal
      titulo={e ? (e.sapDocNum ? `Boleta ${e.sapDocNum}` : `Orden ${e.sapOrdenVenta}`) : 'Boleta'}
      subtitulo={e?.clienteNombre}
      onCerrar={onCerrar}
      ancho="max-w-[720px]"
    >
      {detalle.isLoading && <p className="text-ink-faint py-lg text-center">Cargando…</p>}

      {detalle.isError && (
        <p className="text-danger py-lg text-center">
          {detalle.error instanceof ApiError
            ? detalle.error.message
            : 'No se pudo cargar la boleta.'}
        </p>
      )}

      {e && (
        <div className="flex flex-col gap-lg">
          <div className="flex items-center gap-md">
            {asignada ? (
              <Chip estado={asignada.estado} texto={ETIQUETA_ENTREGA[asignada.estado]} />
            ) : (
              <span className="chip chip-info">Disponible en SAP</span>
            )}
            <span className="text-body-sm text-ink-faint">
              {fmtFechaHora(e.fechaDocumento, e.horaDocumento)}
            </span>
          </div>

          <Bloque titulo="Documentos en SAP">
            <Campo etiqueta="Orden de venta" valor={e.sapOrdenVenta?.toString() ?? '—'} />
            {/* Se reparte desde la orden, así que la boleta y la factura
                pueden no existir todavía: SAP las emite después. */}
            <Campo
              etiqueta="Boleta de entrega"
              valor={e.sapDocNum?.toString() ?? 'aún no generada en SAP'}
            />
            <Campo
              etiqueta="Factura"
              valor={e.sapFacturaNum?.toString() ?? 'aún no facturada'}
            />
            <Campo etiqueta="Fecha de entrega" valor={fmtFecha(e.fechaEntrega)} />
          </Bloque>

          <Bloque titulo="Destino">
            <Campo etiqueta="Cliente" valor={`${e.clienteCodigo} · ${e.clienteNombre}`} ancho />
            <Campo etiqueta="Dirección" valor={e.direccion ?? '—'} ancho />
            <Campo etiqueta="Municipio" valor={e.municipio ?? '—'} />
          </Bloque>

          {asignada && (
            <Bloque titulo="Quién la lleva">
              <Campo etiqueta="Piloto" valor={asignada.pilotoNombre} />
              <Campo etiqueta="Teléfono" valor={asignada.pilotoTelefono ?? '—'} />
              <Campo etiqueta="Asignada" valor={fmtHora(asignada.asignadaEn)} />

              {asignada.idViaje ? (
                <Campo
                  etiqueta="Viaje"
                  valor={`${asignada.viajeNumero} · ${fmtFecha(asignada.viajeFecha)}`}
                  enlace={`/viajes/${asignada.idViaje}`}
                  onNavegar={onCerrar}
                />
              ) : (
                <Campo etiqueta="Viaje" valor="sin agrupar" />
              )}
            </Bloque>
          )}

          {/* El resultado sólo existe una vez que el piloto lo registra. */}
          {asignada && (asignada.entregadaEn || asignada.motivoRechazo || asignada.receptor) && (
            <Bloque titulo="Resultado">
              <Campo etiqueta="Recibió" valor={asignada.receptor ?? '—'} />
              <Campo etiqueta="Entregada" valor={fmtHora(asignada.entregadaEn)} />
              {asignada.motivoRechazo && (
                <Campo etiqueta="Motivo del rechazo" valor={asignada.motivoRechazo} ancho alerta />
              )}
            </Bloque>
          )}

          <section className="flex flex-col gap-sm">
            <h3 className="text-label-caps text-ink-faint uppercase">
              Productos ({e.productos.length})
            </h3>
            <TablaProductos productos={e.productos} />
          </section>
        </div>
      )}
    </Modal>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-sm">
      <h3 className="text-label-caps text-ink-faint uppercase">{titulo}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md rounded-xl bg-field border border-white/5 p-md">
        {children}
      </div>
    </section>
  )
}

function Campo({
  etiqueta,
  valor,
  ancho,
  alerta,
  enlace,
  onNavegar,
}: {
  etiqueta: string
  valor: string
  ancho?: boolean
  alerta?: boolean
  enlace?: string
  onNavegar?: () => void
}) {
  return (
    <div className={ancho ? 'sm:col-span-2 min-w-0' : 'min-w-0'}>
      <div className="text-label-caps text-ink-faint uppercase">{etiqueta}</div>
      {enlace ? (
        <Link to={enlace} onClick={onNavegar} className="text-accent-soft hover:underline break-words">
          {valor}
        </Link>
      ) : (
        <div className={`break-words ${alerta ? 'text-accent-soft' : 'text-ink'}`}>{valor}</div>
      )}
    </div>
  )
}
