import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { abrirBase, ejecutar, una } from './db.ts'
import {
  borrarSesion, iniciarSesion, sesionDesdeToken, tienePermiso, asegurarAdminInicial,
  actualizarPerfilPropio, actualizarUsuario, buscarUsuario, cambiarContrasena,
  cambiarContrasenaPropia, crearUsuario, listarUsuarios, validarContrasena, validarEmail,
  validarNombre, validarRol,
  type Rol, type Sesion,
} from './auth.ts'
import { ErrorApi, recursoPorNombre, RECURSOS, type Recurso } from './recursos.ts'
import { aCamel, aSnake } from './casillas.ts'
import { armarDataset } from './dataset.ts'

const aqui = fileURLToPath(new URL('.', import.meta.url))
const raizProyecto = resolve(aqui, '..')
const puerto = Number(process.env.API_PORT ?? 8787)
const COOKIE = 'advaluro_sesion'

const db = abrirBase()

// ── Utilidades de HTTP ───────────────────────────────────────────────────────

type Respuesta = { estado: number; cuerpo: unknown }

function json(res: ServerResponse, estado: number, cuerpo: unknown) {
  const texto = JSON.stringify(cuerpo)
  res.writeHead(estado, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(texto),
  })
  res.end(texto)
}

async function leerCuerpo(req: IncomingMessage): Promise<Record<string, unknown>> {
  const trozos: Buffer[] = []
  let total = 0
  for await (const trozo of req) {
    total += trozo.length
    // Un formulario de alta no debería pasar de 1 MB; el límite corta un envío
    // desmedido antes de que se lleve la memoria.
    if (total > 1_000_000) throw new ErrorApi(413, 'El envío es demasiado grande')
    trozos.push(trozo as Buffer)
  }
  if (trozos.length === 0) return {}
  const crudo = Buffer.concat(trozos).toString('utf8')
  try {
    const datos = JSON.parse(crudo)
    return datos && typeof datos === 'object' ? (datos as Record<string, unknown>) : {}
  } catch {
    throw new ErrorApi(400, 'El cuerpo no es JSON válido')
  }
}

function leerCookies(req: IncomingMessage): Record<string, string> {
  const cabecera = req.headers.cookie
  if (!cabecera) return {}
  const salida: Record<string, string> = {}
  for (const trozo of cabecera.split(';')) {
    const i = trozo.indexOf('=')
    if (i > 0) salida[trozo.slice(0, i).trim()] = decodeURIComponent(trozo.slice(i + 1).trim())
  }
  return salida
}

function ponerCookie(res: ServerResponse, token: string, expiraIso: string) {
  res.setHeader(
    'set-cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiraIso).toUTCString()}`,
  )
}

