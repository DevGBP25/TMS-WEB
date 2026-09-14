/**
 * Filtro de una columna, en su propio encabezado.
 *
 * Va debajo del título y no dentro, para que el encabezado siga leyéndose
 * como encabezado. Filtra sobre lo que ya está en memoria, así que responde
 * mientras se escribe.
 */
export function FiltroTexto({
  valor,
  onCambio,
  etiqueta,
  ancho = 'w-full',
}: {
  valor: string
  onCambio: (v: string) => void
  /** Para el lector de pantalla: el encabezado visible no basta. */
  etiqueta: string
  ancho?: string
}) {
  return (
    <input
      type="text"
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      placeholder="filtrar…"
      aria-label={`Filtrar por ${etiqueta}`}
      className={`${ancho} mt-xs bg-field border border-field-border rounded-lg px-sm py-[2px]
                  text-body-sm text-ink placeholder:text-ink-faint font-normal normal-case
                  tracking-normal focus:outline-none focus:border-accent/50 transition-colors`}
    />
  )
}

export function FiltroOpciones<T extends string>({
  valor,
  onCambio,
  etiqueta,
  opciones,
}: {
  valor: T
  onCambio: (v: T) => void
  etiqueta: string
  opciones: { valor: T; texto: string }[]
}) {
  return (
    <select
      value={valor}
      onChange={(e) => onCambio(e.target.value as T)}
      aria-label={`Filtrar por ${etiqueta}`}
      className="w-full mt-xs bg-field border border-field-border rounded-lg px-sm py-[2px]
                 text-body-sm text-ink font-normal normal-case tracking-normal
                 focus:outline-none focus:border-accent/50 transition-colors"
    >
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>{o.texto}</option>
      ))}
    </select>
  )
}

/** Compara sin distinguir mayúsculas ni acentos: nadie escribe "Tecpán" con tilde al filtrar. */
export function contiene(texto: string | undefined | null, filtro: string): boolean {
  if (!filtro) return true
  if (!texto) return false
  return normalizar(texto).includes(normalizar(filtro))
}

function normalizar(s: string): string {
  // NFD separa la tilde de la letra; el rango es el de los signos diacríticos.
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
