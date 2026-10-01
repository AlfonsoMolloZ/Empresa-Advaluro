/**
 * Pruebas del cliente HTTP del frontend, sin navegador.
 *
 * El motivo de existir es la caducidad de sesión. Con la lógica anterior solo se
 * enteraba de un 401 el que no atrapara la promesa, así que un formulario con su
 * propio `catch` dejaba el panel creyéndose conectado mientras el servidor ya
 * le rechazaba todo. Aquí se comprueba que el aviso llega siempre, y sobre todo
 * que NO llega cuando el 401 es una respuesta legítima de la pantalla de entrada.
 *
 * Se levanta un servidor propio con `node:http` para poder responder con el
 * código exacto en cada caso.
 *
 * Uso: node server/prueba-api-cliente.ts
 */

import { createServer, type Server } from 'node:http'
import { alCaducarLaSesion, api, ErrorApi, ErrorSesion, ErrorSinServidor } from '../src/lib/api.ts'

const fallos: string[] = []
let pasadas = 0

function comprobar(condicion: boolean, descripcion: string) {
  if (condicion) {
    pasadas++
    console.log(`  ok   ${descripcion}`)
  } else {
    fallos.push(descripcion)
    console.log(`  FALLA ${descripcion}`)
  }
}

function igual<T>(obtenido: T, esperado: T, descripcion: string) {
  const bien = JSON.stringify(obtenido) === JSON.stringify(esperado)
  comprobar(bien, bien ? descripcion : `${descripcion} (obtenido: ${JSON.stringify(obtenido)})`)
}

/**
 * Ejecuta una llamada y devuelve el error que lanzó, o `null` si funcionó.
 *
 * Se evita devolver un `{ ok, valor } | { ok, error }`: la estrechadura de tipos
 * sobre esa unión dentro de la llamada siguiente queda clara de leer, pero
 * mezcla el "qué se probó" con el "cómo se falló".
 */
async function errorDe(accion: () => Promise<unknown>): Promise<Error | null> {
  try {
    await accion()
    return null
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e))
  }
}

/**
 * Igual que `errorDe`, pero obliga a que sea un `ErrorApi` para poder leerle
 * `estado` y `campo`. Devuelve `null` si no lo es, que ya es un fallo en sí.
 */
async function errorDeApi(accion: () => Promise<unknown>): Promise<ErrorApi | null> {
  const e = await errorDe(accion)
  return e instanceof ErrorApi ? e : null
}

let servidor: Server
/** Respuesta que dará el servidor a la siguiente petición. */
let proximo: { estado: number; cuerpo: unknown } = { estado: 200, cuerpo: {} }
/** Rutas que ha pedido el cliente, para comprobar a dónde fue. */
const rutas: string[] = []

async function arrancar(): Promise<string> {
  servidor = createServer((req, res) => {
    rutas.push(req.url ?? '')
    res.writeHead(proximo.estado, { 'content-type': 'application/json' })
    res.end(JSON.stringify(proximo.cuerpo))
  })
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo))
  const direccion = servidor.address()
  if (direccion === null || typeof direccion === 'string') {
    throw new Error('el servidor de pruebas no indicó un puerto')
  }
  return `http://127.0.0.1:${direccion.port}`
}

