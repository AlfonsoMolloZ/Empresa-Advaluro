/**
 * Prueba de humo del frontend con un navegador de verdad (Edge headless por CDP).
 *
 * Se usa porque el login es la puerta a todo lo demás y conviene comprobar que
 * funciona de verdad: que sin sesión el panel no se ve, que con contraseña
 * errónea sale el error, y que con la correcta se entra.
 *
 * Uso: node server/prueba-navegador.mjs [urlBase]
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CANDIDATOS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]

const urlBase = process.argv[2] ?? 'http://localhost:8804'
const puertoCdp = 9333

const fallos = []
let pasadas = 0
function comprobar(ok, descripcion, extra) {
  if (ok) {
    pasadas++
    console.log(`  ok   ${descripcion}`)
  } else {
    fallos.push(descripcion)
    console.log(`  FALLA ${descripcion}${extra ? ` -> ${JSON.stringify(extra)}` : ''}`)
  }
}

const navegador = CANDIDATOS.find((ruta) => existsSync(ruta))
if (!navegador) {
  console.log('No se encontro Edge ni Chrome: se omite la prueba de navegador.')
  process.exit(0)
}

const perfil = mkdtempSync(join(tmpdir(), 'advaluro-navegador-'))
const hijo = spawn(navegador, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--no-first-run',
  '--disable-extensions',
  `--user-data-dir=${perfil}`,
  `--remote-debugging-port=${puertoCdp}`,
  'about:blank',
], { stdio: 'ignore' })

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/** Espera a que el puerto de depuración responda. */
async function esperarCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${puertoCdp}/json/version`)
      if (r.ok) return true
    } catch {
      /* todavia no */
    }
    await dormir(250)
  }
  return false
}

if (!(await esperarCdp())) {
  hijo.kill()
  rmSync(perfil, { recursive: true, force: true })
  console.log('El navegador no abrio el puerto de depuracion: se omite la prueba.')
  process.exit(0)
}

const objetivos = await (await fetch(`http://127.0.0.1:${puertoCdp}/json/list`)).json()
const pagina = objetivos.find((o) => o.type === 'page')
if (!pagina) throw new Error('el navegador no expone ninguna pestana')

const ws = new WebSocket(pagina.webSocketDebuggerUrl)
await new Promise((r, x) => {
  ws.addEventListener('open', r, { once: true })
  ws.addEventListener('error', x, { once: true })
})

let siguienteId = 1
const pendientes = new Map()
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  const resolver = pendientes.get(msg.id)
  if (resolver) {
    pendientes.delete(msg.id)
    resolver(msg)
  }
})

function cdp(method, params = {}) {
  const id = siguienteId++
  return new Promise((resolver) => {
    pendientes.set(id, resolver)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

/** Navega y espera a que React termine de pintar. */
async function irA(ruta) {
  await cdp('Page.navigate', { url: `${urlBase}${ruta}` })
  await dormir(1400)
}

async function evaluar(expresion) {
  const r = await cdp('Runtime.evaluate', { expression: expresion, returnByValue: true, awaitPromise: true })
  return r.result?.result?.value
}

const textoPagina = () => evaluar('document.body.innerText')
const htmlPagina = () => evaluar('document.documentElement.innerHTML')
const rutaActual = () => evaluar('location.pathname')

try {
  await cdp('Page.enable')
  await cdp('Runtime.enable')

  console.log('\n── Navegador: sin sesión ──')

  await irA('/dashboard')
  comprobar((await textoPagina()).includes('Iniciar sesión'), 'el panel sin sesión muestra la pantalla de entrada')
  comprobar((await htmlPagina()).includes('id="email"'), 'el formulario tiene campo de correo')
  comprobar((await rutaActual()) === '/ingresar', 'la URL queda en /ingresar', await rutaActual())

  console.log('\n── Navegador: contraseña incorrecta ──')

  await evaluar(`
    (() => {
      const poner = (id, valor) => {
        const el = document.getElementById(id)
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(el, valor)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      poner('email', 'admin@advaluro.pe')
      poner('contrasena', 'contrasena-equivocada')
      document.querySelector('form').requestSubmit()
      return true
    })()
  `)
  await dormir(1500)
  const trasError = await textoPagina()
  comprobar(trasError.includes('incorrect'), 'muestra el error de credenciales', trasError.slice(0, 120))
  comprobar((await htmlPagina()).includes('id="contrasena"'), 'sigue en el formulario de entrada')

  console.log('\n── Navegador: contraseña correcta ──')

  // La contraseña se interpola como literal: `Runtime.evaluate` corre en el
  // navegador, donde no existe `process.env`.
  const contrasena = process.env.PRUEBA_CONTRASENA ?? 'clave-de-prueba-123'
  await evaluar(`
    (() => {
      const poner = (id, valor) => {
        const el = document.getElementById(id)
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(el, valor)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      poner('email', 'admin@advaluro.pe')
      poner('contrasena', ${JSON.stringify(contrasena)})
      document.querySelector('form').requestSubmit()
      return true
    })()
  `)
  await dormir(3000)
  const trasEntrar = await textoPagina()
  comprobar((await rutaActual()) === '/dashboard', 'entra al panel', await rutaActual())
  comprobar(!trasEntrar.includes('Iniciar sesión'), 'ya no aparece la pantalla de entrada')
  comprobar(trasEntrar.includes('Advaluro') || trasEntrar.includes('Resumen'), 'se ve el panel')

  console.log('\n── Navegador: la sesión sobrevive a recargar ──')

  await irA('/dashboard')
  comprobar((await rutaActual()) === '/dashboard', 'tras recargar sigue dentro del panel', await rutaActual())
  comprobar(!(await textoPagina()).includes('Iniciar sesión'), 'no vuelve a pedir la contraseña')

  console.log('\n── Navegador: rutas del panel ──')

  for (const ruta of ['/dashboard/viajes', '/dashboard/flota', '/dashboard/financiero', '/dashboard/clientes']) {
    await irA(ruta)
    const t = await textoPagina()
    comprobar(t.length > 120 && !t.includes('Iniciar sesión'), `${ruta} carga contenido`, t.slice(0, 80))
  }

  console.log('\n── Navegador: enlaces antiguos ──')

  await irA('/panel/viajes')
  comprobar((await rutaActual()) === '/dashboard/viajes', '/panel/viajes lleva a /dashboard/viajes', await rutaActual())
  await irA('/panel/financiero')
  comprobar((await rutaActual()) === '/dashboard/financiero', '/panel/financiero conserva la página', await rutaActual())
} catch (e) {
  fallos.push(`excepcion: ${e instanceof Error ? e.message : String(e)}`)
  console.error(e)
} finally {
  try {
    ws.close()
  } catch {
    /* ignorar */
  }
  hijo.kill()
  await dormir(300)
  rmSync(perfil, { recursive: true, force: true })
}

console.log(`\n${'─'.repeat(50)}`)
if (fallos.length === 0) {
  console.log(`TODAS LAS PRUEBAS DE NAVEGADOR PASARON (${pasadas})`)
} else {
  console.log(`${pasadas} pasaron, ${fallos.length} fallaron:`)
  for (const f of fallos) console.log(`  x ${f}`)
  process.exitCode = 1
}
