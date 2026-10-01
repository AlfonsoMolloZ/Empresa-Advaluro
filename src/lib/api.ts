/**
 * Cliente de la API local.
 *
 * Todo se pide a rutas relativas (`/api/...`) y nunca a `localhost:8787` a mano:
 * en desarrollo responde el proxy de Vite y en producción el mismo servidor que
 * sirve los archivos. Así no hay CORS ni direcciones que cambiar al publicar.
 *
 * La cookie de sesión es `HttpOnly`, o sea que el JavaScript no puede verla: por
 * eso el navegador la manda solo. Aquí no se guarda ningún token.
 */

export type Rol = 'admin' | 'operador' | 'lectura'

export interface Sesion {
  perfilId: string
  email: string
  nombre: string
  rol: Rol
  expira: string
}

export interface Cuenta {
  id: string
  email: string
  nombre: string
  rol: Rol
  activo: number
  creado_en?: string
}

/** Lo que el servidor devuelve cuando algo no sale bien. */
export class ErrorApi extends Error {
  estado: number
  /** Nombre del campo que falló, si el error es de validación. */
  campo?: string

  constructor(estado: number, mensaje: string, campo?: string) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.estado = estado
    this.campo = campo
  }

  /** `true` cuando el problema es de los datos, no de la sesión. */
  get esValidacion() {
    return this.estado === 422
  }
}

/** La sesión no vale o caducó: hay que volver a entrar. */
export class ErrorSesion extends ErrorApi {
  constructor(mensaje = 'La sesión caducó. Vuelve a entrar.') {
    super(401, mensaje)
    this.name = 'ErrorSesion'
  }
}

/**
 * Se dispara cuando el servidor no está levantado. Es un caso normal en
 * desarrollo, no un error de programación, así que tiene su propio tipo para
 * poder mostrar un mensaje claro en vez de un "no se pudo conectar".
 */
export class ErrorSinServidor extends Error {
  constructor() {
    super('No se pudo contactar con el servidor local')
    this.name = 'ErrorSinServidor'
  }
}

type Opciones = {
  metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  cuerpo?: unknown
  /** Se envía aunque la respuesta haya dado error. */
  senal?: AbortSignal
  /**
   * La respuesta 401 es "aquí no hay sesión" y no "te equivocaste al enviar
   * datos". Se marca en las rutas que se consultan sin estar conectado para no
   * interpretationlas mal. Ver `RUTAS_SIN_SESION`.
   */
  esperaSesion?: boolean
}

/**
 * Rutas que funcionan sin sesión y donde un 401 es una respuesta legítima.
 *
 * `/api/auth/entrar` devuelve 401 cuando la contraseña no es la correcta: es el
 * resultado esperado de un intento fallido, no una sesión que se haya caído. Sin
 * esta lista, un login mal tecleado expulsaría del panel a quien ya estaba
 * dentro.
 *
 * El resto de 401 sí significa que el servidor ya no reconoce la cookie.
 */
const RUTAS_SIN_SESION = new Set(['/api/auth/estado', '/api/auth/entrar'])

type OyenteSesionCaducada = () => void
const oyentes = new Set<OyenteSesionCaducada>()

/**
 * Avisa a la aplicación cuando el servidor deja de reconocer la sesión.
 *
 * Lo centraliza el propio cliente en vez de dejar que cada pantalla detecte el
 * 401: si cada `catch` decidiera por su cuenta, un formulario que muestra el
 * error se tragaría la señal y el panel quedaría pidiendo datos a un servidor
 * que ya no le deja pasar, sin avisar a nadie.
 *
 * Devuelve la función para dejar de escuchar.
 */
export function alCaducarLaSesion(oyente: OyenteSesionCaducada): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

async function pedir<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const { metodo = 'GET', cuerpo, senal, esperaSesion = !RUTAS_SIN_SESION.has(ruta) } = opciones

  let res: Response
  try {
    res = await fetch(ruta, {
      method: metodo,
      // La cookie de sesión viaja en las peticiones al mismo origen.
      credentials: 'same-origin',
      headers: cuerpo === undefined ? undefined : { 'content-type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: senal,
    })
  } catch (e) {
    // Un aborto pedido por la aplicación no es un fallo de conexión.
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ErrorSinServidor()
  }

  const texto = await res.text()
  let datos: unknown = null
  if (texto) {
    try {
      datos = JSON.parse(texto)
    } catch {
      datos = null
    }
  }

  if (!res.ok) {
    const cuerpo_ = (datos ?? {}) as { error?: string; campo?: string }
    if (res.status === 401) {
      if (esperaSesion) for (const oyente of oyentes) oyente()
      throw new ErrorSesion(cuerpo_.error)
    }
    throw new ErrorApi(res.status, cuerpo_.error ?? `Error ${res.status}`, cuerpo_.campo)
  }

  return datos as T
}

