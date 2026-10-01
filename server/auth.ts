import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { ejecutar, una } from './db.ts'
import { errorConflicto, errorNoEncontrado, errorValidacion } from './error.ts'

export type Rol = 'admin' | 'operador' | 'lectura'

/** De menos a más permisos. Sirve para comparar un rol con el mínimo exigido. */
const JERARQUIA: Record<Rol, number> = { lectura: 1, operador: 2, admin: 3 }

export interface Sesion {
  perfilId: string
  email: string
  nombre: string
  rol: Rol
  expira: string
}

export function tienePermiso(rol: Rol, minimo: Rol): boolean {
  return JERARQUIA[rol] >= JERARQUIA[minimo]
}

// ── Contraseñas ──────────────────────────────────────────────────────────────
// scrypt a propósito: es lento por diseño, así que aunque alguien se robe el
// archivo de la base, probar millones de contraseñas por segundo no le sirve.

const LARGO_CLAVE = 64
const OPCIONES_SCRYPT = { N: 16_384, r: 8, p: 1 } as const

export function hashearContrasena(contrasena: string): string {
  const sal = randomBytes(16)
  const derivada = scryptSync(contrasena, sal, LARGO_CLAVE, OPCIONES_SCRYPT)
  return `scrypt$${OPCIONES_SCRYPT.N}$${OPCIONES_SCRYPT.r}$${OPCIONES_SCRYPT.p}$${sal.toString('base64url')}$${derivada.toString('base64url')}`
}

export function verificarContrasena(contrasena: string, guardado: string): boolean {
  const partes = guardado.split('$')
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false

  const [, n, r, p, sal, esperado] = partes
  const derivada = scryptSync(contrasena, Buffer.from(sal, 'base64url'), LARGO_CLAVE, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })
  const esperadoBuf = Buffer.from(esperado, 'base64url')
  // longitudes distintas, timingSafeEqual lanza: se compara fuera de tiempo
  if (derivada.length !== esperadoBuf.length) return false
  return timingSafeEqual(derivada, esperadoBuf)
}

// ── Sesiones ─────────────────────────────────────────────────────────────────

const DIAS_SESION = Number(process.env.SESION_DIAS ?? 7)

export function crearSesion(db: DatabaseSync, perfilId: string): { token: string; expira: string } {
  const token = randomBytes(32).toString('base64url')
  const expira = new Date(Date.now() + DIAS_SESION * 86_400_000).toISOString()
  ejecutar(db, 'INSERT INTO sesiones (token, perfil_id, expira) VALUES (?, ?, ?)', token, perfilId, expira)
  return { token, expira }
}

export function borrarSesion(db: DatabaseSync, token: string) {
  ejecutar(db, 'DELETE FROM sesiones WHERE token = ?', token)
}

export function borrarSesionesDe(db: DatabaseSync, perfilId: string) {
  ejecutar(db, 'DELETE FROM sesiones WHERE perfil_id = ?', perfilId)
}

/** Devuelve la sesión del token si existe, no ha caducado y el perfil sigue activo. */
export function sesionDesdeToken(db: DatabaseSync, token: string | null): Sesion | null {
  if (!token) return null

  const fila = una<{
    perfil_id: string
    email: string
    nombre: string
    rol: Rol
    expira: string
  }>(
    db,
    `SELECT s.perfil_id, s.expira, p.email, p.nombre, p.rol
       FROM sesiones s
       JOIN perfiles p ON p.id = s.perfil_id
      WHERE s.token = ? AND s.expira > datetime('now') AND p.activo = 1`,
    token,
  )
  if (!fila) return null

  return {
    perfilId: fila.perfil_id,
    email: fila.email,
    nombre: fila.nombre,
    rol: fila.rol,
    expira: fila.expira,
  }
}

/**
 * Entra con email y contraseña.
 * Devuelve `{ sesion, error }`: un mensaje genérico cuando el email existe pero
 * la contraseña no, para que nadie pueda averiguar qué correos están dados de
 * alta probando.
 */
export function iniciarSesion(
  db: DatabaseSync,
  email: string,
  contrasena: string,
): { sesion: Sesion | null; token?: string; error?: string } {
  const perfil = una<{
    id: string
    email: string
    nombre: string
    rol: Rol
    password_hash: string
    activo: number
  }>(db, 'SELECT id, email, nombre, rol, password_hash, activo FROM perfiles WHERE email = ?', email.trim().toLowerCase())

  if (!perfil || !verificarContrasena(contrasena, perfil.password_hash)) {
    return { sesion: null, error: 'Correo o contraseña incorrectos' }
  }
  if (!perfil.activo) {
    return { sesion: null, error: 'Esta cuenta está desactivada' }
  }

  const { token, expira } = crearSesion(db, perfil.id)
    return {
      sesion: {
        perfilId: perfil.id,
        email: perfil.email,
        nombre: perfil.nombre,
        rol: perfil.rol,
        expira,
      },
      token,
    }
}

