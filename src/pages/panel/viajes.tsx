import { useMemo } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, ZoomControl } from 'react-leaflet'
import L from 'leaflet'
import { Clock, MapPin, Snowflake, Thermometer, Truck } from 'lucide-react'
import { SeccionHeader } from '@/components/seccion'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ETIQUETAS_CORREDOR } from '@/data'
import { ETIQUETA_CARROCERIA } from '@/data/catalogo'
import { Cargando, ErrorDatos, SinDatos } from '@/components/estados-datos'
import { fechaCorta, hora, km, numero, porcentaje, relativo, soles } from '@/lib/formato'
import { usePanel } from '@/lib/panel'
import type { CamionApi, ConductorApi, ViajeApi, CiudadApi } from '@/data/dataset'

/**
 * El icono por defecto de Leaflet referencia imágenes que no se empaquetan con
 * Vite, así que se construye un pin propio como divIcon (inline, sin assets).
 */
function crearPin(retraso: boolean) {
  const color = retraso ? 'var(--destructive)' : 'var(--primary)'
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};border:2.5px solid white;box-shadow:0 1px 4px rgb(0 0 0 / .45)"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  })
}

function MapaOperacion({
  viajes,
  ahora,
  camionPorId,
  conductorPorId,
  ciudad,
  puntoEnViaje,
  avanceDe,
  nombreRuta,
}: {
  viajes: ViajeApi[]
  ahora: Date
  camionPorId: (id: string | null | undefined) => CamionApi | undefined
  conductorPorId: (id: string | null | undefined) => ConductorApi | undefined
  ciudad: (id: string | null | undefined) => CiudadApi | undefined
  puntoEnViaje: (v: ViajeApi, progreso: number) => { lat: number; lng: number } | null
  avanceDe: (v: ViajeApi, ahora: Date) => number
  nombreRuta: (rutaId: string | null | undefined) => string
}) {
  const activos = viajes.filter((v) => v.estado === 'en_curso' || v.estado === 'retrasado')

  const pinNormal = useMemo(() => crearPin(false), [])
  const pinRetraso = useMemo(() => crearPin(true), [])

  const trazos = useMemo(
    () =>
      activos
        .map((v) => {
          const a = ciudad(v.origenId)
          const b = ciudad(v.destinoId)
          // Un mínimo de 3% y un máximo de 97% para que un pin no desaparezca en
          // el extremo de la línea cuando la unidad acaba de salir o está a
          // punto de llegar.
          const punto = puntoEnViaje(v, Math.min(0.97, Math.max(0.03, avanceDe(v, ahora))))
          // Si no se conocen las dos ciudades del viaje, no hay línea que
          // dibujar; se salta ese viaje en vez de romper el mapa entero.
          if (!a || !b || !punto) return null
          // El trazo va del origen al punto actual, y de ahí al destino punteado.
          return {
            id: v.id,
            recorrido: [
              [a.lat, a.lng],
              [punto.lat, punto.lng],
            ] as [number, number][],
            restante: [
              [punto.lat, punto.lng],
              [b.lat, b.lng],
            ] as [number, number][],
            retraso: v.estado === 'retrasado',
          }
        })
        .filter((t): t is NonNullable<typeof t> => t !== null),
    [activos, ahora, ciudad, puntoEnViaje, avanceDe],
  )

  return (
    <MapContainer
      center={[-11.2, -75.5]}
      zoom={5}
      minZoom={4}
      scrollWheelZoom
      className="h-[420px] w-full rounded-lg"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomControl position="bottomright" />

      {trazos.map((t) => (
        <g key={t.id}>
          <Polyline
            positions={t.recorrido}
            pathOptions={{ color: t.retraso ? 'var(--destructive)' : 'var(--primary)', weight: 3, opacity: 0.85 }}
          />
          <Polyline
            positions={t.restante}
            pathOptions={{ color: t.retraso ? 'var(--destructive)' : 'var(--primary)', weight: 2, opacity: 0.3, dashArray: '5 6' }}
          />
        </g>
      ))}

      {activos.map((v) => {
        const p = puntoEnViaje(v, Math.min(0.97, Math.max(0.03, avanceDe(v, ahora))))
        if (!p) return null
        const camion = camionPorId(v.camionId)
        const retraso = v.estado === 'retrasado'
        return (
          <Marker key={v.id} position={[p.lat, p.lng]} icon={retraso ? pinRetraso : pinNormal}>
            <Popup>
              <div className="min-w-52 space-y-1 text-xs">
                <p className="text-sm font-semibold">{camion?.placa}</p>
                <p className="text-muted-foreground">{ETIQUETA_CARROCERIA[camion?.tipo ?? 'plataforma']}</p>
                <p>{nombreRuta(v.rutaId)}</p>
                <p>
                  Carga: {numero(v.toneladas, 1)} t de {numero(camion?.capacidadTon ?? 0)} t
                </p>
                <p>Conductor: {conductorPorId(v.conductorId)?.nombres}</p>
                <p>ETA: {fechaCorta(v.llegadaProgramada)} {hora(v.llegadaProgramada)}</p>
                <Badge variant={retraso ? 'destructive' : 'secondary'}>
                  {retraso ? 'Con retraso' : 'En ruta'}
                </Badge>
              </div>
            </Popup>
          </Marker>
        )
      })}

      {/* Nodos de las plazas con operación */}
      {Array.from(
        new Set(activos.flatMap((v) => [v.origenId, v.destinoId])),
      )
        .map((ciudadId) => ciudad(ciudadId))
        .filter((c): c is NonNullable<typeof c> => c !== undefined)
        .map((c) => (
          <CircleMarker
            key={`nodo-${c.id}`}
            center={[c.lat, c.lng]}
            radius={4}
            pathOptions={{ color: 'var(--accent)', fillColor: 'var(--accent)', fillOpacity: 0.9, weight: 1 }}
          >
            <Popup>
              <p className="text-sm font-semibold">{c.nombre}</p>
              <p className="text-xs text-muted-foreground">{c.departamento}</p>
            </Popup>
          </CircleMarker>
        ))}
    </MapContainer>
  )
}

