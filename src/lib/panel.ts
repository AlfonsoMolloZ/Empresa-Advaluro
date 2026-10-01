import { useMemo } from 'react'
import { useDatos } from './datos'
import {
  composicionCostos,
  distribucionPorRubro,
  facturacionPorCliente,
  kpisResumen,
  margenBrutoViaje,
  margenDe,
  onTimeRate,
  rankingRutas,
  serieFinanciera,
  utilizacionFlota,
  variacion,
} from '@/data/calculos'
import { buscarCiudad, buscarRuta } from '@/data/geografia'
import type { Ciudad, Ruta } from '@/data/types'
import type { Dataset, ViajeApi } from '@/data/dataset'

/**
 * Los datos del panel con la forma que las pantallas ya usaban.
 *
 * Antes cada página hacía `import { camiones, kpisResumen } from '@/data'`. Eso
 * era cómodo mientras los datos venían de un módulo, pero con la base real hay
 * que esperar a que responda: los cálculos no se pueden resolver en el import.
 *
 * Este hook devuelve los mismos nombres, ya calculados sobre el dataset que llegó
 * del servidor, para que migrar una pantalla sea cambiar el import por una línea
 * y añadir el aviso de carga. Los cálculos de verdad viven en
 * `@/data/calculos`, como funciones puras; aquí solo se reparten.
 */
export function usePanel() {
  const { estado, vacio, error, sinServidor, recargar, datos, fechaCorte, ahora } = useDatos()

  const calculado = useMemo(() => {
    const d: Dataset = datos

    // Aceptan `null` porque la base lo permite: un viaje puede no tener cliente
    // asignado todavía, y un camión puede estar sin conductor.
    const camionPorId = (id: string | null | undefined) => d.camiones.find((c) => c.id === id)
    const conductorPorId = (id: string | null | undefined) => d.conductores.find((c) => c.id === id)
    const clientePorId = (id: string | null | undefined) => d.clientes.find((c) => c.id === id)

    // Las ciudades y rutas se buscan primero en el catálogo que manda el
    // servidor, y solo si no están se recurre a la geografía estática.
    //
    // El orden importa y no es un detalle: los identificadores que crea la API
    // son del tipo `nuevo-lz3k9-4f2a`, así que una ruta dada de alta desde la
    // interfaz no está —ni puede estar— en la lista estática del frontend. Con
    // `getRuta` de antes, que lanza excepción si no encuentra el id, abrir la
    // página de viajes con esa ruta se caía en blanco. Con una base vacía el
    // catálogo tampoco sirve, y por eso la geografía estática sigue siendo el
    // respaldo: es lo único que hay antes de registrar nada.
    const ciudad = (id: string | null | undefined): Ciudad | undefined =>
      (id ? d.catalogo.ciudades.find((c) => c.id === id) : undefined) ?? buscarCiudad(id)
    const ruta = (id: string | null | undefined): Ruta | undefined =>
      (id ? d.catalogo.rutas.find((r) => r.id === id) : undefined) ?? buscarRuta(id)

    /** "Lima - Trujillo", o el identificador suelto si la ruta no está en ninguna parte. */
    const nombreRuta = (rutaId: string | null | undefined): string => {
      const r = ruta(rutaId)
      if (!r) return rutaId ?? '—'
      return `${ciudad(r.origenId)?.nombre ?? r.origenId} - ${ciudad(r.destinoId)?.nombre ?? r.destinoId}`
    }

    /**
     * Qué parte del trayecto ha recorrido la unidad, de 0 a 1.
     *
     * Se mide contra la hora de llegada real cuando la hay: un viaje entregado
     * debe aparecer en el final del recorrido, no en el punto donde le habría
     * tocado estar "ahora" según la hora de salida. Para los viajes que siguen
     * abiertos se usa la hora de llegada prevista, que es lo único que se sabe.
     */
    const avanceDe = (v: ViajeApi, ahora: Date): number => {
      const inicio = new Date(v.salida).getTime()
      const fin = new Date(v.llegadaReal ?? v.llegadaProgramada).getTime()
      if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return 0
      const t = (ahora.getTime() - inicio) / (fin - inicio)
      return Math.min(1, Math.max(0, t))
    }

    /**
     * Punto del mapa donde está la unidad.
     *
     * Se interpola entre el origen y el destino del viaje, que el servidor ya
     * trae resueltos, en vez de seguir el trazado de `puntoEnRuta`: ese
     * trazado vive en la geografía estática y solo existe para las rutas
     * escritas a mano. Devuelve `null` si no se conocen las dos ciudades, para
     * que quien dibuja pueda saltarse ese viaje en vez de romper la página.
     */
    const puntoEnViaje = (v: ViajeApi, progreso: number): { lat: number; lng: number } | null => {
      const a = ciudad(v.origenId)
      const b = ciudad(v.destinoId)
      if (!a || !b) return null
      const t = Math.min(1, Math.max(0, progreso))
      // La misma curvatura que usaba la ruta estática, para que el trazo no sea
      // una línea recta perfecta entre dos ciudades.
      const curva = Math.sin(t * Math.PI) * 0.06
      return { lat: a.lat + (b.lat - a.lat) * t + curva, lng: a.lng + (b.lng - a.lng) * t }
    }

    return {
      ...d,
      fechaCorte,
      ahora,
      camionPorId,
      conductorPorId,
      clientePorId,
      ciudad,
      ruta,
      nombreRuta,
      avanceDe,
      puntoEnViaje,
      kpisResumen: () => kpisResumen(d),
      onTimeRate: (lista?: ViajeApi[]) => onTimeRate(lista ?? d.viajesTodos),
      utilizacionFlota: (lista?: ViajeApi[]) => utilizacionFlota(d, lista),
      margenDe,
      margenBrutoViaje,
      variacion,
      serieFinanciera: () => serieFinanciera(d),
      composicionCostos: () => composicionCostos(d),
      distribucionPorRubro: (dias?: number) => distribucionPorRubro(d, dias),
      rankingRutas: (limite?: number) => rankingRutas(d, limite),
      facturacionPorCliente: () => facturacionPorCliente(d),
    }
  }, [datos, fechaCorte, ahora])

  return { ...calculado, estado, vacio, error, sinServidor, recargar }
}

export type Panel = ReturnType<typeof usePanel>
