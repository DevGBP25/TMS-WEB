import type { Producto } from '@/api/entregas'
import { fmtNum } from '@/utils/fechas'

/**
 * Los productos que lleva la boleta. Es lo que el piloto va a descargar,
 * así que el código y la cantidad pesan más que la descripción.
 */
export default function TablaProductos({ productos }: { productos: Producto[] }) {
  if (productos.length === 0) {
    return <p className="text-body-sm text-ink-faint">La boleta no trae líneas de producto.</p>
  }

  return (
    <div className="rounded-xl bg-field border border-white/5 overflow-hidden">
      <div className="overflow-x-auto max-h-[18rem] overflow-y-auto">
        <table className="w-full text-left text-body-sm">
          <thead className="sticky top-0 bg-field">
            <tr className="border-b border-white/5">
              <th className="py-sm px-md text-label-caps text-ink-faint uppercase font-normal">
                Artículo
              </th>
              <th className="py-sm px-md text-label-caps text-ink-faint uppercase font-normal">
                Descripción
              </th>
              <th className="py-sm px-md text-label-caps text-ink-faint uppercase font-normal text-right whitespace-nowrap">
                Cantidad
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/5">
            {productos.map((p) => (
              <tr key={p.lineaNum}>
                <td className="py-sm px-md text-ink whitespace-nowrap align-top">
                  {p.codigoArticulo}
                  {p.codigoBarras && (
                    <div className="text-label-caps text-ink-faint mt-xs">{p.codigoBarras}</div>
                  )}
                </td>

                <td className="py-sm px-md text-ink-muted align-top">{p.descripcion}</td>

                <td className="py-sm px-md text-right tabular text-ink whitespace-nowrap align-top">
                  {fmtNum(p.cantidad, esEntero(p.cantidad) ? 0 : 2)}
                  {p.unidad && <span className="text-ink-faint"> {p.unidad}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* Las cantidades suelen ser enteras; mostrar "15.00" unidades es ruido. */
function esEntero(n: number): boolean {
  return Number.isInteger(n)
}