export default function Viajes() {
  const {
    estado,
    vacio,
    error,
    sinServidor,
    recargar,
    ahora,
    viajes,
    rankingRutas,
    clientePorId,
    camionPorId,
conductorPorId,
     ahora,
     ruta,
   } = usePanel()

  if (estado === 'cargando') return <Cargando />
  if (error) return <ErrorDatos error={error} sinServidor={sinServidor} onReintentar={recargar} />
  if (vacio) return <SinDatos />

  const activos = viajes.filter((v) => v.estado === 'en_curso' || v.estado === 'retrasado')
  const programados = viajes.filter((v) => v.estado === 'programado')
  const rutas = rankingRutas(6)

  const conRetraso = activos.filter((v) => v.estado === 'retrasado').length

  return (
    <div className="space-y-6">
      <SeccionHeader
        titulo="Viajes y rutas"
        descripcion="Posición de las unidades en ruta y desempeño de los corredoreslogísticos."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="sm:col-span-2 xl:col-span-1">
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">En ruta ahora</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{activos.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">{programados.length} programados por salir</p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-2 xl:col-span-1">
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Con retraso</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-destructive">{conRetraso}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activos.length === 0 ? '—' : porcentaje((conRetraso / activos.length) * 100, 0)} del total en ruta
            </p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-2 xl:col-span-1">
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Kilómetros en curso</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {numero(activos.reduce((a, v) => a + v.km, 0))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">por completar</p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-2 xl:col-span-1">
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Corredores activos</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {new Set(activos.map((v) => ruta(v.rutaId)?.tipo).filter(Boolean)).size}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">de 4 corredores del país</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mapa de operación en vivo</CardTitle>
          <CardDescription>
            Trayecto recorrido en línea continua y tramo pendiente punteado. Haz clic en una unidad para ver su ficha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MapaOperacion
        viajes={viajes}
        ahora={ahora}
        camionPorId={camionPorId}
        conductorPorId={conductorPorId}
      />
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-6 rounded bg-primary" /> Recorrido
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-6 rounded bg-destructive" /> Con retraso
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-accent" /> Plaza de operación
            </span>
            <span className="ml-auto">Datos del 18 oct 2026, 08:00</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unidades en ruta</CardTitle>
          <CardDescription>Detalle de carga, avance y hora estimada de llegada</CardDescription>
        </CardHeader>
        <CardContent>
<ul className="divide-y">
              {activos.map((v) => {
                const camion = camionPorId(v.camionId)
                const cliente = clientePorId(v.clienteId)
                const ocupacion = (v.toneladas / (camion?.capacidadTon ?? 1)) * 100
                const avance = avanceDe(v, ahora) * 100
                const r = ruta(v.rutaId)
                const origen = ciudad(r?.origenId)
                const destino = ciudad(r?.destinoId)
                return (
                  <li key={v.id} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-xs text-muted-foreground">{v.referencia}</span>
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Truck className="size-4 text-muted-foreground" aria-hidden />
                          {camion?.placa}
                        </span>
                        <Badge variant="outline">{ETIQUETA_CARROCERIA[camion?.tipo ?? 'plataforma']}</Badge>
                        {v.temperaturaC !== null && (
                          <Badge variant="secondary" className="gap-1 bg-info/12 text-info">
                            <Snowflake className="size-3" aria-hidden />
                            {v.temperaturaC} °C
                          </Badge>
                        )}
                        <Badge variant={v.estado === 'retrasado' ? 'destructive' : 'secondary'}>
                          {v.estado === 'retrasado' ? 'Con retraso' : 'En ruta'}
                        </Badge>
                      </div>

                      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                        <MapPin className="size-3.5 text-muted-foreground" aria-hidden />
                        <span className="font-medium">{origen?.nombre ?? '—'}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">{destino?.nombre ?? '—'}</span>
                        <span className="text-xs text-muted-foreground">
                          ({km(v.km)} · {ETIQUETAS_CORREDOR[r?.tipo ?? 'transversal']})
                        </span>
                      </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {cliente?.razonSocial} · {numero(v.toneladas, 1)} t de {numero(camion?.capacidadTon ?? 0)} t · flete{' '}
                      {soles(v.flete)}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" aria-hidden />
                        Salida {fechaCorta(v.salida)} {hora(v.salida)}
                      </span>
                      <span>ETA {relativo(v.llegadaProgramada, ahora)}</span>
                    </div>
                    <Progress value={avance} />
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground tabular-nums">{porcentaje(avance, 0)} del trayecto</span>
                      <span className="inline-flex items-center gap-1 text-muted-foreground tabular-nums">
                        <Thermometer className="size-3" aria-hidden />
                        ocupación {porcentaje(ocupacion, 0)}
                      </span>
                    </div>
                  </div>
                </li>
              )
            })}
            {activos.length === 0 && (
              <li className="py-8 text-center text-sm text-muted-foreground">Sin viajes en curso.</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Corredores más transitados</CardTitle>
          <CardDescription>Puntualidad promedio por ruta, histórica</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {rutas.map((r) => (
              <li key={r.rutaId}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">
                    {r.origen} <span className="text-muted-foreground">→</span> {r.destino}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {r.viajes} viajes · {km(r.km)}
                  </span>
                </div>
                <Progress
                  value={r.puntualidad}
                  indicatorClassName={
                    r.puntualidad >= 90 ? 'bg-success' : r.puntualidad >= 80 ? 'bg-warning' : 'bg-destructive'
                  }
                />
                <p className="mt-0.5 text-right text-xs text-muted-foreground tabular-nums">
                  {porcentaje(r.puntualidad)} a tiempo
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
