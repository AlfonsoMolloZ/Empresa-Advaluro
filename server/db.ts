import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const raizProyecto = resolve(aqui, '..')

/** Resuelve `archivo:data/advaluro.db` a una ruta absoluta. */
function rutaDesdeUrl(valor: string): string {
  const limpio = valor.replace(/^archivo:/, '')
  return resolve(raizProyecto, limpio)
}

export const URL_BASE_DATOS = process.env.DATABASE_URL ?? 'archivo:data/advaluro.db'
export const RUTA_BASE_DATOS = rutaDesdeUrl(URL_BASE_DATOS)

let conexion: DatabaseSync | null = null

/**
 * Abre (o reutiliza) la conexión y aplica el esquema.
 *
 * Las migraciones se versionan con `PRAGMA user_version`: si el número guardado
 * es menor que el del esquema, se aplica y se actualiza. Así una base ya
 * existente se actualiza sola al añadir columnas nuevas en el futuro, y una
 * base ya actualizada no se toca.
 */
export function abrirBase(): DatabaseSync {
  if (conexion) return conexion

  mkdirSync(dirname(RUTA_BASE_DATOS), { recursive: true })
  const db = new DatabaseSync(RUTA_BASE_DATOS)

  // WAL permite leer mientras se escribe: imprescindible cuando varias personas
  // cargan datos a la vez. `busy_timeout` hace que esperen en vez de fallar.
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')
  // Sin esto, SQLite ignora las reglas ON DELETE de las FOREIGN KEY.
  db.exec('PRAGMA foreign_keys = ON')

  aplicarEsquema(db)
  conexion = db
  return db
}

function aplicarEsquema(db: DatabaseSync) {
  const versionActual = (db.prepare('PRAGMA user_version').get() as { user_version: number })
    .user_version
  const versionEsquema = versionDelEsquema()

  if (versionActual >= versionEsquema) return

  const sql = readFileSync(join(aqui, 'schema.sql'), 'utf8')
  db.exec('BEGIN')
  try {
    db.exec(sql)
    // PRAGMA no admite parámetros vinculados: el valor viene de una constante
    // numérica leída del propio archivo, nunca de la entrada del usuario.
    db.exec(`PRAGMA user_version = ${versionEsquema}`)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

/**
 * La versión del esquema es el número de la última línea de comentario
 * `-- version: N`. Obliga a subirla a mano al cambiar el esquema, que es justo
 * lo que queremos: que nadie cambie la base sin pensarlo.
 */
function versionDelEsquema(): number {
  const sql = readFileSync(join(aqui, 'schema.sql'), 'utf8')
  const marcas = [...sql.matchAll(/^--\s*version:\s*(\d+)\s*$/gm)]
  if (marcas.length === 0) {
    throw new Error('schema.sql no declara su versión. Añade una línea "-- version: 1".')
  }
  return Number(marcas.at(-1)![1])
}

export function versionActualEsquema(db: DatabaseSync): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
}

// ── Ayudas de consulta ───────────────────────────────────────────────────────
// La tabla y las columnas SIEMPRE vienen de una lista blanca en el código, nunca
// de lo que llegue en la petición. Los valores siempre viajan como parámetros.

type Valor = string | number | null

export function todas<T>(db: DatabaseSync, sql: string, ...params: Valor[]): T[] {
  return db.prepare(sql).all(...params) as T[]
}

export function una<T>(db: DatabaseSync, sql: string, ...params: Valor[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined
}

export function ejecutar(db: DatabaseSync, sql: string, ...params: Valor[]) {
  return db.prepare(sql).run(...params)
}

/** Ejecuta `fn` dentro de una transacción; si lanza, no deja cambios a medias. */
export function enTransaccion<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const resultado = fn()
    db.exec('COMMIT')
    return resultado
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function cerrarBase() {
  conexion?.close()
  conexion = null
}
