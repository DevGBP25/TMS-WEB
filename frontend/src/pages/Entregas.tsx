import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ETIQUETA_ENTREGA,
  entregasApi,
  type Entrega,
  type EstadoEntrega,
  type OrdenDisponible,
} from '@/api/entregas'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { aIso, fmtFecha, fmtFechaHora } from '@/utils/fechas'
import Chip from '@/components/Chip'
import Icon from '@/components/Icon'
import PageHeader from '@/components/PageHeader'
import Paginacion from '@/components/Paginacion'
import AsignarPiloto from '@/components/AsignarPiloto'
import AsignarViaje from '@/components/AsignarViaje'
import Confirmar from '@/components/Confirmar'
import DetalleEntrega from '@/components/DetalleEntrega'
import { FiltroOpciones, FiltroTexto, contiene } from '@/components/FiltroColumna'

const th = 'py-sm px-md text-label-caps text-ink-faint uppercase font-normal align-top text-center'

type Vista = 'DISPONIBLES' | 'ASIGNADAS'
type Entrega3 = 'TODAS' | 'SI' | 'NO'

const ESTADOS: (EstadoEntrega | 'TODOS')[] =
  ['ASIGNADA', 'EN_RUTA', 'ENTREGADA', 'RECHAZADA', 'TODOS']

/**
 * Dos mundos en una pantalla, y conviene no confundirlos:
 *
 * · Disponibles son órdenes de venta leídas en vivo de SAP. Nada guardado.
 * · Asignadas es lo que el TMS administra: boletas con piloto y productos.
 */