/**
 * Crea el primer administrador si la tabla está vacía, para que la primera vez
 * no quede la aplicación sin forma de entrar.
 */
export function asegurarAdminInicial(
  db: DatabaseSync,
  email: string,
  contrasena: string,
  nombre: string,
): { creado: boolean; email: string } {
  const { n } = una<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM perfiles')!
  if (n > 0) return { creado: false, email }

  ejecutar(
    db,
    'INSERT INTO perfiles (id, email, nombre, rol, password_hash) VALUES (?, ?, ?, ?, ?)',
    `per-${Date.now()}`,
    email.trim().toLowerCase(),
    nombre,
    'admin',
    hashearContrasena(contrasena),
  )
  return { creado: true, email }
}

// ── Validación de datos de entrada ────────────────────────────────────────────
// Los validadores viven aquí y no en `recursos.ts` porque el registro de usuarios
// no es un recurso CRUD más: se maneja por su propia cuenta, para poder proteger
// el caso del último administrador.

/** Acepta lo que se ve en un correo normal y rechaza lo que no podría llegar. */
export function validarEmail(email: unknown): string {
  const s = String(email ?? '').trim().toLowerCase()
  if (!s) throw errorValidacion('Falta el correo', 'email')
  if (s.length > 160) throw errorValidacion('El correo es demasiado largo', 'email')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw errorValidacion('El correo no parece válido', 'email')
  return s
}

export function validarNombre(nombre: unknown): string {
  const s = String(nombre ?? '').trim()
  if (!s) throw errorValidacion('Falta el nombre', 'nombre')
  if (s.length > 120) throw errorValidacion('El nombre es demasiado largo', 'nombre')
  return s
}

/**
 * Mínimo 8 caracteres. Se acepta casi cualquier símbolo: imposing reglas de
 * "una mayúscula y un número" empuja a la gente a anotar contraseñas en un
 * papel pegado al monitor, que es peor que una contraseña algo predecible.
 */
export function validarContrasena(contrasena: unknown, campo = 'contrasena'): string {
  const s = String(contrasena ?? '')
  if (!s) throw errorValidacion('Falta la contraseña', campo)
  if (s.length < 8) throw errorValidacion('La contraseña debe tener al menos 8 caracteres', campo)
  if (s.length > 200) throw errorValidacion('La contraseña es demasiado larga', campo)
  return s
}

export function validarRol(rol: unknown): Rol {
  const s = String(rol ?? '')
  if (s === 'admin' || s === 'operador' || s === 'lectura') return s
  throw errorValidacion('El rol debe ser admin, operador o lectura', 'rol')
}

// ── Gestión de usuarios ───────────────────────────────────────────────────────

export interface Perfil {
  id: string
  email: string
  nombre: string
  rol: Rol
  activo: number
  creado_en?: string
}

