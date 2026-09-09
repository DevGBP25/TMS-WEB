import { api } from './client'

export interface UsuarioAutenticado {
  idUsuario: number
  usuario: string
  nombre: string
  telefono?: string
  ultimoAcceso?: string
  roles: string[]
}

export interface LoginResponse {
  token: string
  expira: string
  usuario: UsuarioAutenticado
}

export const authApi = {
  login: (usuario: string, password: string) =>
    api.post<LoginResponse>('/api/auth/login', {
      usuario,
      password,
      plataforma: 'WEB',
      // Ayuda a identificar la sesión en la bitácora.
      dispositivo: navigator.userAgent.slice(0, 100),
    }),

  yo: () => api.get<UsuarioAutenticado>('/api/auth/yo'),

  salir: () => api.post<{ ok: boolean }>('/api/auth/salir'),
}
