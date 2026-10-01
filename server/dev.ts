/**
 * Levanta la API y el servidor de desarrollo de Vite juntos, con un solo comando.
 *
 *   npm run dev:full
 *
 * Se hace con `child_process` en vez de con una dependencia como `concurrently`
 * para no añadir nada al proyecto: el paquete `node:child_process` ya está.
 * Ctrl+C corta los dos.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const enWindows = process.platform === 'win32'
const ejecutable = enWindows ? 'npm.cmd' : 'npm'

const hijos: { nombre: string; proceso: ReturnType<typeof spawn> }[] = []

function lanzar(nombre: string, argumentos: string[]) {
  const proceso = spawn(ejecutable, argumentos, {
    cwd: raiz,
    stdio: 'inherit',
    shell: enWindows,
    env: { ...process.env, FORCE_COLOR: '1' },
  })
  proceso.on('exit', (codigo) => {
    if (codigo !== 0 && codigo !== null) {
      console.error(`\n[advaluro] ${nombre} terminó con código ${codigo}`)
    }
    detener(codigo ?? 0)
  })
  hijos.push({ nombre, proceso })
}

let deteniendo = false
function detener(codigo: number) {
  if (deteniendo) return
  deteniendo = true
  for (const { proceso } of hijos) {
    if (!proceso.killed) proceso.kill()
  }
  process.exit(codigo)
}

process.on('SIGINT', () => detener(0))
process.on('SIGTERM', () => detener(0))

const argumentosApi = ['run', 'api']
const argumentosVite = ['run', 'dev']

if (!existsSync(resolve(raiz, '.env'))) {
  console.log(
    '[advaluro] No hay archivo .env. Se usarán los valores por defecto.\n' +
      '           Para cambiar el puerto o la ruta de la base, copia .env.example a .env.\n',
  )
}

console.log('[advaluro] Levantando la API y la interfaz...\n')
// Primero la API, para que el proxy de Vite encuentre algo cuando la página
// empiece a pedir datos.
lanzar('api', argumentosApi)
setTimeout(() => lanzar('interfaz', argumentosVite), 700)
