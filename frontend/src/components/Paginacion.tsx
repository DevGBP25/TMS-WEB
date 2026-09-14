import Icon from './Icon'

const TAMANOS = [25, 50, 100, 200]

interface Props {
  pagina: number
  totalPaginas: number
  total: number
  porPagina: number
  /** Filas realmente dibujadas: la última página casi nunca va llena. */
  enPagina: number
  onPagina: (p: number) => void
  onPorPagina: (n: number) => void
}

export default function Paginacion({
  pagina,
  totalPaginas,
  total,
  porPagina,
  enPagina,
  onPagina,
  onPorPagina,
}: Props) {
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1
  const hasta = desde + enPagina - 1

  return (
    <div className="px-lg py-md border-t border-white/5 flex flex-wrap items-center justify-between gap-md">
      <div className="flex items-center gap-md text-body-sm text-ink-faint">
        <span className="tabular">
          {desde}–{hasta} de {total}
        </span>

        <label className="flex items-center gap-xs">
          <span className="hidden sm:inline">por página</span>
          <select
            className="field py-[2px] w-auto"
            value={porPagina}
            onChange={(e) => onPorPagina(Number(e.target.value))}
            aria-label="Filas por página"
          >
            {TAMANOS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-xs">
        <Paso icono="first_page" etiqueta="Primera" onClick={() => onPagina(1)} inactivo={pagina <= 1} />
        <Paso icono="chevron_left" etiqueta="Anterior" onClick={() => onPagina(pagina - 1)} inactivo={pagina <= 1} />

        <span className="px-md text-body-sm text-ink tabular">
          {pagina} / {totalPaginas || 1}
        </span>

        <Paso icono="chevron_right" etiqueta="Siguiente" onClick={() => onPagina(pagina + 1)} inactivo={pagina >= totalPaginas} />
        <Paso icono="last_page" etiqueta="Última" onClick={() => onPagina(totalPaginas)} inactivo={pagina >= totalPaginas} />
      </div>
    </div>
  )
}

function Paso({
  icono,
  etiqueta,
  onClick,
  inactivo,
}: {
  icono: string
  etiqueta: string
  onClick: () => void
  inactivo: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={inactivo}
      aria-label={etiqueta}
      title={etiqueta}
      className="p-xs rounded-lg text-ink-muted hover:bg-field hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
    >
      <Icon name={icono} size={18} />
    </button>
  )
}
