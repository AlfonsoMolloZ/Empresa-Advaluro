/**
 * Carga de pruebas TypeScript desde Node.
 *
 * El código de la aplicación importa sin extensión (`./geografia`) porque lo
 * empaqueta Vite, que resuelve eso por su cuenta. Node no lo hace, así que al
 * lanzar las pruebas de los cálculos a pelo, `calculos.ts` no encontraba
 * `geografia.ts` y el fallo era de resolución de módulos, no del código probado.
 *
 * Hay dos formas de arreglarlo: poner extensiones `.ts` en todos los imports de
 * la aplicación —lo que ata el código a Node y obliga a tocar el tsconfig— o
 * resolverlas solo en las pruebas. Se elige lo segundo, que es donde está el
 * problema, con un hook que devuelve el archivo tal cual si existe con `.ts`,
 * `.tsx` o `/index.ts`.
 *
 * Este mismo archivo se registra a sí mismo como hook, de modo que se invoca
 * con `node --import ./server/carga-extension-ts.mjs ...` y no hace falta un
 * segundo archivo ni `--experimental-loader`.
 */

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { register } from 'node:module'

register('./carga-extension-ts.mjs', import.meta.url)

const TIENE_EXTENSION = /\.[cm]?[jt]sx?$/

export async function resolve(especificador, contexto, siguiente) {
  try {
    return await siguiente(especificador, contexto)
  } catch (error) {
    const relativo = especificador.startsWith('.')
    if (!relativo || TIENE_EXTENSION.test(especificador) || !contexto.parentURL) throw error

    const base = new URL(especificador, contexto.parentURL)
    for (const sufijo of ['.ts', '.tsx', '/index.ts']) {
      const candidato = new URL(base.href + sufijo)
      if (existsSync(fileURLToPath(candidato))) return siguiente(candidato.href, contexto)
    }
    throw error
  }
}