export default function Entregas() {
  const qc = useQueryClient()
  const { tieneRol } = useAuth()
  const puedeOperar = tieneRol('ADMIN', 'SUPERVISOR', 'DESPACHO')

  const [vista, setVista] = useState<Vista>('DISPONIBLES')
  const [estado, setEstado] = useState<EstadoEntrega | 'TODOS'>('ASIGNADA')

  /* Dos pares de fechas a propósito: las que se escriben y las que se
     consultan. Sin esa separación, cada tecleo en el campo de fecha lanzaba
     una consulta a SAP —incluidas las fechas a medio escribir. */
  const [desdeCampo, setDesdeCampo] = useState(() => aIso(new Date(Date.now() - 7 * 864e5)))
  const [hastaCampo, setHastaCampo] = useState(() => aIso(new Date()))

  const [desde, setDesde] = useState(desdeCampo)
  const [hasta, setHasta] = useState(hastaCampo)

  const rangoSinAplicar = desdeCampo !== desde || hastaCampo !== hasta

  const buscar = () => {
    if (desdeCampo > hastaCampo) {
      setError('La fecha inicial no puede ser posterior a la final.')
      return
    }
    setError(null)
    setDesde(desdeCampo)
    setHasta(hastaCampo)
  }

  /* Los filtros van por columna y trabajan sobre lo que ya está en memoria:
     responden mientras se escribe y no vuelven a molestar a SAP. */
  const [fOrden, setFOrden]         = useState('')
  const [fCliente, setFCliente]     = useState('')
  const [fMunicipio, setFMunicipio] = useState('')
  const [fComentario, setFComent]   = useState('')
  const [fEntrega, setFEntrega]     = useState<Entrega3>('TODAS')
  const [fPiloto, setFPiloto]       = useState('')

  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(50)
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())

  /* Qué se está por hacer, mientras se pregunta. Nulo significa que no hay
     ninguna pregunta abierta. */
  const [confirmando, setConfirmando] = useState<'DESASIGNAR' | 'VINCULAR' | null>(null)

  const [asignandoPiloto, setAsignandoPiloto] = useState(false)
  const [asignandoViaje, setAsignandoViaje] = useState(false)
  const [detalle, setDetalle] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const resumen = useQuery({ queryKey: ['entregas', 'resumen'], queryFn: entregasApi.resumen })

  const disponibles = useQuery({
    queryKey: ['entregas', 'disponibles', desde, hasta],
    queryFn: () => entregasApi.disponibles(desde, hasta),
    enabled: vista === 'DISPONIBLES',
    staleTime: 60_000,
  })

  const asignadas = useQuery({
    queryKey: ['entregas', 'asignadas', estado, pagina, porPagina],
    queryFn: () =>
      entregasApi.listar({
        estado: estado === 'TODOS' ? undefined : estado,
        pagina,
        porPagina,
      }),
    enabled: vista === 'ASIGNADAS',
  })

  const enVistaDisp = vista === 'DISPONIBLES'

  const limpiarFiltros = () => {
    setFOrden(''); setFCliente(''); setFMunicipio(''); setFComent('')
    setFEntrega('TODAS'); setFPiloto('')
  }

  useEffect(() => { setPagina(1); setSeleccion(new Set()); limpiarFiltros() },
    [vista, estado, desde, hasta])

  useEffect(() => { setPagina(1) },
    [fOrden, fCliente, fMunicipio, fComentario, fEntrega, fPiloto, porPagina])

  const ordenesFiltradas = useMemo(() => {
    const todas = disponibles.data ?? []

    return todas.filter((o) =>
      contiene(String(o.sapDocNum), fOrden) &&
      (contiene(o.clienteNombre, fCliente) || contiene(o.clienteCodigo, fCliente)) &&
      contiene(o.municipio, fMunicipio) &&
      contiene(o.comentarios, fComentario) &&
      (fEntrega === 'TODAS' || (fEntrega === 'SI' ? o.tieneEntrega : !o.tieneEntrega)))
  }, [disponibles.data, fOrden, fCliente, fMunicipio, fComentario, fEntrega])

  const totalDisponibles = ordenesFiltradas.length
  const totalPaginasDisp = Math.max(1, Math.ceil(totalDisponibles / porPagina))

  const paginaOrdenes = useMemo(
    () => ordenesFiltradas.slice((pagina - 1) * porPagina, pagina * porPagina),
    [ordenesFiltradas, pagina, porPagina],
  )

  /* Las asignadas vienen paginadas del servidor, así que el filtro por
     columna sólo alcanza a la página visible. Se avisa en pantalla para que
     nadie crea que está filtrando sobre el total. */
  const filasAsignadas = useMemo(() => {
    const todas = asignadas.data?.items ?? []

    return todas.filter((e) =>
      (contiene(e.sapDocNum ? String(e.sapDocNum) : '', fOrden) ||
       contiene(e.sapOrdenVenta ? String(e.sapOrdenVenta) : '', fOrden)) &&
      (contiene(e.clienteNombre, fCliente) || contiene(e.clienteCodigo, fCliente)) &&
      contiene(e.municipio, fMunicipio) &&
      contiene(e.pilotoNombre, fPiloto))
  }, [asignadas.data, fOrden, fCliente, fMunicipio, fPiloto])

  const totalPaginas = enVistaDisp ? totalPaginasDisp : (asignadas.data?.totalPaginas ?? 1)

  useEffect(() => {
    if (totalPaginas > 0 && pagina > totalPaginas) setPagina(totalPaginas)
  }, [totalPaginas, pagina])

  /* Se reparte cualquier orden vigente, tenga entrega o no: los viajes se
     arman uno o más días antes de que SAP genere la boleta. */
  const repartibles = paginaOrdenes

  const elegidasDisp = useMemo(
    () => (disponibles.data ?? []).filter((o) => seleccion.has(o.sapDocEntry)),
    [disponibles.data, seleccion],
  )

  const seleccionablesAsig = useMemo(
    () => filasAsignadas.filter((e) => e.estado === 'ASIGNADA'),
    [filasAsignadas],
  )

  const elegidasAsig = useMemo(
    () => seleccionablesAsig.filter((e) => seleccion.has(e.idEntrega)),
    [seleccionablesAsig, seleccion],
  )

  const elegidas = enVistaDisp ? elegidasDisp.length : elegidasAsig.length

  const marcables = enVistaDisp
    ? repartibles.map((o) => o.sapDocEntry)
    : seleccionablesAsig.map((e) => e.idEntrega)

  const todasMarcadas = marcables.length > 0 && marcables.every((id) => seleccion.has(id))

  /* Las boletas repartidas antes de que existiera la entrega no saben su
     número ni su factura hasta que alguien las vuelve a cruzar con SAP. Es
     una consulta cara —trae líneas— así que se lanza a pedido. */
  const vincular = useMutation({
    mutationFn: () => entregasApi.vincular(),
    onSuccess: (r) => {
      setError(null)
      setAviso(
        r.afectadas > 0
          ? `${r.afectadas} boleta(s) completadas con su documento de SAP.`
          : 'Ninguna boleta pendiente tiene todavía su entrega en SAP.',
      )
      qc.invalidateQueries({ queryKey: ['entregas'] })
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'No se pudo consultar SAP.'),
  })

  const liberar = useMutation({
    mutationFn: (ids: number[]) => entregasApi.liberar(ids),
    onSuccess: (r) => {
      setError(null)
      setAviso(`${r.afectadas} boleta(s) desasignadas: vuelven a la lista de órdenes de SAP.`)
      setSeleccion(new Set())
      qc.invalidateQueries({ queryKey: ['entregas'] })
      qc.invalidateQueries({ queryKey: ['viajes'] })
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'No se pudo liberar la boleta.'),
  })

  const alternar = (id: number) =>
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const alternarTodas = () =>
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (todasMarcadas) marcables.forEach((id) => next.delete(id))
      else marcables.forEach((id) => next.add(id))
      return next
    })

  const r = resumen.data
  const consulta = enVistaDisp ? disponibles : asignadas
  const columnas = puedeOperar ? 9 : 8

  return (
    <div className="flex flex-col gap-lg pb-2xl">
      <PageHeader
        titulo="Entregas"
        subtitulo={
          enVistaDisp
            ? 'Órdenes de venta de SAP pendientes de repartir'
            : 'Boletas que el TMS administra'
        }
      >
        {enVistaDisp ? (
          <button
            className="btn-ghost shrink-0"
            onClick={() => disponibles.refetch()}
            disabled={disponibles.isFetching}
            title="Vuelve a leer SAP"
          >
            <Icon name={disponibles.isFetching ? 'hourglass_empty' : 'sync'} size={18} />
            {disponibles.isFetching ? 'Leyendo SAP…' : 'Actualizar'}
          </button>
        ) : (
          <button
            className="btn-ghost shrink-0"
            onClick={() => setConfirmando('VINCULAR')}
            disabled={vincular.isPending}
            title="Traer boletas de SAP: busca la boleta y la factura de lo que se repartió por anticipado"
          >
            <Icon name={vincular.isPending ? 'hourglass_empty' : 'sync'} size={18} />
            {vincular.isPending ? 'Consultando SAP…' : 'Traer boletas de SAP'}
          </button>
        )}
      </PageHeader>

      {aviso && <Banda tono="info" texto={aviso} onCerrar={() => setAviso(null)} />}
      {error && <Banda tono="danger" texto={error} onCerrar={() => setError(null)} />}

      <div className="flex gap-xs p-xs rounded-xl bg-field border border-white/5 w-full md:w-auto md:self-start">
        <Pestana activa={enVistaDisp} onClick={() => setVista('DISPONIBLES')}>
          Órdenes de venta
          {enVistaDisp && totalDisponibles > 0 && (
            <span className="ml-xs opacity-70">({totalDisponibles})</span>
          )}
        </Pestana>
        <Pestana activa={!enVistaDisp} onClick={() => setVista('ASIGNADAS')}>
          Asignadas
          {r && <span className="ml-xs opacity-70">({r.asignadas + r.enRuta})</span>}
        </Pestana>
      </div>

      {!enVistaDisp && r && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-md">
          <Tarjeta etiqueta="Asignadas" valor={r.asignadas} tono="info" destacar />
          <Tarjeta etiqueta="Sin agrupar" valor={r.sinViaje} tono="mute" />
          <Tarjeta etiqueta="En ruta" valor={r.enRuta} tono="warn" />
          <Tarjeta etiqueta="Entregadas" valor={r.entregadas} tono="ok" />
          <Tarjeta etiqueta="Rechazadas" valor={r.rechazadas} tono="danger" />
        </div>
      )}

      {enVistaDisp ? (
        <form
          className="flex flex-wrap items-end gap-md"
          onSubmit={(ev) => { ev.preventDefault(); buscar() }}
        >
          <Fecha etiqueta="Desde" valor={desdeCampo} onCambio={setDesdeCampo} />
          <Fecha etiqueta="Hasta" valor={hastaCampo} onCambio={setHastaCampo} />

          <button
            type="submit"
            className={rangoSinAplicar ? 'btn-accent' : 'btn-ghost'}
            disabled={disponibles.isFetching}
          >
            <Icon name={disponibles.isFetching ? 'hourglass_empty' : 'search'} size={18} />
            {disponibles.isFetching ? 'Consultando…' : 'Buscar'}
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-xs">
          {ESTADOS.map((f) => (
            <button
              key={f}
              onClick={() => setEstado(f)}
              className={`px-md py-xs rounded-lg text-label-caps uppercase transition-colors ${
                estado === f ? 'bg-accent text-on-accent' : 'bg-field text-ink-muted hover:text-ink'
              }`}
            >
              {f === 'TODOS' ? 'Todas' : ETIQUETA_ENTREGA[f]}
            </button>
          ))}
        </div>
      )}

      {enVistaDisp && rangoSinAplicar && (
        <p className="text-body-sm text-accent-soft">
          La tabla todavía muestra el rango anterior. Pulse «Buscar» para aplicar las fechas.
        </p>
      )}

      <div className="data-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5">
                {puedeOperar && (
                  <th className={`${th} w-10`}>
                    {marcables.length > 0 && (
                      <input
                        type="checkbox"
                        checked={todasMarcadas}
                        onChange={alternarTodas}
                        aria-label="Seleccionar todas las de esta página"
                      />
                    )}
                  </th>
                )}

                {/* El número no pasa de siete dígitos: la columna se ajusta a
                    su contenido en vez de repartirse el ancho sobrante. */}
                <th className={`${th} w-[7rem]`}>
                  {enVistaDisp ? 'Orden venta' : 'Boleta'}
                  <FiltroTexto
                    valor={fOrden}
                    onCambio={setFOrden}
                    etiqueta={enVistaDisp ? 'orden de venta' : 'boleta'}
                  />
                </th>

                <th className={`${th} min-w-[14rem]`}>
                  Cliente
                  <FiltroTexto valor={fCliente} onCambio={setFCliente} etiqueta="cliente" />
                </th>

                {enVistaDisp && (
                  <th className={`${th} w-[17rem] hidden lg:table-cell`}>
                    Comentarios
                    <FiltroTexto
                      valor={fComentario}
                      onCambio={setFComent}
                      etiqueta="comentarios"
                    />
                  </th>
                )}

                <th className={`${th} min-w-[9rem] hidden xl:table-cell`}>
                  Municipio
                  <FiltroTexto valor={fMunicipio} onCambio={setFMunicipio} etiqueta="municipio" />
                </th>

                {enVistaDisp ? (
                  <th className={`${th} min-w-[8rem]`}>
                    Entrega
                    <FiltroOpciones
                      valor={fEntrega}
                      onCambio={setFEntrega}
                      etiqueta="si tiene entrega"
                      opciones={[
                        { valor: 'TODAS', texto: 'Todas' },
                        { valor: 'SI', texto: 'Con entrega' },
                        { valor: 'NO', texto: 'Sin entrega' },
                      ]}
                    />
                  </th>
                ) : (
                  <>
                    <th className={`${th} min-w-[10rem]`}>
                      Piloto
                      <FiltroTexto valor={fPiloto} onCambio={setFPiloto} etiqueta="piloto" />
                    </th>
                    <th className={th}>Estado</th>
                  </>
                )}

                {/* Dos fechas distintas: cuándo se hizo el documento y para
                    cuándo se comprometió la entrega. */}
                <th className={`${th} hidden lg:table-cell`}>Fecha</th>
                <th className={`${th} hidden lg:table-cell`}>Fecha entrega</th>
              </tr>
            </thead>

            <tbody className="text-body-sm divide-y divide-white/5">
              {consulta.isLoading && (
                <tr>
                  <td colSpan={columnas} className="py-xl text-center text-ink-faint">
                    {enVistaDisp ? 'Consultando SAP…' : 'Cargando…'}
                  </td>
                </tr>
              )}

              {consulta.isError && (
                <tr>
                  <td colSpan={columnas} className="py-xl text-center">
                    <Icon name="error" size={26} className="text-danger mb-sm" />
                    <p className="text-danger">
                      {enVistaDisp ? 'No se pudo consultar SAP.' : 'No se pudo cargar el listado.'}
                    </p>
                    <p className="text-body-sm text-ink-faint mt-xs max-w-[42rem] mx-auto">
                      {consulta.error instanceof ApiError
                        ? consulta.error.message
                        : 'Error inesperado.'}
                    </p>
                    <button className="btn-ghost mt-md inline-flex" onClick={() => consulta.refetch()}>
                      <Icon name="refresh" size={18} />
                      Reintentar
                    </button>
                  </td>
                </tr>
              )}

              {!consulta.isLoading && !consulta.isError &&
                (enVistaDisp ? paginaOrdenes.length : filasAsignadas.length) === 0 && (
                <tr>
                  <td colSpan={columnas} className="py-xl text-center">
                    <Icon name="inventory_2" size={26} className="text-ink-faint mb-sm" />
                    <p className="text-ink-faint">
                      {enVistaDisp
                        ? 'No hay órdenes de venta sin repartir en ese rango.'
                        : 'No hay boletas que coincidan.'}
                    </p>
                    {enVistaDisp && (
                      <p className="text-body-sm text-ink-faint mt-xs">
                        Pruebe ampliando las fechas: la lista sólo mira el rango indicado.
                      </p>
                    )}
                  </td>
                </tr>
              )}

              {enVistaDisp
                ? paginaOrdenes.map((o) => (
                    <FilaOrden
                      key={o.sapDocEntry}
                      orden={o}
                      puedeOperar={puedeOperar}
                      marcada={seleccion.has(o.sapDocEntry)}
                      onAlternar={() => alternar(o.sapDocEntry)}
                    />
                  ))
                : filasAsignadas.map((e) => (
                    <FilaAsignada
                      key={e.idEntrega}
                      entrega={e}
                      puedeOperar={puedeOperar}
                      marcada={seleccion.has(e.idEntrega)}
                      onAlternar={() => alternar(e.idEntrega)}
                      onAbrir={() => setDetalle(e.idEntrega)}
                    />
                  ))}
            </tbody>
          </table>
        </div>

        {(enVistaDisp ? totalDisponibles : (asignadas.data?.total ?? 0)) > 0 && (
          <Paginacion
            pagina={pagina}
            totalPaginas={totalPaginas}
            total={enVistaDisp ? totalDisponibles : (asignadas.data?.total ?? 0)}
            porPagina={porPagina}
            enPagina={enVistaDisp ? paginaOrdenes.length : filasAsignadas.length}
            onPagina={setPagina}
            onPorPagina={setPorPagina}
          />
        )}
      </div>

      {!enVistaDisp && (fOrden || fCliente || fMunicipio || fPiloto) && (
        <p className="text-body-sm text-ink-faint">
          Los filtros de columna se aplican sobre la página que se está viendo. Para
          buscar en todo el histórico use el rango de fechas o cambie de estado.
        </p>
      )}

      {elegidas > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:pl-rail z-40">
          <div className="m-md data-card rounded-xl border border-accent/30 px-lg py-md flex flex-wrap items-center gap-lg shadow-2xl">
            <div className="flex gap-lg flex-1 min-w-0">
              <Dato
                etiqueta={enVistaDisp ? 'Órdenes' : 'Boletas'}
                valor={String(elegidas)}
              />
            </div>

            <div className="flex flex-wrap gap-md">
              <button className="btn-ghost" onClick={() => setSeleccion(new Set())}>
                Limpiar
              </button>

              {enVistaDisp ? (
                <button className="btn-accent" onClick={() => setAsignandoPiloto(true)}>
                  <Icon name="how_to_reg" size={18} />
                  Asignar piloto
                </button>
              ) : (
                <>
                  <button
                    className="btn-ghost"
                    onClick={() => setConfirmando('DESASIGNAR')}
                    disabled={liberar.isPending}
                    title="Quita el piloto y la orden vuelve a la lista de SAP"
                  >
                    <Icon name="person_remove" size={18} />
                    Desasignar
                  </button>
                  <button className="btn-ghost" onClick={() => setAsignandoPiloto(true)}>
                    <Icon name="swap_horiz" size={18} />
                    Cambiar piloto
                  </button>
                  <button className="btn-accent" onClick={() => setAsignandoViaje(true)}>
                    <Icon name="local_shipping" size={18} />
                    Agrupar en viaje
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmando === 'DESASIGNAR' && (
        <Confirmar
          titulo="Desasignar boletas"
          tono="danger"
          textoAceptar="Sí, desasignar"
          mensaje={
            <>
              Se quitará el piloto de {elegidasAsig.length} boleta(s) y volverán a la
              lista de órdenes de venta de SAP.
            </>
          }
          detalle={
            /* Los números, para que se revise la selección antes de aceptar y
               no después. Más de seis no caben, y ahí el total ya dice más. */
            elegidasAsig.length <= 6
              ? elegidasAsig.map((e) => e.sapDocNum ?? `OV ${e.sapOrdenVenta}`).join(', ')
              : `${elegidasAsig.length} boletas seleccionadas`
          }
          cargando={liberar.isPending}
          onConfirmar={() => {
            setConfirmando(null)
            liberar.mutate(elegidasAsig.map((e) => e.idEntrega))
          }}
          onCancelar={() => setConfirmando(null)}
        />
      )}

      {confirmando === 'VINCULAR' && (
        <Confirmar
          titulo="Traer boletas de SAP"
          textoAceptar="Sí, consultar"
          mensaje="Se buscará en SAP la boleta y la factura de lo que se repartió por anticipado, y se guardarán en las boletas que ya las tengan emitidas."
          detalle="La consulta a SAP puede tardar."
          cargando={vincular.isPending}
          onConfirmar={() => { setConfirmando(null); vincular.mutate() }}
          onCancelar={() => setConfirmando(null)}
        />
      )}

      {asignandoPiloto && (
        <AsignarPiloto
          modo={enVistaDisp ? 'ASIGNAR' : 'CAMBIAR'}
          ids={
            enVistaDisp
              ? elegidasDisp.map((o) => o.sapDocEntry)
              : elegidasAsig.map((e) => e.idEntrega)
          }
          onCerrar={() => setAsignandoPiloto(false)}
          onListo={(mensaje) => {
            setAsignandoPiloto(false)
            setSeleccion(new Set())
            setError(null)
            setAviso(mensaje)
          }}
        />
      )}

      {asignandoViaje && (
        <AsignarViaje
          ids={elegidasAsig.map((e) => e.idEntrega)}
          onCerrar={() => setAsignandoViaje(false)}
          onListo={(mensaje) => {
            setAsignandoViaje(false)
            setSeleccion(new Set())
            setError(null)
            setAviso(mensaje)
          }}
        />
      )}

      {detalle !== null && (
        <DetalleEntrega idEntrega={detalle} onCerrar={() => setDetalle(null)} />
      )}
    </div>
  )
}

