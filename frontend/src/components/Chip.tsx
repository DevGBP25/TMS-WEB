import type { EstadoParada, EstadoUnidad, EstadoViaje } from '@/types/tms'

type Tono = 'ok' | 'warn' | 'danger' | 'info'

// Un estado del dominio siempre se pinta con el mismo tono, en cualquier pantalla.
const tonos: Record<string, Tono> = {
  // viaje
  Planificado: 'info',
  Asignado: 'info',
  EnRuta: 'warn',
  Entregado: 'ok',
  Liquidado: 'ok',
  Cancelado: 'danger',
  // parada
  Pendiente: 'info',
  EnSitio: 'warn',
  Entregada: 'ok',
  Rechazada: 'danger',
  Parcial: 'warn',
  // unidad
  Disponible: 'ok',
  Mantenimiento: 'warn',
  FueraServicio: 'danger',
}

interface ChipProps {
  estado: EstadoViaje | EstadoParada | EstadoUnidad | string
  /** Texto a mostrar si difiere del estado (p. ej. el nombre que manda la API). */
  texto?: string
}

export default function Chip({ estado, texto }: ChipProps) {
  const tono = tonos[estado] ?? 'info'
  return <span className={`chip chip-${tono}`}>{texto ?? estado}</span>
}
