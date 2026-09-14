type Tono = 'ok' | 'warn' | 'danger' | 'info' | 'mute'

/* Un estado del dominio se pinta siempre con el mismo tono, en cualquier
   pantalla: el color es parte del significado, no decoración de la tabla.
   Las claves son los valores que manda la API, tal cual. */
const tonos: Record<string, Tono> = {
  // viaje
  PLANIFICADO: 'info',
  ASIGNADO: 'info',
  ENTREGADO: 'ok',
  LIQUIDADO: 'ok',
  CANCELADO: 'danger',
  // entrega
  SIN_FACTURA: 'mute',
  PENDIENTE: 'info',
  ASIGNADA: 'warn',
  ENTREGADA: 'ok',
  RECHAZADA: 'danger',
  ANULADA: 'mute',
  // unidad
  DISPONIBLE: 'ok',
  MANTENIMIENTO: 'warn',
  FUERA_SERVICIO: 'danger',
  // compartido por viaje y entrega
  EN_RUTA: 'warn',
}

interface ChipProps {
  estado: string
  /** Texto a mostrar si difiere del código de estado. */
  texto?: string
}

export default function Chip({ estado, texto }: ChipProps) {
  const tono = tonos[estado] ?? 'info'
  return <span className={`chip chip-${tono}`}>{texto ?? estado}</span>
}