function quitarCookie(res: ServerResponse) {
  res.setHeader('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

function sesionDe(req: IncomingMessage): Sesion | null {
  return sesionDesdeToken(db, leerCookies(req)[COOKIE] ?? null)
}

function exigirSesion(sesion: Sesion | null): Sesion {
  if (!sesion) throw new ErrorApi(401, 'Inicia sesión para continuar')
  return sesion
}

function exigirRol(sesion: Sesion | null, minimo: Rol): Sesion {
  const s = exigirSesion(sesion)
  if (!tienePermiso(s.rol, minimo)) {
    throw new ErrorApi(403, `Tu rol (${s.rol}) no permite esta acción. Se necesita ${minimo} o superior.`)
  }
  return s
}

// ── Conversión entre la base (snake_case) y la interfaz (camelCase) ──────────
// Las funciones viven en casillas.ts: dataset.ts también las necesita y pedirlas
// aquí crearía un ciclo de importación.

/** El cliente manda y recibe camelCase; la base guarda snake_case. */
function entrante(cuerpo: Record<string, unknown>): Record<string, unknown> {
  return aSnake(cuerpo)
}
function saliente(fila: Record<string, unknown>, r: Recurso): Record<string, unknown> {
  let salida = aCamel(fila)
  // SQLite guarda los booleanos como 0 y 1; la interfaz espera true y false.
  for (const columna of r.booleanas) {
    const valor = salida[columna]
    if (valor === 0 || valor === 1) salida[columna] = valor === 1
  }
  if (r.alLeer) salida = r.alLeer(salida)
  return salida
}

// ── CRUD genérico ────────────────────────────────────────────────────────────

function listar(r: Recurso, params: URLSearchParams): Record<string, unknown>[] {
  const condiciones: string[] = []
  const valores: (string | number)[] = []

  for (const [clave, columna] of Object.entries(r.filtros)) {
    const valor = params.get(clave)
    if (valor !== null && valor !== '') {
      condiciones.push(`${columna} = ?`)
      valores.push(valor)
    }
  }

  const q = params.get('q')?.trim()
  if (q && r.busqueda?.length) {
    condiciones.push(`(${r.busqueda.map((c) => `${c} LIKE ?`).join(' OR ')})`)
    for (let i = 0; i < r.busqueda.length; i++) valores.push(`%${q}%`)
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''
  // Tabla y columnas vienen de la lista blanca; los valores van vinculados.
  return una_varias(r, `${where} ORDER BY ${r.orden}`.trim(), ...(condiciones.length ? valores : []))
}

function una_varias(
  r: Recurso,
  sufijo: string,
  ...params: (string | number)[]
): Record<string, unknown>[] {
  const sql = `SELECT r.* FROM ${r.tabla} r ${sufijo}`
  return db.prepare(sql).all(...params).map((f) => saliente(f as Record<string, unknown>, r))
}

/** Fila tal como está en la base, sin el retoque de `alLeer`. */
function filaCruda(r: Recurso, id: string): Record<string, unknown> | null {
  return (una<Record<string, unknown>>(db, `SELECT * FROM ${r.tabla} WHERE id = ?`, id) as
    | Record<string, unknown>
    | undefined) ?? null
}

function obtener(r: Recurso, id: string): Record<string, unknown> | null {
  const fila = filaCruda(r, id)
  return fila ? saliente(fila, r) : null
}

function crear(r: Recurso, cuerpo: Record<string, unknown>): Record<string, unknown> {
  const datos = r.normaliza(entrante(cuerpo), null)
  const columnas = Object.keys(datos).filter((c) => r.columnas.includes(c))
  const id = `nuevo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const todos = ['id', ...columnas]
  const valores = [id, ...columnas.map((c) => datos[c] as string | number | null)]
  const marcas = todos.map(() => '?').join(', ')

  try {
    ejecutar(db, `INSERT INTO ${r.tabla} (${todos.join(', ')}) VALUES (${marcas})`, ...valores)
  } catch (e) {
    throw traducirErrorDeBase(e as Error, r)
  }
  return obtener(r, id)!
}

/**
 * Actualización parcial: se puede mandar solo el campo que cambia.
 *
 * Se lee el registro actual, se mezcla encima lo que llegó y se valida el
 * resultado completo. Así los validadores pueden exigir campos obligatorios
 * (que hacen falta al crear) sin estorbar a algo tan sencillo como marcar un
 * camión como inactivo enviando `{ "activo": false }`.
 */
function actualizar(r: Recurso, id: string, cuerpo: Record<string, unknown>): Record<string, unknown> {
  const actual = filaCruda(r, id)
  if (!actual) throw new ErrorApi(404, `No existe ${r.etiqueta} con ese identificador`)

  const combinado = { ...aCamel(actual), ...cuerpo }
  const datos = r.normaliza(aSnake(combinado), id)
  const columnas = Object.keys(datos).filter((c) => r.columnas.includes(c))
  if (columnas.length === 0) throw new ErrorApi(422, 'No hay nada que actualizar')

  const asignaciones = columnas.map((c) => `${c} = ?`).join(', ')
  const valores = columnas.map((c) => datos[c] as string | number | null)

  try {
    ejecutar(db, `UPDATE ${r.tabla} SET ${asignaciones} WHERE id = ?`, ...valores, id)
  } catch (e) {
    throw traducirErrorDeBase(e as Error, r)
  }
  return obtener(r, id)!
}

function borrar(r: Recurso, id: string) {
  if (!obtener(r, id)) throw new ErrorApi(404, `No existe ${r.etiqueta} con ese identificador`)

  for (const bloqueo of r.noBorrarSi ?? []) {
    const condicion = bloqueo.condicion ? `AND ${bloqueo.condicion}` : ''
    const sql = `SELECT COUNT(*) AS n FROM ${bloqueo.tabla} WHERE ${bloqueo.columna} = ?${condicion}`
    const { n } = una<{ n: number }>(db, sql, id)!
    if (n > 0) throw new ErrorApi(409, bloqueo.mensaje)
  }

  try {
    ejecutar(db, `DELETE FROM ${r.tabla} WHERE id = ?`, id)
  } catch (e) {
    throw traducirErrorDeBase(e as Error, r)
  }
  return { borrado: true, id }
}

/**
 * Los mensajes de la base se traducen a español con una explicación de qué
 * hacer, porque los errores de SQLite en crudo no le sirven de nada a quien
 * está cargando datos.
 */
function traducirErrorDeBase(e: Error, r: Recurso): ErrorApi {
  const m = e.message
  if (m.includes('UNIQUE') && m.includes('placa')) {
    return new ErrorApi(409, 'Ya existe un camión con esa placa', 'placa')
  }
  if (m.includes('UNIQUE') && m.includes('licencia')) {
    return new ErrorApi(409, 'Ya existe un conductor con esa licencia', 'licencia')
  }
  if (m.includes('UNIQUE') && m.includes('razon_social')) {
    return new ErrorApi(409, 'Ya existe un cliente con esa razón social', 'razon_social')
  }
  if (m.includes('UNIQUE') && m.includes('numero')) {
    return new ErrorApi(409, 'Ya existe una factura con ese número', 'numero')
  }
  if (m.includes('UNIQUE') && m.includes('referencia')) {
    return new ErrorApi(409, 'Ya existe un viaje con esa referencia', 'referencia')
  }
  if (m.includes('UNIQUE') && m.includes('ruc')) {
    return new ErrorApi(409, 'Ya existe un cliente con ese RUC', 'ruc')
  }
  if (m.includes('UNIQUE')) {
    return new ErrorApi(409, `Ese valor ya está en uso. ${r.etiqueta} debe ser única.`)
  }
  if (m.includes('FOREIGN KEY')) {
    return new ErrorApi(422, 'Alguno de los datos relacionados no existe. Revisa el camión, conductor, ruta o cliente elegidos.')
  }
  if (m.includes('CHECK')) {
    return new ErrorApi(422, 'Alguno de los valores está fuera de lo permitido. Revisa los campos numéricos y las listas.')
  }
  if (m.includes('NOT NULL')) {
    return new ErrorApi(422, 'Falta un campo obligatorio')
  }
  return new ErrorApi(500, `No se pudo guardar ${r.etiqueta}: ${m}`)
}

// ── Rutas ────────────────────────────────────────────────────────────────────

async function manejar(req: IncomingMessage, res: ServerResponse): Promise<Respuesta | null> {
  const url = new URL(req.url ?? '/', `http://localhost:${puerto}`)
  const ruta = url.pathname
  const metodo = req.method ?? 'GET'
  const sesion = sesionDe(req)

  if (!ruta.startsWith('/api/')) return null

  // ── Autenticación ──
  if (ruta === '/api/auth/estado' && metodo === 'GET') {
    return { estado: 200, cuerpo: { sesion } }
  }

  if (ruta === '/api/auth/entrar' && metodo === 'POST') {
    const cuerpo = await leerCuerpo(req)
    const resultado = iniciarSesion(db, String(cuerpo.email ?? ''), String(cuerpo.contrasena ?? ''))
    if (!resultado.sesion) throw new ErrorApi(401, resultado.error ?? 'No se pudo entrar')
    ponerCookie(res, resultado.token!, resultado.sesion.expira)
    return { estado: 200, cuerpo: { sesion: resultado.sesion } }
  }

  if (ruta === '/api/auth/salir' && metodo === 'POST') {
    const token = leerCookies(req)[COOKIE]
    if (token) borrarSesion(db, token)
    quitarCookie(res)
    return { estado: 200, cuerpo: { ok: true } }
  }

  if (ruta === '/api/auth/usuarios' && metodo === 'GET') {
    exigirRol(sesion, 'admin')
    return { estado: 200, cuerpo: { usuarios: listarUsuarios(db) } }
  }

  // ── Gestión de cuentas (solo admin) ────────────────────────────────────────
  // El registro de usuarios no pasa por el CRUD genérico a propósito: sus reglas
  // de seguridad son propias (el último administrador, la autodesactivación) y
  // no encajan en un "recurso" más de la lista blanca.

  if (ruta === '/api/auth/usuarios' && metodo === 'POST') {
    exigirRol(sesion, 'admin')
    const cuerpo = await leerCuerpo(req)
    const creado = crearUsuario(db, {
      email: validarEmail(cuerpo.email),
      nombre: validarNombre(cuerpo.nombre),
      contrasena: validarContrasena(cuerpo.contrasena),
      rol: validarRol(cuerpo.rol),
    })
    // La contraseña se devuelve una única vez, en la respuesta de la creación,
    // para poder comunicársela a la persona. Después solo queda el hash.
    return { estado: 201, cuerpo: { usuario: creado, contrasenaInicial: String(cuerpo.contrasena) } }
  }

  const partesUsuario = ruta.replace(/^\/api\/auth\/usuarios\/?/, '').split('/').filter(Boolean)
  const usuarioId = partesUsuario[0] ?? ''

  if (partesUsuario.length === 1 && metodo === 'GET') {
    exigirRol(sesion, 'admin')
    const usuario = buscarUsuario(db, usuarioId)
    if (!usuario) throw new ErrorApi(404, 'No existe esa cuenta')
    return { estado: 200, cuerpo: { usuario } }
  }

  if (partesUsuario.length === 1 && metodo === 'PUT') {
    const quien = exigirRol(sesion, 'admin')
    const cuerpo = await leerCuerpo(req)
    const usuario = actualizarUsuario(
      db,
      usuarioId,
      {
        nombre: cuerpo.nombre === undefined ? undefined : validarNombre(cuerpo.nombre),
        rol: cuerpo.rol === undefined ? undefined : validarRol(cuerpo.rol),
        activo: cuerpo.activo === undefined ? undefined : Boolean(cuerpo.activo),
      },
      { id: quien.perfilId },
    )
    return { estado: 200, cuerpo: { usuario } }
  }

  // Restablecer la contraseña de alguien. Es una acción de admin, y cierra las
  // sesiones abiertas de esa cuenta: si la contraseña estaba comprometida,
  // dejarlas vivas sería no hacer nada.
  if (partesUsuario.length === 2 && partesUsuario[1] === 'contrasena' && metodo === 'PUT') {
    exigirRol(sesion, 'admin')
    const cuerpo = await leerCuerpo(req)
    cambiarContrasena(db, usuarioId, validarContrasena(cuerpo.contrasena), { cerrarSesiones: true })
    return { estado: 200, cuerpo: { ok: true, sesionesCerradas: true } }
  }

  // Desactivar o reactivar. Se usa PUT con { activo } en lugar de DELETE a
  // propósito: la cuenta se conserva para que el historial de quién registró
  // cada dato siga teniendo sentido.
  if (partesUsuario.length === 1 && metodo === 'DELETE') {
    const quien = exigirRol(sesion, 'admin')
    // `actualizarUsuario` se encarga de rechazar la autodesactivación y de
    // proteger al último administrador; no hace falta comprobarlo otra vez aquí.
    const usuario = actualizarUsuario(db, usuarioId, { activo: false }, { id: quien.perfilId })
    return { estado: 200, cuerpo: { usuario, desactivado: true } }
  }

  // ── Cuenta propia ──────────────────────────────────────────────────────────
  // Cualquier persona puede ver y cambiar su nombre y su contraseña, sin ser
  // admin: son datos suyos, no de la empresa.

  if (ruta === '/api/auth/mi-cuenta' && metodo === 'GET') {
    const s = exigirSesion(sesion)
    return { estado: 200, cuerpo: { usuario: buscarUsuario(db, s.perfilId) } }
  }

  if (ruta === '/api/auth/mi-cuenta' && metodo === 'PUT') {
    const s = exigirSesion(sesion)
    const cuerpo = await leerCuerpo(req)
    const usuario = actualizarPerfilPropio(db, s.perfilId, validarNombre(cuerpo.nombre))
    return { estado: 200, cuerpo: { usuario } }
  }

  if (ruta === '/api/auth/mi-contrasena' && metodo === 'PUT') {
    const s = exigirSesion(sesion)
    const cuerpo = await leerCuerpo(req)
    const ok = cambiarContrasenaPropia(
      db,
      s.perfilId,
      validarContrasena(cuerpo.actual, 'actual'),
      validarContrasena(cuerpo.nueva),
    )
    // 422 y no 401: quien llama sí tiene sesión; lo que está mal es el campo
    // `actual`. Un 401 aquí haría que el cliente lo tomara por sesión caducada y
    // expulsara del panel a quien solo se equivocó al teclear.
    if (!ok) throw new ErrorApi(422, 'La contraseña actual no es correcta', 'actual')
    return { estado: 200, cuerpo: { ok: true } }
  }

  // ── Dataset completo para el panel ──
  if (ruta === '/api/dataset' && metodo === 'GET') {
    exigirSesion(sesion)
    return { estado: 200, cuerpo: armarDataset(db) }
  }

  // ── Recursos ──
  const partes = ruta.replace(/^\/api\//, '').split('/').filter(Boolean)
  const r = recursoPorNombre(partes[0] ?? '')
  if (!r) throw new ErrorApi(404, `No existe el recurso "${partes[0] ?? ''}"`)

  if (partes.length === 1 && metodo === 'GET') {
    exigirSesion(sesion)
    return { estado: 200, cuerpo: { [r.nombre]: listar(r, url.searchParams) } }
  }

  if (partes.length === 2 && metodo === 'GET') {
    exigirSesion(sesion)
    const fila = obtener(r, partes[1])
    if (!fila) throw new ErrorApi(404, `No existe ${r.etiqueta} con ese identificador`)
    return { estado: 200, cuerpo: { [r.nombre]: fila } }
  }

  if (partes.length === 1 && metodo === 'POST') {
    exigirRol(sesion, r.minimoEscribir)
    const cuerpo = await leerCuerpo(req)
    return { estado: 201, cuerpo: { [r.nombre]: crear(r, cuerpo) } }
  }

  if (partes.length === 2 && metodo === 'PUT') {
    exigirRol(sesion, r.minimoEscribir)
    const cuerpo = await leerCuerpo(req)
    return { estado: 200, cuerpo: { [r.nombre]: actualizar(r, partes[1], cuerpo) } }
  }

  if (partes.length === 2 && metodo === 'DELETE') {
    exigirRol(sesion, r.minimoBorrar)
    return { estado: 200, cuerpo: borrar(r, partes[1]) }
  }

  throw new ErrorApi(405, `No se admite ${metodo} en ${ruta}`)
}

// ── Archivos estáticos (para servir la app ya compilada) ─────────────────────

const TIPOS_ARCHIVO: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function servirEstatico(ruta: string, res: ServerResponse): boolean {
  const carpetaDist = join(raizProyecto, 'dist')
  if (!existsSync(carpetaDist)) return false

  const relativo = ruta === '/' ? 'index.html' : ruta.replace(/^\//, '')
  // normalize + la comprobación de prefijo impiden salir de dist con ../..
  const destino = resolve(carpetaDist, normalize(relativo))
  if (!destino.startsWith(resolve(carpetaDist))) return false

  const existe = existsSync(destino) && extname(destino) !== ''
  const archivo = existe ? destino : join(carpetaDist, 'index.html')
  if (!existsSync(archivo)) return false

  res.writeHead(200, {
    'content-type': TIPOS_ARCHIVO[extname(archivo)] ?? 'application/octet-stream',
  })
  res.end(readFileSync(archivo))
  return true
}

// ── Arranque ─────────────────────────────────────────────────────────────────

export const servidor = createServer((req, res) => {
  manejar(req, res)
    .then((respuesta) => {
      if (!respuesta) {
        if (servirEstatico(new URL(req.url ?? '/', 'http://localhost').pathname, res)) return
        json(res, 404, { error: 'No encontrado' })
        return
      }
      json(res, respuesta.estado, respuesta.cuerpo)
    })
    .catch((error: unknown) => {
      if (error instanceof ErrorApi) {
        json(res, error.estado, { error: error.message, campo: error.campo })
        return
      }
      const mensaje = error instanceof Error ? error.message : String(error)
      console.error('[advaluro] error no controlado:', mensaje)
      json(res, 500, { error: 'Error interno del servidor' })
    })
})

// Solo arranca si se ejecuta directamente, para que las pruebas puedan importar
// el módulo sin dejar un servidor escuchando.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  // En el primer arranque la base está vacía y no hay nadie con quien entrar. Se
  // crea una cuenta de administrador con una contraseña generada al azar, que se
  // muestra una sola vez por pantalla: es preferible a una contraseña de fábrica
  // conocida que alguien más podría intentar.
  const inicial = asegurarAdminInicial(
    db,
    process.env.ADMIN_EMAIL ?? 'admin@advaluro.pe',
    process.env.ADMIN_PASSWORD ?? randomBytes(12).toString('base64url'),
    'Administrador',
  )

  servidor.listen(puerto, () => {
    console.log(`[advaluro] API escuchando en http://localhost:${puerto}`)
    console.log(`[advaluro] base de datos: ${process.env.DATABASE_URL ?? 'archivo:data/advaluro.db'}`)

    if (inicial.creado) {
      console.log('\n' + '='.repeat(58))
      console.log('  Se creó la primera cuenta de administrador.')
      console.log(`  correo:    ${inicial.email}`)
      console.log(`  contraseña: ${process.env.ADMIN_PASSWORD ?? '(la de arriba)'}`)
      console.log('  Cámbiala después de entrar. Anótala: no se puede recuperar.')
      console.log('='.repeat(58) + '\n')
    }

    console.log(`[advaluro] recursos: ${RECURSOS.map((r) => r.nombre).join(', ')}`)
  })
}
