/** Fecha de hoy en formato yyyy-MM-dd, en hora local (no UTC). */
export function hoy(): string {
  return aIso(new Date())
}

/** Convierte a yyyy-MM-dd usando los componentes locales, para no perder un día por zona horaria. */
export function aIso(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** dd/MM/yyyy para mostrar; devuelve '—' si no hay valor. */
export function fmtFecha(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-GT')
}

/** dd/MM/yyyy HH:mm para marcas de tiempo. */
export function fmtHora(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function fmtNum(n?: number | null, decimales = 2): string {
  return (n ?? 0).toLocaleString('es-GT', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}
