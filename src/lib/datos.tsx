import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, ErrorSesion, ErrorSinServidor } from './api'
import { DATASET_VACIO, sinDatos } from '@/data/dataset'
import type { Dataset } from '@/data/dataset'

/**
 * Datos del panel, leídos de la base de datos.
 *
 * Antes esto era un módulo que corría `generarDataset()` al ser importado: todas
 * las pantallas leían de arrays que se habían inventado en el navegador. Ahora el
 * dataset viene de `/api/dataset`, y hay tres estados que no son lo mismo:
 *
 *  - `cargando`: la petición está en vuelo.
 *  - `error`: no se pudo leer. O el servidor no está levantado, o algo falló. No
 *    se muestran ceros, porque un cero parece un dato real.
 *  - `listo`: se recibió el dataset. Puede venir vacío, y es válido: es lo que
 *    hay en una base recién creada.
 *
 * Que el servidor esté caído y que la sesión haya caducado se guardan por
 * separado, porque llevan a pantallas distintas. Lo de la sesión lo resuelve el
 * proveedor de sesión; aquí solo se deja de fingir que hay datos.
 */

export type EstadoDatos = 'cargando' | 'error' | 'listo'

export interface ContextoDatos {
  estado: EstadoDatos
  /** El dataset recibido. `DATASET_VACIO` mientras carga, para que las páginas no revienten. */
  datos: Dataset
  /** `true` cuando el servidor respondió bien pero la base no tiene filas. */
  vacio: boolean
  error: Error | null
  /** `true` si el fallo fue porque el servidor no está levantado. */
  sinServidor: boolean
  /** Fecha de corte con la que el servidor calculó los derivados. */
  fechaCorte: string
  /**
   * Instante en que llegaron estos datos.
   *
   * Existe para lo que depende del "ahora" —el avance de las unidades en el
   * mapa, la cuenta atrás de una ETA— y se calcula una vez por respuesta, al
   * llegar los datos y no durante el render. Leer la hora del sistema mientras
   * se pinta hace que dos escenas del mismo segundo muestren horas distintas, y
   * además obliga a cada pantalla a guardarse la suya.
   */
  ahora: Date
  /** Vuelve a pedir los datos; útil tras crear o editar algo. */
  recargar: () => void
}

const Contexto = createContext<ContextoDatos | null>(null)

/** Claves que tienen que venir como lista en la respuesta del dataset. */
const LISTAS = [
  'camiones',
  'conductores',
  'clientes',
  'viajes',
  'viajesHistoricos',
  'viajesTodos',
  'facturas',
  'mantenimientos',
  'incidentes',
  'abastecimientos',
  'gastos',
  'finanzasMensuales',
] as const

/**
 * Comprueba que la respuesta de la API tenga la forma que el panel espera.
 *
 * El cliente devuelve `unknown` a propósito, porque la forma de un JSON no se
 * verifica sola. Sin esta comprobación, si el servidor dejara de mandar una
 * columna, la página la pintaría como `undefined` sin avisar: un `NaN` suelto en
 * una tarjeta, o una tabla a la que le falta media fila. Con la comprobación, el
 * desajuste sale a la luz con un mensaje que dice qué falta.
 *
 * Si someday el servidor responde con menos campos de los de aquí, esto hay que
 * tocarlo en el mismo commit que el cambio del servidor.
 */
function verificarDataset(valor: unknown): Dataset {
  if (typeof valor !== 'object' || valor === null) {
    throw new Error('La API no devolvió un dataset')
  }
  const d = valor as Record<string, unknown>

  const faltan = LISTAS.filter((clave) => !Array.isArray(d[clave]))
  if (faltan.length > 0) {
    throw new Error(`La API no devolvió las listas: ${faltan.join(', ')}`)
  }
  if (typeof d.catalogo !== 'object' || d.catalogo === null) {
    throw new Error('La API no devolvió el catálogo de ciudades y rutas')
  }
  if (typeof d.fechaCorte !== 'string') {
    throw new Error('La API no devolvió la fecha de corte')
  }

  return valor as Dataset
}

export function ProveedorDeDatos({ children }: { children: ReactNode }) {
  const [intento, setIntento] = useState(0)
  // La respuesta se guarda junto al número de intento que la pidió. Así el
  // estado se deduce al pintar, en vez de declarar tres veces dentro del efecto:
  // si no, al recargar había que poner "cargando" a mano, y eso pinta un estado
  // viejo un instante de más en cada reintento.
  const [respuesta, setRespuesta] = useState<{
    intento: number
    datos: Dataset | null
    error: Error | null
    ahora: Date
  }>({ intento: -1, datos: null, error: null, ahora: new Date(0) })

  useEffect(() => {
    const control = new AbortController()
    let vivo = true

    api
      .dataset(control.signal)
      .then((datos) => {
        if (!vivo) return
        setRespuesta({ intento, datos: verificarDataset(datos), error: null, ahora: new Date() })
      })
      .catch((e: unknown) => {
        if (!vivo || (e instanceof DOMException && e.name === 'AbortError')) return
        // Si la sesión caducó, el proveedor de sesión ya está mandando a
        // entrar; esta pantalla no tiene que avisar dos veces.
        if (e instanceof ErrorSesion) return
        setRespuesta({ intento, datos: null, error: e instanceof Error ? e : new Error(String(e)), ahora: new Date() })
      })

    return () => {
      vivo = false
      control.abort()
    }
  }, [intento])

  const recargar = useCallback(() => setIntento((n) => n + 1), [])

  // Mientras se recarga se conservan los datos anteriores, para que la cabecera
  // no se quede sin fecha un instante. Lo que se decide es si lo que hay en
  // pantalla corresponde a la petición que está en vuelo.
  const esDeEsteIntento = respuesta.intento === intento
  const datos = respuesta.datos ?? DATASET_VACIO
  const error = esDeEsteIntento ? respuesta.error : null
  const estado: EstadoDatos = !esDeEsteIntento ? 'cargando' : error ? 'error' : 'listo'

  const valor = useMemo<ContextoDatos>(
    () => ({
      estado,
      datos,
      vacio: estado === 'listo' && sinDatos(datos),
      fechaCorte: datos.fechaCorte,
      ahora: respuesta.ahora,
      error,
      sinServidor: error instanceof ErrorSinServidor,
      recargar,
    }),
    [estado, datos, error, respuesta.ahora, recargar],
  )

  return <Contexto value={valor}>{children}</Contexto>
}

export function useDatos(): ContextoDatos {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useDatos debe usarse dentro de ProveedorDeDatos')
  return ctx
}
