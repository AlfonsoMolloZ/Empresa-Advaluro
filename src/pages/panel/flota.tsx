import { Gauge, Snowflake, Truck, Wrench } from 'lucide-react'
import { SeccionHeader } from '@/components/seccion'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ETIQUETA_ESTADO_CAMION } from '@/data/catalogo'
import { Cargando, ErrorDatos, SinDatos } from '@/components/estados-datos'
import { fechaCorta, km, numero, porcentaje, soles } from '@/lib/formato'
import { usePanel } from '@/lib/panel'

const TONO_ESTADO: Record<string, string> = {
  en_ruta: 'bg-info/12 text-info',
  cargando: 'bg-accent/15 text-accent',
  descargando: 'bg-accent/15 text-accent',
  disponible: 'bg-muted text-muted-foreground',
  mantenimiento: 'bg-warning/20 text-warning-foreground',
  fuera_de_servicio: 'bg-destructive/12 text-destructive',
}

export default function Flota() {
  const { estado, vacio, error, sinServidor, recargar, camiones, mantenimientos, camionPorId, conductorPorId } =
    usePanel()

  if (estado === 'cargando') return <Cargando />
  if (error) return <ErrorDatos error={error} sinServidor={sinServidor} onReintentar={recargar} />
  if (vacio) return <SinDatos />

  const operativos = camiones.filter((c) => c.estado !== 'mantenimiento' && c.estado !== 'fuera_de_servicio')
  const enTaller = camiones.filter((c) => c.estado === 'mantenimiento' || c.estado === 'fuera_de_servicio')
  const capacidadTotal = camiones.reduce((a, c) => a + c.capacidadTon, 0)
  const capacidadDisponible = operativos.reduce((a, c) => a + c.capacidadTon, 0)
  const tonTransportadas = camiones.reduce((a, c) => a + c.tonneajeTransportado, 0)

  return (
    <div className="space-y-6">
      <SeccionHeader
        titulo="Flota y estado de camiones"
        descripcion="Disponibilidad de las unidades, kilometraje y mantenimiento programado."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Unidades totales</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{camiones.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">{operativos.length} en operación</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">En taller</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-warning-foreground">{enTaller.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {porcentaje((enTaller.length / camiones.length) * 100, 0)} de la flota
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Capacidad instalada</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{numero(capacidadTotal)} t</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {numero(capacidadDisponible)} t disponibles ahora
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Tonelaje 90 días</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{numero(tonTransportadas)} t</p>
            <p className="mt-1 text-xs text-muted-foreground">por toda la flota</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estado por unidad</CardTitle>
          <CardDescription>Disponibilidad, conductor asignado y utilización de los últimos 90 días</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidad</TableHead>
                <TableHead className="hidden md:table-cell">Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden lg:table-cell">Conductor</TableHead>
                <TableHead className="hidden sm:table-cell">Kilometraje</TableHead>
                <TableHead className="text-right">Viajes 90 d</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Tonelaje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {camiones.map((c) => {
                const conductor = c.conductorId ? conductorPorId(c.conductorId) : null
                const uso =
                  c.viajesUltimos90d === 0 || c.capacidadTon === 0
                    ? 0
                    : (c.tonneajeTransportado / (c.viajesUltimos90d * c.capacidadTon)) * 100
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.placa}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.modelo} · {c.anio}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        {c.tipo === 'refrigerado' && <Snowflake className="size-3.5 text-info" aria-hidden />}
                        <Wrench className="hidden md:inline size-3.5 text-muted-foreground" aria-hidden />
                        {c.capacidadTon} t
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={TONO_ESTADO[c.estado]}>{ETIQUETA_ESTADO_CAMION[c.estado]}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {conductor ? (
                        <span className="text-sm">{conductor.nombres}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Sin asignar</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell tabular-nums">{km(c.kmTotal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.viajesUltimos90d}</TableCell>
                    <TableCell className="hidden text-right lg:table-cell">
                      <div className="tabular-nums">{numero(c.tonneajeTransportado, 1)} t</div>
                      <Progress
                        value={Math.min(100, uso)}
                        indicatorClassName={
                          uso >= 75 ? 'bg-success' : uso >= 55 ? 'bg-warning' : 'bg-destructive'
                        }
                        className="mt-1 h-1 w-20"
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mantenimientos programados</CardTitle>
            <CardDescription>{mantenimientos.length} órdenes abiertas</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {mantenimientos.map((m) => {
                const camion = camionPorId(m.camionId)
                const vencido = new Date(m.fechaProgramada) < new Date('2026-10-18T00:00:00Z')
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm">
                    <span className="font-medium">{camion?.placa}</span>
                    <span className="min-w-0 flex-1 text-muted-foreground">{m.tipo}</span>
                    <span className="tabular-nums text-xs text-muted-foreground">{fechaCorta(m.fechaProgramada)}</span>
                    <span className="tabular-nums text-xs">{soles(m.costoEstimado)}</span>
                    <Badge
                      variant={m.estado === 'en_curso' ? 'secondary' : vencido ? 'destructive' : 'outline'}
                    >
                      {m.estado === 'en_curso' ? 'En curso' : vencido ? 'Atrasado' : 'Programado'}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Antigüedad y kilometraje</CardTitle>
            <CardDescription>Perfil técnico de la flota</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {[...camiones]
                .sort((a, b) => b.kmTotal - a.kmTotal)
                .map((c) => (
                  <li key={c.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{c.placa}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {2026 - c.anio} años · {km(c.kmTotal)}
                      </span>
                    </div>
                    <Progress
                      value={(c.kmTotal / 250_000) * 100}
                      indicatorClassName={c.kmTotal > 180_000 ? 'bg-destructive' : c.kmTotal > 100_000 ? 'bg-warning' : 'bg-success'}
                    />
                  </li>
                ))}
            </ul>
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              <Gauge className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Las unidades con más de 180,000 km están en el rango de evaluación para cambio. El
                kilometraje restante hasta el siguiente servicio se calcula por intervalo de 5,000 km.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Capacidad por tipo de unidad</CardTitle>
          <CardDescription>Dónde está concentrada la flota</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {Object.entries(
              camiones.reduce<Record<string, { unidades: number; capacidad: number }>>((acc, c) => {
                acc[c.tipo] ??= { unidades: 0, capacidad: 0 }
                acc[c.tipo].unidades += 1
                acc[c.tipo].capacidad += c.capacidadTon
                return acc
              }, {}),
            ).map(([tipo, d]) => (
              <li key={tipo}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="inline-flex items-center gap-2 font-medium capitalize">
                    <Truck className="size-4 text-muted-foreground" aria-hidden />
                    {tipo}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {d.unidades} unidad{d.unidades === 1 ? '' : 'es'} · {d.capacidad} t
                  </span>
                </div>
                <Progress value={(d.capacidad / capacidadTotal) * 100} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
