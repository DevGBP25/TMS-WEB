import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { entregasApi } from '@/api/entregas'
import { ETIQUETA_VIAJE, viajesApi } from '@/api/viajes'
import { unidadesApi } from '@/api/unidades'
import { useAuth } from '@/auth/AuthContext'
import { fmtFecha, hoy } from '@/utils/fechas'
import Chip from '@/components/Chip'
import Icon from '@/components/Icon'
import PageHeader from '@/components/PageHeader'

/**
 * Lo que el supervisor necesita ver al abrir: qué está detenido, qué está en
 * la calle y con qué flota cuenta. Todo lo demás va en su propia pantalla.
 */
export default function Tablero() {
  const { usuario } = useAuth()

  const resumen = useQuery({ queryKey: ['entregas', 'resumen'], queryFn: entregasApi.resumen })

  const viajes = useQuery({
    queryKey: ['viajes', 'hoy'],
    queryFn: () => viajesApi.listar({ desde: hoy(), hasta: hoy() }),
  })

  const unidades = useQuery({
    queryKey: ['unidades', 'tablero'],
    queryFn: () => unidadesApi.listar(undefined, undefined, true),
  })

  const r = resumen.data
  const delDia = viajes.data ?? []
  const flota = unidades.data ?? []

  const disponibles = flota.filter((u) => u.estado === 'DISPONIBLE').length
  const enRuta = delDia.filter((v) => v.estado === 'EN_RUTA')

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        titulo={`Hola, ${(usuario?.nombre ?? '').split(' ')[0] || 'bienvenido'}`}
        subtitulo={fmtFecha(hoy())}
      >
        <Link to="/entregas" className="btn-accent shrink-0">
          <Icon name="add" size={18} />
          Armar viaje
        </Link>
      </PageHeader>

      {/* Lo primero es lo que espera una decisión. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-md">
        {/* Lo que espera asignación vive en SAP, no en la base: el tablero
            manda a la pantalla que sí lo sabe consultar. */}
        <Tile
          etiqueta="Asignadas"
          valor={r ? String(r.asignadas) : '—'}
          detalle={r ? `${r.sinViaje} sin agrupar` : undefined}
          icono="how_to_reg"
          destacar
          to="/entregas"
        />
        <Tile
          etiqueta="Boletas de SAP"
          valor="ver"
          detalle="disponibles para repartir"
          icono="inventory_2"
          to="/entregas"
        />
        <Tile
          etiqueta="En ruta"
          valor={r ? String(r.enRuta) : '—'}
          detalle={`${enRuta.length} viaje(s)`}
          icono="local_shipping"
          to="/viajes"
        />
        <Tile
          etiqueta="Unidades libres"
          valor={String(disponibles)}
          detalle={`de ${flota.length}`}
          icono="garage"
          to="/unidades"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-lg">
        <div className="xl:col-span-2 data-card rounded-xl overflow-hidden">
          <div className="px-lg py-md border-b border-white/5 flex items-center justify-between">
            <h3 className="text-label-caps text-ink-faint uppercase">Viajes de hoy</h3>
            <Link to="/viajes" className="text-accent-soft hover:underline text-body-sm">
              Ver todos
            </Link>
          </div>

          {viajes.isLoading ? (
            <p className="py-xl text-center text-ink-faint">Cargando…</p>
          ) : delDia.length === 0 ? (
            <div className="py-xl text-center">
              <Icon name="route" size={26} className="text-ink-faint mb-sm" />
              <p className="text-ink-faint">Todavía no hay viajes para hoy.</p>
              <Link to="/entregas" className="btn-accent mt-md inline-flex">
                <Icon name="add" size={18} />
                Armar el primero
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {delDia.map((v) => (
                <li key={v.idViaje}>
                  <Link
                    to={`/viajes/${v.idViaje}`}
                    className="flex items-center gap-md px-lg py-md hover:bg-field transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-sm">
                        <span className="font-medium text-ink">{v.numero}</span>
                        <Chip estado={v.estado} texto={ETIQUETA_VIAJE[v.estado]} />
                      </div>
                      <div className="text-body-sm text-ink-faint mt-xs truncate">
                        {v.pilotoNombre ?? 'Sin piloto'}
                        {v.unidadCodigo ? ` · ${v.unidadCodigo}` : ''}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-ink tabular">
                        {v.entregasCompletadas}
                        <span className="text-ink-faint"> / {v.totalEntregas}</span>
                      </div>
                      <div className="text-label-caps text-ink-faint uppercase">entregas</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="data-card rounded-xl p-lg flex flex-col gap-lg">
          <h3 className="text-label-caps text-ink-faint uppercase">Resultado del reparto</h3>

          {r ? (
            <>
              <Barra etiqueta="Entregadas" valor={r.entregadas} total={r.entregadas + r.rechazadas} tono="ok" />
              <Barra etiqueta="Rechazadas" valor={r.rechazadas} total={r.entregadas + r.rechazadas} tono="danger" />

              <div className="pt-md border-t border-white/5 flex flex-col gap-sm">
                <Linea etiqueta="Asignadas, aún en bodega" valor={r.asignadas} />
                <Linea etiqueta="En la calle" valor={r.enRuta} />
              </div>
            </>
          ) : (
            <p className="text-ink-faint text-body-sm">Cargando…</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Tile({
  etiqueta,
  valor,
  detalle,
  icono,
  destacar,
  to,
}: {
  etiqueta: string
  valor: string
  detalle?: string
  icono: string
  destacar?: boolean
  to: string
}) {
  return (
    <Link
      to={to}
      className={`data-card rounded-xl p-md flex flex-col gap-xs hover:bg-field transition-colors ${
        destacar ? 'border border-accent/30' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-label-caps text-ink-faint uppercase">{etiqueta}</span>
        <Icon name={icono} size={18} className={destacar ? 'text-accent-soft' : 'text-ink-faint'} />
      </div>
      <span className={`text-headline-lg tabular ${destacar ? 'text-accent-soft' : 'text-ink'}`}>
        {valor}
      </span>
      {detalle && <span className="text-body-sm text-ink-faint">{detalle}</span>}
    </Link>
  )
}

function Barra({
  etiqueta,
  valor,
  total,
  tono,
}: {
  etiqueta: string
  valor: number
  total: number
  tono: 'ok' | 'danger'
}) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0
  const color = tono === 'ok' ? 'bg-ok' : 'bg-danger'

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex justify-between text-body-sm">
        <span className="text-ink-muted">{etiqueta}</span>
        <span className="text-ink tabular">
          {valor} <span className="text-ink-faint">· {pct}%</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-field overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex justify-between text-body-sm">
      <span className="text-ink-muted">{etiqueta}</span>
      <span className="text-ink tabular">{valor}</span>
    </div>
  )
}