function FilaOrden({
  orden: o,
  puedeOperar,
  marcada,
  onAlternar,
}: {
  orden: OrdenDisponible
  puedeOperar: boolean
  marcada: boolean
  onAlternar: () => void
}) {
  return (
    <tr className={`transition-colors ${marcada ? 'bg-accent/10' : 'hover:bg-field'}`}>
      {puedeOperar && (
        <td className="py-md px-md">
          <input
            type="checkbox"
            checked={marcada}
            onChange={onAlternar}
            aria-label={`Seleccionar la orden ${o.sapDocNum}`}
          />
        </td>
      )}

      <td className="py-md px-md font-medium text-ink tabular whitespace-nowrap">{o.sapDocNum}</td>

      <td className="py-md px-md">
        <div className="text-ink">{o.clienteNombre}</div>
        {o.direccion && (
          <div className="text-label-caps text-ink-faint mt-xs truncate max-w-[18rem]">
            {o.direccion}
          </div>
        )}
      </td>

      <td className="py-md px-md text-ink-muted hidden lg:table-cell align-top">
        <Comentario texto={o.comentarios} orden={o.sapDocNum} />
      </td>

      <td className="py-md px-md text-ink-muted hidden xl:table-cell">{o.municipio ?? '—'}</td>

      <td className="py-md px-md whitespace-nowrap">
        {o.tieneEntrega ? (
          <span className="chip chip-ok">Con entrega</span>
        ) : (
          <span className="chip chip-mute">Sin entrega</span>
        )}
      </td>

      <td className="py-md px-md text-ink-muted whitespace-nowrap hidden lg:table-cell tabular">
        {fmtFechaHora(o.fechaDocumento, o.horaDocumento)}
      </td>

      <td className="py-md px-md text-ink-muted whitespace-nowrap hidden lg:table-cell tabular">
        {fmtFecha(o.fechaEntrega)}
      </td>
    </tr>
  )
}

