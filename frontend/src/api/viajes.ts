import { api } from './client'
import type {
  PagedResult,
  Piloto,
  Ruta,
  Unidad,
  ViajeDetalle,
  ViajeFiltro,
  ViajeIndicadores,
  ViajeListItem,
} from '@/types/tms'

export const viajesApi = {
  listar: (filtro: ViajeFiltro = {}) =>
    api.get<PagedResult<ViajeListItem>>('/api/viajes', { ...filtro }),

  obtener: (id: number) => api.get<ViajeDetalle>(`/api/viajes/${id}`),

  indicadores: (desde?: string, hasta?: string) =>
    api.get<ViajeIndicadores>('/api/viajes/indicadores', { desde, hasta }),

  crear: (body: { fecha: string; rutaId?: number; sapDocEntries: number[] }) =>
    api.post<{ ok: boolean; viajeId: number }>('/api/viajes', body),

  asignar: (id: number, unidadId: number, pilotoId: number) =>
    api.post<{ ok: boolean }>(`/api/viajes/${id}/asignar`, { unidadId, pilotoId }),

  cambiarEstado: (id: number, estado: string, observaciones?: string) =>
    api.post<{ ok: boolean }>(`/api/viajes/${id}/estado`, { estado, observaciones }),
}

export const catalogosApi = {
  pilotos:  () => api.get<Piloto[]>('/api/catalogos/pilotos'),
  unidades: (estado?: string) => api.get<Unidad[]>('/api/catalogos/unidades', { estado }),
  rutas:    () => api.get<Ruta[]>('/api/catalogos/rutas'),
}
