import { api } from './client'

/**
 * Estados de una boleta dentro del TMS.
 *
 * No hay "pendiente" ni "sin factura": esas boletas no se guardan, se leen
 * de SAP. Una fila en la tabla es, por definición, una boleta con dueño.
 */
export type EstadoEntrega = 'ASIGNADA' | 'EN_RUTA' | 'ENTREGADA' | 'RECHAZADA' | 'ANULADA'

/** Un producto de la boleta. */
export interface Producto {
  lineaNum: number
  codigoArticulo: string
  codigoBarras?: string
  descripcion: string
  cantidad: number
  unidad?: string
  almacen?: string
}

/**
 * Orden de venta de SAP todavía sin repartir. No existe en la base del TMS:
 * se lee del Service Layer cada vez que se abre la pantalla.
 *
 * Se lista por orden y no por entrega porque la orden se puede leer sin sus
 * líneas, y eso es la diferencia entre dos segundos y veinte.
 */
export interface OrdenDisponible {
  sapDocEntry: number
  sapDocNum: number
  fechaDocumento: string
  /** Hora del documento, "11:12:00". SAP la manda aparte de la fecha. */
  horaDocumento?: string
  /** Fecha comprometida con el cliente. */
  fechaEntrega?: string
  clienteCodigo: string
  clienteNombre: string
  direccion?: string
  municipio?: string
  comentarios?: string
  /**
   * SAP ya copió la orden a su entrega. Ya no condiciona el reparto —los
   * viajes se arman días antes— pero dice en qué punto va el documento.
   */
  tieneEntrega: boolean
}

/** Boleta que el TMS ya administra. */
export interface Entrega {
  idEntrega: number
  /** Nulos mientras SAP no haya generado la entrega de esa orden. */
  sapDocEntry?: number
  sapDocNum?: number
  sapOrdenDocEntry?: number
  sapOrdenVenta?: number
  sapFacturaNum?: number
  clienteCodigo: string
  clienteNombre: string
  direccion?: string
  municipio?: string
  pesoKg: number
  fechaDocumento: string
  horaDocumento?: string
  fechaEntrega?: string
  estado: EstadoEntrega
  idViaje?: number
  secuencia?: number
  idUsuarioPiloto: number
  asignadaEn?: string
  receptor?: string
  motivoRechazo?: string
  entregadaEn?: string
  pilotoNombre: string
  viajeNumero?: string
  viajeFecha?: string
  unidadCodigo?: string
  articulos: number
}

export interface EntregaDetalle extends Entrega {
  observaciones?: string
  fechaCreacion: string
  pilotoUsuario?: string
  pilotoTelefono?: string
  viajeEstado?: string
  unidadPlaca?: string
  productos: Producto[]
}

/** Página de resultados junto al total que cumple el filtro. */
export interface Pagina<T> {
  items: T[]
  total: number
  pagina: number
  porPagina: number
  totalPaginas: number
}

export interface ResumenEntregas {
  asignadas: number
  enRuta: number
  entregadas: number
  rechazadas: number
  anuladas: number
  /** Asignadas que todavía no están en ningún viaje. */
  sinViaje: number
}

export interface FiltroEntregas {
  buscar?: string
  estado?: string
  municipio?: string
  desde?: string
  hasta?: string
  idViaje?: number
  idPiloto?: number
  sinViaje?: boolean
  pagina?: number
  porPagina?: number
}

export const ETIQUETA_ENTREGA: Record<EstadoEntrega, string> = {
  ASIGNADA: 'Asignada',
  EN_RUTA: 'En ruta',
  ENTREGADA: 'Entregada',
  RECHAZADA: 'Rechazada',
  ANULADA: 'Anulada',
}

export const entregasApi = {
  /** Lectura en vivo de SAP. No guarda nada. */
  disponibles: (desde?: string, hasta?: string, buscar?: string) =>
    api.get<OrdenDisponible[]>('/api/entregas/disponibles', { desde, hasta, buscar }),

  listar: (filtro: FiltroEntregas = {}) =>
    api.get<Pagina<Entrega>>('/api/entregas', { ...filtro }),

  obtener: (id: number) => api.get<EntregaDetalle>(`/api/entregas/${id}`),

  resumen: () => api.get<ResumenEntregas>('/api/entregas/resumen'),

  /** Reparte órdenes: el servidor resuelve su entrega en SAP y la guarda. */
  asignarPiloto: (idPiloto: number, sapDocEntries: number[]) =>
    api.post<{ ok: boolean; afectadas: number }>('/api/entregas/asignar-piloto', {
      idPiloto,
      sapDocEntries,
    }),

  /** Pasa boletas ya repartidas a otro piloto, por id de entrega. */
  cambiarPiloto: (idPiloto: number, ids: number[]) =>
    api.post<{ ok: boolean; afectadas: number }>('/api/entregas/cambiar-piloto', {
      idPiloto,
      ids,
    }),

  /**
   * Completa las boletas repartidas antes de que existiera su entrega: les
   * pone número de boleta y factura cuando SAP ya las emitió.
   */
  vincular: (dias = 30) =>
    api.post<{ ok: boolean; afectadas: number }>(`/api/entregas/vincular?dias=${dias}`, {}),

  /** Las saca del viaje sin desasignarlas: siguen siendo del mismo piloto. */
  sacarDeViaje: (ids: number[]) =>
    api.post<{ ok: boolean; afectadas: number }>('/api/entregas/sacar-de-viaje', { ids }),

  /** Las borra del TMS: vuelven a la lista de disponibles. */
  liberar: (ids: number[]) =>
    api.post<{ ok: boolean; afectadas: number }>('/api/entregas/liberar', { ids }),

  asignarViaje: (idViaje: number, ids: number[]) =>
    api.post<{ ok: boolean; afectadas: number }>('/api/entregas/asignar', { idViaje, ids }),
}