function FilaAsignada({
  entrega: e,
  puedeOperar,
  marcada,
  onAlternar,
  onAbrir,
}: {
  entrega: Entrega
  puedeOperar: boolean
  marcada: boolean
  onAlternar: () => void
  onAbrir: () => void
}) {
  return (
    <tr className={`transition-colors ${marcada ? 'bg-accent/10' : 'hover:bg-field'}`}>
      {puedeOperar && (
        <td className="py-md px-md">
          {e.estado === 'ASIGNADA' && (
            <input
              type="checkbox"
              checked={marcada}
              onChange={onAlternar}
              aria-label={`Seleccionar la boleta ${e.sapDocNum}`}
            />
          )}
        </td>
      )}

      <td className="py-md px-md whitespace-nowrap">
        {/* El title reemplaza al texto como nombre accesible, así que lleva el
            número: sin él, la tabla anuncia una fila de botones idénticos. */}
        <button
          onClick={onAbrir}
          className="font-medium text-accent-soft hover:underline tabular"
          title={
            e.sapDocNum
              ? `Ver el detalle de la boleta ${e.sapDocNum}`
              : `Ver el detalle de la orden ${e.sapOrdenVenta}`
          }
        >
          {/* Mientras SAP no genere la entrega, la orden es el único número
              que existe. Se muestra en su lugar en vez de dejar un hueco. */}
          {e.sapDocNum ?? `OV ${e.sapOrdenVenta}`}
        </button>
        {e.sapDocNum && e.sapOrdenVenta && (
          <div className="text-label-caps text-ink-faint mt-xs">OV {e.sapOrdenVenta}</div>
        )}
        {!e.sapDocNum && (
          <div className="text-label-caps text-ink-faint mt-xs">sin boleta aún</div>
        )}
      </td>

      <td className="py-md px-md">
        <div className="text-ink">{e.clienteNombre}</div>
        {e.direccion && (
          <div className="text-label-caps text-ink-faint mt-xs truncate max-w-[18rem]">
            {e.direccion}
          </div>
        )}
      </td>

      <td className="py-md px-md text-ink-muted hidden xl:table-cell">{e.municipio ?? '—'}</td>

      <td className="py-md px-md whitespace-nowrap">{e.pilotoNombre}</td>

      <td className="py-md px-md">
        <Chip estado={e.estado} texto={ETIQUETA_ENTREGA[e.estado]} />
        {e.idViaje && (
          <Link
            to={`/viajes/${e.idViaje}`}
            className="block text-label-caps text-accent-soft hover:underline mt-xs"
          >
            {e.viajeNumero}
          </Link>
        )}
      </td>

      <td className="py-md px-md text-ink-muted whitespace-nowrap hidden lg:table-cell tabular">
        {fmtFechaHora(e.fechaDocumento, e.horaDocumento)}
      </td>

      <td className="py-md px-md text-ink-muted whitespace-nowrap hidden lg:table-cell tabular">
        {fmtFecha(e.fechaEntrega)}
      </td>
    </tr>
  )
}

