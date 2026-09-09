const BASE = import.meta.env.VITE_API_URL ?? ''

const SIN_SERVIDOR =
  'No se pudo contactar con el servidor. Verifique que la API esté en ejecución.'

/** Error de la API con el mensaje que devolvió el backend. */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/* El token vive en un módulo y no en el contexto de React porque este archivo
   no puede importar el contexto sin crear un ciclo. AuthContext es el único
   que lo escribe. */
let tokenActual: string | null = null
let alExpirar: (() => void) | null = null

export function definirToken(token: string | null) {
  tokenActual = token
}

/** Se invoca cuando la API responde 401 con un token presente: la sesión caducó. */
export function alCaducarSesion(cb: () => void) {
  alExpirar = cb
}

type Params = Record<string, string | number | boolean | undefined | null>

function buildUrl(path: string, params?: Params): string {
  const url = `${BASE}${path}`
  if (!params) return url

  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      qs.append(key, String(value))
    }
  }

  const query = qs.toString()
  return query ? `${url}?${query}` : url
}

async function request<T>(path: string, init?: RequestInit, params?: Params): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  }

  if (tokenActual) headers.Authorization = `Bearer ${tokenActual}`

  let res: Response
  try {
    res = await fetch(buildUrl(path, params), { ...init, headers })
  } catch {
    // fetch sólo lanza cuando no hubo respuesta: red caída o servidor apagado.
    throw new ApiError(SIN_SERVIDOR, 0)
  }

  if (!res.ok) {
    // 401 teniendo token significa que caducó o fue revocado: se cierra sesión.
    if (res.status === 401 && tokenActual) alExpirar?.()

    let mensaje = ''
    try {
      const body = await res.json()
      if (body?.mensaje) mensaje = body.mensaje
    } catch {
      // respuesta sin cuerpo JSON
    }

    /* Un 502/503/504 con cuerpo vacío no viene de la API sino del proxy o de
       IIS: significa que el backend no está atendiendo. "Error 502" no le dice
       nada a quien está frente a la pantalla de login. */
    if (!mensaje) {
      mensaje = [502, 503, 504].includes(res.status)
        ? SIN_SERVIDOR
        : `Error ${res.status}`
    }

    throw new ApiError(mensaje, res.status)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>(path, { method: 'GET' }, params),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
