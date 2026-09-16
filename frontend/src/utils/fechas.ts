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

/** Zona de la operación. Fija a propósito: la bodega está en Guatemala y la
 *  hora de una entrega significa lo mismo se mire desde donde se mire. */
const ZONA = 'America/Guatemala'

/**
 * dd/MM/yyyy para fechas sin hora: fecha del viaje, del documento de SAP,
 * vencimiento de licencia.
 *
 * Se parte el texto en vez de construir una fecha, porque un 2026-08-18 leído
 * como instante es medianoche UTC, y en Guatemala eso es todavía el 17.
 */
export function fmtFecha(iso?: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

/**
 * dd/MM/yyyy HH:mm para un documento de SAP, que manda la fecha y la hora en
 * campos separados y ya en hora local: aquí no hay nada que convertir.
 */
export function fmtFechaHora(fecha?: string | null, hora?: string | null): string {
  const f = fmtFecha(fecha)
  if (f === '—' || !hora) return f

  // "11:12:00" → "11:12". Los segundos no le dicen nada a nadie en una tabla.
  const m = /^(\d{2}):(\d{2})/.exec(hora)
  return m ? `${f} ${m[1]}:${m[2]}` : f
}

/**
 * dd/MM/yyyy HH:mm para marcas de tiempo, en hora de Guatemala.
 *
 * La base las guarda en UTC con SYSUTCDATETIME() y la API las manda sin
 * indicar zona. Sin la Z, el navegador las toma por hora local y las muestra
 * seis horas adelantadas.
 */
export function fmtHora(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(enUtc(iso))
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-GT', {
    timeZone: ZONA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Marca como UTC lo que viene sin zona; respeta lo que ya la trae. */
export function enUtc(iso: string): string {
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`
}

export function fmtNum(n?: number | null, decimales = 2): string {
  return (n ?? 0).toLocaleString('es-GT', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}