/**
 * Comentario de la orden.
 *
 * Vienen largos —orden de compra, sucursal, instrucciones de reparto— y
 * recortados a dos líneas se pierde justo la parte que el despachador
 * necesita. Se abren en su sitio y no en un globo al pasar el ratón: un
 * globo tapa la fila de abajo, se va solo y no se puede copiar.
 */
function Comentario({ texto, orden }: { texto?: string; orden: number }) {
  const [abierto, setAbierto] = useState(false)
  const [recortado, setRecortado] = useState(false)
  const parrafo = useRef<HTMLParagraphElement>(null)

  /* Si sobra texto no depende de cuántas letras tenga, sino de cuántas caben
     en el ancho de la columna: se mide en pantalla. Cuando está abierto no se
     mide, porque sin recorte el contenido siempre cabe y el botón para
     volver a cerrarlo desaparecería. */
  useLayoutEffect(() => {
    const el = parrafo.current
    if (!el || abierto) return
    setRecortado(el.scrollHeight > el.clientHeight + 1)
  }, [texto, abierto])

  if (!texto) return <span className="text-ink-faint">—</span>

  return (
    <div className="w-[16rem] max-w-full flex flex-col items-start gap-xs">
      <p ref={parrafo} className={abierto ? 'whitespace-pre-line' : 'line-clamp-2'}>{texto}</p>

      {recortado && (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="text-label-caps uppercase text-accent-soft hover:underline"
          aria-expanded={abierto}
          /* Sin la orden en el nombre, la tabla anuncia veinte botones
             llamados igual. */
          aria-label={`${abierto ? 'Ocultar' : 'Ver'} el comentario de la orden ${orden}`}
        >
          {abierto ? 'ver menos' : 'ver más'}
        </button>
      )}
    </div>
  )
}

