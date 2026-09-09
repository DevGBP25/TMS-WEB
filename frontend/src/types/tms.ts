export type EstadoViaje =
  | 'Planificado'
  | 'Asignado'
  | 'EnRuta'
  | 'Entregado'
  | 'Liquidado'
  | 'Cancelado'

export type EstadoParada =
  | 'Pendiente'
  | 'EnSitio'
  | 'Entregada'
  | 'Rechazada'
  | 'Parcial'

export type EstadoUnidad =
  | 'Disponible'
  | 'EnRuta'
  | 'Mantenimiento'
  | 'FueraServicio'

export interface PagedResult<T> {
  items: T[]
  total: number
  pagina: number
  porPagina: number
  totalPaginas: number
}

export interface ViajeListItem {
  viajeId: number
  numero: string
  fecha: string
  estado: EstadoViaje
  estadoNombre: string
  rutaNombre?: string
  unidadPlaca?: string
  pilotoNombre?: string
  pesoKg: number
  totalParadas: number
  paradasEntregadas: number
  avancePct: number
}

export interface Parada {
  paradaId: number
  secuencia: number
  estado: EstadoParada
  estadoNombre: string
  sapDocNum?: number
  clienteCodigo: string
  clienteNombre: string
  direccion?: string
  latitud?: number
  longitud?: number
  pesoKg: number
  monto: number
  llegadaReal?: string
  motivoRechazo?: string
}

export interface ViajeDetalle {
  viajeId: number
  numero: string
  fecha: string
  estado: EstadoViaje
  estadoNombre: string
  rutaId?: number
  rutaNombre?: string
  unidadId?: number
  unidadPlaca?: string
  pilotoId?: number
  pilotoNombre?: string
  salidaProgramada?: string
  salidaReal?: string
  retornoReal?: string
  pesoKg: number
  volumenM3: number
  avancePct: number
  observaciones?: string
  paradas: Parada[]
}

export interface ViajeIndicadores {
  planificados: number
  asignados: number
  enRuta: number
  entregados: number
  paradasPendientes: number
  paradasEntregadas: number
  pesoTotalKg: number
}

export interface Piloto {
  pilotoId: number
  codigo: string
  nombre: string
  licencia?: string
  tipoLicencia?: string
  licenciaVence?: string
  telefono?: string
  activo: boolean
}

export interface Unidad {
  unidadId: number
  codigo: string
  placa: string
  marca?: string
  modelo?: string
  tipo?: string
  capacidadKg: number
  capacidadM3: number
  estado: EstadoUnidad
  transportista?: string
  activo: boolean
}

export interface Ruta {
  rutaId: number
  codigo: string
  nombre: string
  departamento?: string
  municipio?: string
  distanciaKm: number
  duracionMin: number
  activo: boolean
}

export interface ViajeFiltro {
  desde?: string
  hasta?: string
  estado?: EstadoViaje
  rutaId?: number
  pilotoId?: number
  buscar?: string
  pagina?: number
  porPagina?: number
}