async function principal() {
  const origen = await arrancar()

  // `api` pide rutas relativas, así que se les pega el origen del servidor de
  // pruebas. Es el mismo truco que el proxy de Vite, pero en un puerto fijo.
  const fetchReal = globalThis.fetch
  globalThis.fetch = ((entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(entrada)
    return fetchReal(url.startsWith('/') ? `${origen}${url}` : url, init)
  }) as typeof fetch

  // Cuenta los avisos de caducidad y sabe dejar de escuchar.
  let avisos = 0
  const cancelar = alCaducarLaSesion(() => {
    avisos++
  })

  try {
    console.log('\n── 401 en ruta protegida: debe caducar la sesión ──')
    proximo = { estado: 401, cuerpo: { error: 'Inicia sesión para continuar' } }
    const e1 = await errorDe(() => api.dataset())
    comprobar(e1 instanceof ErrorSesion, 'lanza ErrorSesion')
    igual(avisos, 1, 'avisa una sola vez de la caducidad')

    console.log('\n── 401 al entrar: NO es caducidad ──')
    avisos = 0
    proximo = { estado: 401, cuerpo: { error: 'El correo o la contraseña no son correctos' } }
    const e2 = await errorDe(() => api.entrar('admin@advaluro.pe', 'equivocada'))
    comprobar(e2 instanceof ErrorSesion, 'un login fallido también lanza ErrorSesion, para poder mostrar el aviso')
    igual(avisos, 0, 'pero no tira la sesión de quien ya estaba dentro')
    comprobar(rutas.at(-1) === '/api/auth/entrar', 'la petición fue a /api/auth/entrar')

    console.log('\n── otros errores: tampoco son caducidad ──')
    avisos = 0

    proximo = { estado: 403, cuerpo: { error: 'Tu rol no alcanza para esto' } }
    const e3 = await errorDeApi(() => api.listar('camiones'))
    comprobar(e3 !== null, 'el 403 es un ErrorApi normal')
    igual(e3?.estado, 403, 'conserva su estado 403')
    igual(avisos, 0, 'el 403 no expulsa a nadie: la sesión sigue viva')

    proximo = { estado: 422, cuerpo: { error: 'La contraseña actual no es correcta', campo: 'actual' } }
    const e4 = await errorDeApi(() => api.cambiarMiContrasena('equivocada', 'clave-nueva-123'))
    comprobar(e4 !== null, 'el 422 es un ErrorApi normal')
    igual(e4?.campo, 'actual', 'trae el campo culpable, para poder marcar el campo en el formulario')
    igual(avisos, 0, 'escribió mal su contraseña pero no pierde la sesión')
    comprobar(!(e4 instanceof ErrorSesion), 'y no se confunde con una sesión caducada')

    proximo = { estado: 404, cuerpo: { error: 'No existe el recurso "inventado"' } }
    igual((await errorDeApi(() => api.listar('inventado')))?.estado, 404, 'el 404 también es un ErrorApi normal')
    igual(avisos, 0, 'y no toca la sesión')

    console.log('\n── peticiones correctas: silencio ──')
    avisos = 0
    rutas.length = 0
    proximo = { estado: 200, cuerpo: { camiones: [{ id: 'a' }, { id: 'b' }] } }
    const camiones = await api.listar<{ id: string }>('camiones')
    igual(camiones, [{ id: 'a' }, { id: 'b' }], 'lista camiones y devuelve solo el array del recurso')
    igual(rutas, ['/api/camiones'], 'la petición fue a /api/camiones')
    igual(avisos, 0, 'una petición correcta no avisa de nada')

    console.log('\n── sesión que caduca durante el uso ──')
    avisos = 0
    proximo = { estado: 200, cuerpo: { sesion: { perfilId: 'p1', email: 'a@b.pe', nombre: 'A', rol: 'admin' } } }
    igual((await api.estado())?.email, 'a@b.pe', 'la sesión vigente se lee bien')
    // El servidor deja de reconocer la cookie: es lo que pasa si a la cuenta la
    // desactivan o le cambian la contraseña desde otra parte.
    proximo = { estado: 401, cuerpo: { error: 'Inicia sesión para continuar' } }
    const e6 = await errorDe(() => api.dataset())
    comprobar(e6 instanceof ErrorSesion, 'la primera petición tras caducar falla')
    igual(avisos, 1, 'y avisa de la caducidad')
    comprobar(
      (await errorDe(() => api.listar('viajes'))) instanceof ErrorSesion,
      'las siguientes peticiones también fallan',
    )
    igual(avisos, 2, 'y cada una vuelve a avisar, para que no dependa de cuál se vea primero')

    console.log('\n── servidor caído ──')
    avisos = 0
    await new Promise<void>((cerrado) => servidor.close(() => cerrado()))
    const e7 = await errorDe(() => api.dataset())
    comprobar(e7 instanceof ErrorSinServidor, 'sin servidor se distingue del 401')
    comprobar(!(e7 instanceof ErrorSesion), 'no se hace pasar por sesión caducada')
    igual(avisos, 0, 'no se confunde "caído" con "salió la sesión"')

    console.log('\n── se puede dejar de escuchar ──')
    cancelar()
    avisos = 0
    const otra = await arrancar()
    globalThis.fetch = ((entrada: string | URL | Request, init?: RequestInit) => {
      const url = String(entrada)
      return fetchReal(url.startsWith('/') ? `${otra}${url}` : url, init)
    }) as typeof fetch
    await errorDe(() => api.dataset())
    igual(avisos, 0, 'tras darse de baja ya nadie atiende los 401')
  } finally {
    cancelar()
    globalThis.fetch = fetchReal
    if (servidor.listening) await new Promise<void>((cerrado) => servidor.close(() => cerrado()))
  }
}

await principal()

console.log(`\n${'─'.repeat(50)}`)
if (fallos.length === 0) {
  console.log(`TODAS LAS PRUEBAS DEL CLIENTE PASARON (${pasadas})`)
} else {
  console.log(`${pasadas} pasaron, ${fallos.length} fallaron:`)
  for (const f of fallos) console.log(`  x ${f}`)
  process.exitCode = 1
}
