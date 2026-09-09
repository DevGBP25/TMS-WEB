import { api } from './client'

export type EstadoUnidad = 'DISPONIBLE' | 'EN_RUTA' | 'MANTENIMIENTO' | 'FUERA_SERVICIO'

export interface Unidad {
  idUnidad: number
  codigo: string
  placa?: string
  marca?: string
  modelo?: string
  anio?: number
  tipo?: string
  capacidadKg: number
  capacidadM3: number
  odometroKm: number
  transportista?: string
  estado: EstadoUnidad
  activo: boolean
  fechaCreacion: string
  /** Piloto con turno abierto sobre la unidad, si lo hay. */
  pilotoActual?: string
  turnoDesde?: string
}

export interface GuardarUnidad {
  codigo: string
  placa?: string
  marca?: string
  modelo?: string
  anio?: number | null
  tipo?: string
  capacidadKg: number
  capacidadM3: number
  odometroKm: number
  transportista?: string
  estado: EstadoUnidad
  activo: boolean
}

/** Cómo se lee cada estado en pantalla. */
export const ETIQUETA_ESTADO: Record<EstadoUnidad, string> = {
  DISPONIBLE: 'Disponible',
  EN_RUTA: 'En ruta',
  MANTENIMIENTO: 'Mantenimiento',
  FUERA_SERVICIO: 'Fuera de servicio',
}

export const unidadesApi = {
  listar: (buscar?: string, estado?: string, soloActivas = false) =>
    api.get<Unidad[]>('/api/unidades', { buscar, estado, soloActivas }),

  estados: () => api.get<EstadoUnidad[]>('/api/unidades/estados'),

  crear: (datos: GuardarUnidad) =>
    api.post<{ ok: boolean; idUnidad: number }>('/api/unidades', datos),

  actualizar: (id: number, datos: GuardarUnidad) =>
    api.put<{ ok: boolean }>(`/api/unidades/${id}`, datos),
}
