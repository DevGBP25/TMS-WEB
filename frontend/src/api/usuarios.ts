import { api } from './client'

export interface UsuarioLista {
  idUsuario: number
  usuario: string
  nombre: string
  telefono?: string
  dpi?: string
  licencia?: string
  tipoLicencia?: string
  licenciaVence?: string
  activo: boolean
  intentosFallidos: number
  ultimoAcceso?: string
  fechaCreacion: string
  roles: string[]
}

export interface Rol {
  idRol: number
  nombre: string
  descripcion?: string
}

/** Campos del formulario, compartidos entre el alta y la edición. */
export interface DatosUsuario {
  nombre: string
  telefono?: string
  dpi?: string
  licencia?: string
  tipoLicencia?: string
  licenciaVence?: string | null
  roles: string[]
}

export const usuariosApi = {
  listar: (buscar?: string, soloActivos = false) =>
    api.get<UsuarioLista[]>('/api/usuarios', { buscar, soloActivos }),

  roles: () => api.get<Rol[]>('/api/usuarios/roles'),

  crear: (datos: DatosUsuario & { usuario: string; password: string }) =>
    api.post<{ ok: boolean; idUsuario: number }>('/api/usuarios', datos),

  actualizar: (id: number, datos: DatosUsuario & { activo: boolean }) =>
    api.put<{ ok: boolean }>(`/api/usuarios/${id}`, datos),

  restablecerPassword: (id: number, password: string) =>
    api.post<{ ok: boolean }>(`/api/usuarios/${id}/password`, { password }),
}