function Pestana({
  activa,
  onClick,
  children,
}: {
  activa: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 md:flex-none md:px-xl py-sm rounded-lg text-label-caps uppercase transition-colors ${
        activa ? 'bg-accent text-on-accent' : 'text-ink-muted hover:bg-elevated/50'
      }`}
    >
      {children}
    </button>
  )
}

function Fecha({
  etiqueta,
  valor,
  onCambio,
}: {
  etiqueta: string
  valor: string
  onCambio: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-xs">
      <span className="text-label-caps text-ink-faint uppercase">{etiqueta}</span>
      <input
        type="date"
        className="field w-auto"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
      />
    </label>
  )
}

function Tarjeta({
  etiqueta,
  valor,
  tono,
  destacar,
}: {
  etiqueta: string
  valor: number
  tono: 'ok' | 'warn' | 'danger' | 'info' | 'mute'
  destacar?: boolean
}) {
  const color = {
    ok: 'text-ok',
    warn: 'text-accent-soft',
    danger: 'text-danger',
    info: 'text-info',
    mute: 'text-ink-faint',
  }[tono]

  return (
    <div className={`data-card rounded-xl px-md py-md ${destacar ? 'border border-accent/30' : ''}`}>
      <div className="text-label-caps text-ink-faint uppercase">{etiqueta}</div>
      <div className={`text-headline-lg tabular ${color}`}>{valor}</div>
    </div>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="text-label-caps text-ink-faint uppercase">{etiqueta}</div>
      <div className="text-body-lg text-ink tabular">{valor}</div>
    </div>
  )
}

function Banda({
  tono,
  texto,
  onCerrar,
}: {
  tono: 'info' | 'danger'
  texto: string
  onCerrar: () => void
}) {
  const color = tono === 'danger' ? 'border-danger/30 text-danger' : 'border-info/30 text-info'

  return (
    <div className={`data-card rounded-xl border ${color} px-lg py-md flex items-start gap-md`}>
      <Icon name={tono === 'danger' ? 'error' : 'info'} size={18} />
      <p className="text-body-sm flex-1">{texto}</p>
      <button onClick={onCerrar} className="text-ink-faint hover:text-ink" aria-label="Cerrar aviso">
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
