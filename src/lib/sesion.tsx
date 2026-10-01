import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, alCaducarLaSesion, ErrorSinServidor, type Rol, type Sesion } from './api'

/**
 * Estado de sesión de la aplicación.
 *
 * Hay que distinguir tres situaciones que se parecen pero obligan a hacer cosas
 * distintas:
 *
 *  - `cargando`: aún no sabemos si hay sesión abierta.
 *  - `invitado`: el servidor respondió y no hay nadie dentro.
 *  - `sin-servidor`: el servidor no está levantado. No es lo mismo que estar
 *    desconectado de una cuenta: la aplicación entera no puede funcionar.
 */
export type EstadoSesion = 'cargando' | 'invitado' | 'autenticado' | 'sin-servidor'

interface ContextoSesion {
  estado: EstadoSesion
  sesion: Sesion | null
  entrar: (email: string, contrasena: string) => Promise<void>
  salir: () => Promise<void>
  /** `true` si el rol alcanza para lo pedido. Sin sesión, siempre `false`. */
  puede: (minimo: Rol) => boolean
}

const Contexto = createContext<ContextoSesion | null>(null)

/** Jerarquía de roles, igual que en el servidor. */
const JERARQUIA: Record<Rol, number> = { lectura: 1, operador: 2, admin: 3 }

export function ProveedorDeSesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>('cargando')
  const [sesion, setSesion] = useState<Sesion | null>(null)

  // Al abrir la aplicación se pregunta si la cookie sigue siendo válida. No hace
  // falta guardar token: la cookie es HttpOnly y la manda el navegador sola.
  useEffect(() => {
    const control = new AbortController()
    let vivo = true

    api
      .estado(control.signal)
      .then((s) => {
        if (!vivo) return
        setSesion(s)
        setEstado(s ? 'autenticado' : 'invitado')
      })
      .catch((e: unknown) => {
        if (!vivo || (e instanceof DOMException && e.name === 'AbortError')) return
        setEstado(e instanceof ErrorSinServidor ? 'sin-servidor' : 'invitado')
      })

    return () => {
      vivo = false
      control.abort()
    }
  }, [])

  // Si la sesión caduca mientras se está usando la aplicación, el servidor
  // responde 401 a cualquier petición. El cliente lo avisa por `alCaducarLaSesion`
  // para que la protección de rutas mande a entrar, en vez de dejar páginas
  // mostrando datos a medias.
  useEffect(
    () =>
      alCaducarLaSesion(() => {
        setSesion(null)
        setEstado('invitado')
      }),
    [],
  )

  const entrar = useCallback(async (email: string, contrasena: string) => {
    const s = await api.entrar(email, contrasena)
    setSesion(s)
    setEstado('autenticado')
  }, [])

  const salir = useCallback(async () => {
    try {
      await api.salir()
    } catch {
      // Si cerrar sesión en el servidor falla, la cookie local se ignora igual:
      // es preferible desloguear de más que dejar a alguien dentro sin querer.
    }
    setSesion(null)
    setEstado('invitado')
  }, [])

  const puede = useCallback(
    (minimo: Rol) => (sesion ? JERARQUIA[sesion.rol] >= JERARQUIA[minimo] : false),
    [sesion],
  )

  const valor = useMemo(
    () => ({ estado, sesion, entrar, salir, puede }),
    [estado, sesion, entrar, salir, puede],
  )

  return <Contexto value={valor}>{children}</Contexto>
}

export function useSesion() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useSesion debe usarse dentro de ProveedorDeSesion')
  return ctx
}
