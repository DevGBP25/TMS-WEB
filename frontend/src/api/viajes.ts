import { api } from './client'
import type { EstadoEntrega } from './entregas'

export type EstadoViaje =
  | 'PLANIFICADO'
  | 'ASIGNADO'
  | 'EN_RUTA'
  | 'ENTREGADO'
  | 'LIQUIDADO'
  | 'CANCELADO'

export interface Viaje {
  idViaje: number
  numero: string
  fecha: string
  estado: EstadoViaje
  pesoKg: number
  totalEntregas: number
  entregasCompletadas: number
  salidaReal?: string
  retornoReal?: string
  observaciones?: string
  fechaCreacion: string
  idUnidad?: number
  unidadCodigo?: string
  unidadPlaca?: string
  idPiloto?: number
  pilotoNombre?: string
}

export interface ViajeCabecera extends Viaje {
  salidaProgramada?: string
  unidadCapacidadKg?: number
  pilotoTelefono?: string
}

export interface ViajeEntrega {
  idEntrega: number
  sapDocNum: number
  sapOrdenVenta?: number
  sapFacturaNum?: number
  clienteCodigo: string
  clienteNombre: string
  direccion?: string
  municipio?: string
  pesoKg: number
  monto: number
  fechaDocumento: string
  estado: EstadoEntrega
  secuencia?: number
  receptor?: string
  motivoRechazo?: string
  entregadaEn?: string
}

export interface ViajeDetalle {
  viaje: ViajeCabecera
  entregas: ViajeEntrega[]
}

export interface Piloto {
  idUsuario: number
  usuario: string
  nombre: string
  telefono?: string
  /** Número del viaje que ya trae ese día, si lo hay. */
  viajeDelDia?: string
}

export interface FiltroViajes {
  buscar?: string
  estado?: string
  desde?: string
  hasta?: string
}

export const ETIQUETA_VIAJE: Record<EstadoViaje, string> = {
  PLANIFICADO: 'Planificado',
  ASIGNADO: 'Asignado',
  EN_RUTA: 'En ruta',
  ENTREGADO: 'Entregado',
  LIQUIDADO: 'Liquidado',
  CANCELADO: 'Cancelado',
}

/** Estados a los que se puede pasar desde cada uno. Refleja el CHECK del procedimiento. */
export const TRANSICIONES: Record<EstadoViaje, EstadoViaje[]> = {
  PLANIFICADO: ['CANCELADO'],
  ASIGNADO: ['EN_RUTA', 'PLANIFICADO', 'CANCELADO'],
  EN_RUTA: ['ENTREGADO'],
  ENTREGADO: ['LIQUIDADO'],
  LIQUIDADO: [],
  CANCELADO: [],
}

export const viajesApi = {
  listar: (filtro: FiltroViajes = {}) => api.get<Viaje[]>('/api/viajes', { ...filtro }),

  obtener: (id: number) => api.get<ViajeDetalle>(`/api/viajes/${id}`),

  pilotos: (fecha?: string) => api.get<Piloto[]>('/api/viajes/pilotos', { fecha }),

  crear: (datos: {
    fecha: string
    idUnidad?: number | null
    idPiloto?: number | null
    observaciones?: string
    entregas?: number[]
  }) => api.post<{ ok: boolean; viajeId: number; numero: string }>('/api/viajes', datos),

  asignarRecursos: (id: number, idUnidad: number, idPiloto: number) =>
    api.post<{ ok: boolean }>(`/api/viajes/${id}/recursos`, { idUnidad, idPiloto }),

  cambiarEstado: (id: number, estado: EstadoViaje, observaciones?: string) =>
    api.post<{ ok: boolean }>(`/api/viajes/${id}/estado`, { estado, observaciones }),
}
