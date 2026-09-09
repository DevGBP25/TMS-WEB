import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { catalogosApi, viajesApi } from '@/api/viajes'
import { fmtNum, hoy } from '@/utils/fechas'
import Icon from '@/components/Icon'
import PageHeader from '@/components/PageHeader'

interface SapEntrega {
  docEntry: number
  docNum: number
  docDate: string
  cardCode: string
  cardName: string
  address?: string
  docTotal: number
  pesoKg: number
}

export default function Planificar() {
  const navigate = useNavigate()
  const [fecha, setFecha] = useState(hoy())
  const [rutaId, setRutaId] = useState('')
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())

  const disponibles = useQuery({
    queryKey: ['disponibles', fecha],
    queryFn: () => api.get<SapEntrega[]>('/api/viajes/disponibles', { fecha }),
  })

  const rutas = useQuery({ queryKey: ['rutas'], queryFn: () => catalogosApi.rutas() })

  const crear = useMutation({
    mutationFn: () =>
      viajesApi.crear({
        fecha,
        rutaId: rutaId ? Number(rutaId) : undefined,
        sapDocEntries: [...seleccion],
      }),
    onSuccess: (r) => navigate(`/viajes/${r.viajeId}`),
  })

  const alternar = (docEntry: number) =>
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(docEntry)) next.delete(docEntry)
      else next.add(docEntry)
      return next
    })

  const entregas = disponibles.data ?? []
  const todas = entregas.length > 0 && seleccion.size === entregas.length

  const alternarTodas = () =>
    setSeleccion(todas ? new Set() : new Set(entregas.map((e) => e.docEntry)))

  const pesoSel = entregas
    .filter((e) => seleccion.has(e.docEntry))
    .reduce((acc, e) => acc + e.pesoKg, 0)

  const error = (disponibles.error ?? crear.error) as Error | null

  return (
    <>
      <PageHeader
        titulo="Planificar viaje"
        subtitulo="Seleccione las entregas de SAP que formarán el viaje."
      >
        <button
          className="btn-accent"
          disabled={seleccion.size === 0 || crear.isPending}
          onClick={() => crear.mutate()}
        >
          <Icon name="local_shipping" size={18} />
          {crear.isPending ? 'Creando…' : 'Crear viaje'}
        </button>
      </PageHeader>

      {error && (
        <div className="data-card rounded-xl p-md flex items-center gap-sm text-danger">
          <Icon name="error" />
          {error.message}
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-lg flex-1">
        {/* Parámetros del viaje */}
        <aside className="w-full xl:w-[260px] shrink-0 data-card rounded-xl p-md flex flex-col gap-md h-fit">
          <h3 className="text-label-caps text-accent uppercase border-b border-white/5 pb-sm">
            Datos del viaje
          </h3>

          <div>
            <label className="block text-label-caps text-ink-faint uppercase mb-xs">Fecha</label>
            <input
              type="date"
              className="field"
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value)
                setSeleccion(new Set())
              }}
            />
          </div>

          <div>
            <label className="block text-label-caps text-ink-faint uppercase mb-xs">Ruta</label>
            <select className="field" value={rutaId} onChange={(e) => setRutaId(e.target.value)}>
              <option value="">Sin ruta</option>
              {rutas.data?.map((r) => (
                <option key={r.rutaId} value={r.rutaId}>
                  {r.codigo} · {r.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-white/5 pt-md grid grid-cols-2 gap-md">
            <div>
              <div className="text-label-caps text-ink-faint uppercase mb-xs">Entregas</div>
              <div className="text-headline-md text-accent tabular">{seleccion.size}</div>
            </div>
            <div>
              <div className="text-label-caps text-ink-faint uppercase mb-xs">Peso</div>
              <div className="text-headline-md text-ink tabular">{fmtNum(pesoSel, 0)}</div>
            </div>
          </div>
        </aside>

        {/* Entregas disponibles */}
        <div className="flex-1 data-card rounded-xl overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-field/50">
                  <th className="py-sm px-md w-[48px]">
                    <input
                      type="checkbox"
                      checked={todas}
                      onChange={alternarTodas}
                      disabled={entregas.length === 0}
                      className="accent-[var(--color-accent)] w-4 h-4"
                    />
                  </th>
                  {['Entrega', 'Cliente', 'Dirección'].map((h) => (
                    <th
                      key={h}
                      className="py-sm px-md text-label-caps text-ink-faint uppercase font-normal"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="py-sm px-md text-label-caps text-ink-faint uppercase font-normal text-right">
                    Peso (kg)
                  </th>
                  <th className="py-sm px-md text-label-caps text-ink-faint uppercase font-normal text-right">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody className="text-body-sm divide-y divide-white/5">
                {disponibles.isLoading && (
                  <tr>
                    <td colSpan={6} className="py-xl text-center text-ink-faint">
                      Consultando SAP…
                    </td>
                  </tr>
                )}

                {!disponibles.isLoading && entregas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-xl text-center text-ink-faint">
                      No hay entregas disponibles para esta fecha.
                    </td>
                  </tr>
                )}

                {entregas.map((e) => {
                  const marcada = seleccion.has(e.docEntry)
                  return (
                    <tr
                      key={e.docEntry}
                      onClick={() => alternar(e.docEntry)}
                      className={`cursor-pointer transition-colors ${
                        marcada ? 'bg-accent/10' : 'hover:bg-field'
                      }`}
                    >
                      <td className="py-md px-md">
                        <input
                          type="checkbox"
                          checked={marcada}
                          onChange={() => alternar(e.docEntry)}
                          onClick={(ev) => ev.stopPropagation()}
                          className="accent-[var(--color-accent)] w-4 h-4"
                        />
                      </td>
                      <td className="py-md px-md text-mono-data tabular text-ink">{e.docNum}</td>
                      <td className="py-md px-md">
                        <div className="text-ink">{e.cardName}</div>
                        <div className="text-label-caps text-ink-faint uppercase mt-xs">
                          {e.cardCode}
                        </div>
                      </td>
                      <td className="py-md px-md text-ink-muted">{e.address ?? '—'}</td>
                      <td className="py-md px-md text-mono-data text-right tabular">
                        {fmtNum(e.pesoKg)}
                      </td>
                      <td className="py-md px-md text-mono-data text-right tabular">
                        {fmtNum(e.docTotal)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