// ── Sesión ────────────────────────────────────────────────────────────────────

export const api = {
  /** Quién está conectado ahora, o `null` si nadie lo está. */
  estado: (senal?: AbortSignal) =>
    pedir<{ sesion: Sesion | null }>('/api/auth/estado', { senal }).then((r) => r.sesion),

  entrar: (email: string, contrasena: string) =>
    pedir<{ sesion: Sesion }>('/api/auth/entrar', {
      metodo: 'POST',
      cuerpo: { email, contrasena },
    }).then((r) => r.sesion),

  salir: () => pedir<{ ok: true }>('/api/auth/salir', { metodo: 'POST' }),

  miCuenta: (senal?: AbortSignal) =>
    pedir<{ usuario: Cuenta }>('/api/auth/mi-cuenta', { senal }).then((r) => r.usuario),

  cambiarMiNombre: (nombre: string) =>
    pedir<{ usuario: Cuenta }>('/api/auth/mi-cuenta', { metodo: 'PUT', cuerpo: { nombre } }).then(
      (r) => r.usuario,
    ),

  cambiarMiContrasena: (actual: string, nueva: string) =>
    pedir<{ ok: true }>('/api/auth/mi-contrasena', {
      metodo: 'PUT',
      cuerpo: { actual, nueva },
    }),

  // ── Cuentas (solo admin) ──

  listarCuentas: (senal?: AbortSignal) =>
    pedir<{ usuarios: Cuenta[] }>('/api/auth/usuarios', { senal }).then((r) => r.usuarios),

  crearCuenta: (datos: { email: string; nombre: string; contrasena: string; rol: Rol }) =>
    pedir<{ usuario: Cuenta; contrasenaInicial: string }>('/api/auth/usuarios', {
      metodo: 'POST',
      cuerpo: datos,
    }),

  cambiarCuenta: (
    id: string,
    cambios: { nombre?: string; rol?: Rol; activo?: boolean },
  ) =>
    pedir<{ usuario: Cuenta }>(`/api/auth/usuarios/${id}`, { metodo: 'PUT', cuerpo: cambios }).then(
      (r) => r.usuario,
    ),

  desactivarCuenta: (id: string) =>
    pedir<{ usuario: Cuenta }>(`/api/auth/usuarios/${id}`, { metodo: 'DELETE' }).then(
      (r) => r.usuario,
    ),

  restablecerContrasena: (id: string, contrasena: string) =>
    pedir<{ ok: true }>(`/api/auth/usuarios/${id}/contrasena`, {
      metodo: 'PUT',
      cuerpo: { contrasena },
    }),

  // ── Recursos y dataset ──

  dataset: (senal?: AbortSignal) => pedir<unknown>('/api/dataset', { senal }),

  listar: <T>(recurso: string, parametros?: Record<string, string | number | boolean>) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(parametros ?? {})) {
      if (v !== '' && v !== undefined && v !== null) q.set(k, String(v))
    }
    const sufijo = q.toString()
    return pedir<Record<string, T[]>>(`/api/${recurso}${sufijo ? `?${sufijo}` : ''}`).then(
      (r) => r[recurso],
    )
  },

  obtener: <T>(recurso: string, id: string) =>
    pedir<Record<string, T>>(`/api/${recurso}/${id}`).then((r) => r[recurso]),

  crear: <T>(recurso: string, cuerpo: Record<string, unknown>) =>
    pedir<Record<string, T>>(`/api/${recurso}`, { metodo: 'POST', cuerpo }).then((r) => r[recurso]),

  actualizar: <T>(recurso: string, id: string, cuerpo: Record<string, unknown>) =>
    pedir<Record<string, T>>(`/api/${recurso}/${id}`, { metodo: 'PUT', cuerpo }).then(
      (r) => r[recurso],
    ),

  borrar: (recurso: string, id: string) =>
    pedir<{ borrado: boolean; id: string }>(`/api/${recurso}/${id}`, { metodo: 'DELETE' }),
}

// ── Utilidades de permisos ────────────────────────────────────────────────────

const JERARQUIA: Record<Rol, number> = { lectura: 1, operador: 2, admin: 3 }

/** `true` si el rol alcanza para lo que se pide. Mismo orden que en el servidor. */
export function puede(rol: Rol | undefined, minimo: Rol): boolean {
  if (!rol) return false
  return JERARQUIA[rol] >= JERARQUIA[minimo]
}

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  lectura: 'Solo lectura',
}