/** Cuántas cuentas activas quedan con un rol dado. */
export function contarAdminsActivos(db: DatabaseSync, exceptoId?: string): number {
  const { n } = una<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM perfiles
      WHERE rol = 'admin' AND activo = 1 AND (? IS NULL OR id <> ?)`,
    exceptoId ?? null,
    exceptoId ?? null,
  )!
  return n
}

export function listarUsuarios(db: DatabaseSync): Perfil[] {
  // La consulta no devuelve password_hash a propósito: no hace falta para Manage
  // r cuentas, y evitar exponerlo reduce el daño si algo sale mal.
  return db
    .prepare('SELECT id, email, nombre, rol, activo, creado_en FROM perfiles ORDER BY activo DESC, nombre')
    .all() as unknown as Perfil[]
}

export function buscarUsuario(db: DatabaseSync, id: string): Perfil | undefined {
  // Igual que listarUsuarios: sin password_hash.
  return una<Perfil>(db, 'SELECT id, email, nombre, rol, activo, creado_en FROM perfiles WHERE id = ?', id)
}

export function emailEnUso(db: DatabaseSync, email: string, exceptoId?: string): boolean {
  const { n } = una<{ n: number }>(
    db,
    'SELECT COUNT(*) AS n FROM perfiles WHERE email = ? AND (? IS NULL OR id <> ?)',
    email.trim().toLowerCase(),
    exceptoId ?? null,
    exceptoId ?? null,
  )!
  return n > 0
}

/**
 * Crea una cuenta. La contraseña se guarda siempre hasheada y nunca se devuelve.
 * Quien llama es responsable de comunicársela a la persona.
 */
export function crearUsuario(
  db: DatabaseSync,
  datos: { email: string; nombre: string; contrasena: string; rol: Rol },
): Perfil {
  const email = datos.email.trim().toLowerCase()
  if (emailEnUso(db, email)) throw errorConflicto('Ya existe una cuenta con ese correo')

  const id = `per-${randomBytes(9).toString('base64url')}`
  ejecutar(
    db,
    'INSERT INTO perfiles (id, email, nombre, rol, password_hash) VALUES (?, ?, ?, ?, ?)',
    id,
    email,
    datos.nombre.trim(),
    datos.rol,
    hashearContrasena(datos.contrasena),
  )
  return buscarUsuario(db, id)!
}

/**
 * Cambia el nombre o el rol de una cuenta.
 *
 * Dos decisiones que evitan dejar la empresa sin nadie que administre:
 *  - No se puede degradar ni desactivar al último administrador activo.
 *  - Quien llama no puede quitarse su propio rol ni desactivarse, porque se
 *    quedaría fuera de la sesión que está usando ahora mismo.
 */
export function actualizarUsuario(
  db: DatabaseSync,
  id: string,
  cambios: { nombre?: string; rol?: Rol; activo?: boolean },
  quien: { id: string },
): Perfil {
  const perfil = buscarUsuario(db, id)
  if (!perfil) throw errorNoEncontrado('No existe esa cuenta')

  const nuevoRol = cambios.rol ?? (perfil.rol as Rol)
  const nuevoActivo = cambios.activo ?? perfil.activo === 1
  const sigueSiendoAdmin = perfil.rol === 'admin' && nuevoRol === 'admin' && nuevoActivo

  if (perfil.rol === 'admin' && !sigueSiendoAdmin && contarAdminsActivos(db, id) === 0) {
    throw errorConflicto('No se puede quitar el rol ni desactivar al único administrador activo')
  }

  /*
   * Estas dos reglas miran lo que se *pidió*, no el valor final. Si se usara
   * `nuevoActivo`, a un administrador ya desactivado que solo cambia su nombre le
   * saldría el error "no puedes desactivar tu propia cuenta", cuando en realidad
   * no ha pedido nada de eso.
   */
  if (quien.id === id) {
    if (cambios.activo === false) throw errorConflicto('No puedes desactivar tu propia cuenta')
    if (cambios.rol !== undefined && perfil.rol === 'admin' && cambios.rol !== 'admin') {
      throw errorConflicto('No puedes quitarte tu propio rol de administrador')
    }
  }

  ejecutar(
    db,
    'UPDATE perfiles SET nombre = ?, rol = ?, activo = ? WHERE id = ?',
    cambios.nombre?.trim() ?? perfil.nombre,
    nuevoRol,
    nuevoActivo ? 1 : 0,
    id,
  )
  return buscarUsuario(db, id)!
}

/**
 * Reemplaza la contraseña de una cuenta y cierra sus sesiones abiertas: si estaba
 * robada, dejar las sesiones vivas sería no hacer nada.
 */
export function cambiarContrasena(
  db: DatabaseSync,
  id: string,
  contrasena: string,
  opciones: { cerrarSesiones: boolean },
) {
  if (!buscarUsuario(db, id)) throw errorNoEncontrado('No existe esa cuenta')
  ejecutar(db, 'UPDATE perfiles SET password_hash = ? WHERE id = ?', hashearContrasena(contrasena), id)
  if (opciones.cerrarSesiones) borrarSesionesDe(db, id)
}

/** Datos que se pueden editar de la propia cuenta, sin pasar por un admin. */
export function actualizarPerfilPropio(db: DatabaseSync, id: string, nombre: string) {
  if (!buscarUsuario(db, id)) throw errorNoEncontrado('No existe esa cuenta')
  ejecutar(db, 'UPDATE perfiles SET nombre = ? WHERE id = ?', nombre.trim(), id)
  return buscarUsuario(db, id)!
}

/**
 * Cambio de contraseña por la propia persona. Exige la actual para que alguien
 * que se siente frente al navegador abierto no cambie la clave a escondidas.
 *
 * El hash no sale de este archivo: la comparación se hace aquí y quien llama
 * nunca lo ve. Devuelve `false` cuando la actual no coincide, para que la ruta
 * HTTP pueda responder 401.
 */
export function cambiarContrasenaPropia(
  db: DatabaseSync,
  id: string,
  actual: string,
  nueva: string,
): boolean {
  const fila = una<{ password_hash: string }>(db, 'SELECT password_hash FROM perfiles WHERE id = ?', id)
  if (!fila || !verificarContrasena(actual, fila.password_hash)) return false
  // Las sesiones abiertas se conservan a propósito: si la contraseña no estaba
  // comprometida, cerrar la sesión propia sería una molestia sin motivo.
  cambiarContrasena(db, id, nueva, { cerrarSesiones: false })
  return true
}
