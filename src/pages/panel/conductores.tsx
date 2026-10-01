import { Award, Clock, ShieldAlert, Star, UserRound } from 'lucide-react'
import { Cargando, ErrorDatos, SinDatos } from '@/components/estados-datos'
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
import type { IncidenteApi } from '@/data/dataset'
import { fechaCorta, numero, porcentaje, soles } from '@/lib/formato'
import { usePanel } from '@/lib/panel'

const ETIQUETA_INCIDENTE: Record<IncidenteApi['tipo'], string> = {
  accidente: 'Accidente',
  averia: 'Avería mecánica',
  retraso_critico: 'Retraso crítico',
  multa: 'Multa',
  devolucion_carga: 'Devolución de carga',
}

const TONO_SEVERIDAD: Record<IncidenteApi['severidad'], string> = {
  baja: 'bg-muted text-muted-foreground',
  media: 'bg-warning/20 text-warning-foreground',
  alta: 'bg-destructive/12 text-destructive',
}

export default function Conductores() {
  const { estado, vacio, error, sinServidor, recargar, conductores, incidentes } = usePanel()

  if (estado === 'cargando') return <Cargando />
  if (error) return <ErrorDatos error={error} sinServidor={sinServidor} onReintentar={recargar} />
  if (vacio) return <SinDatos />

  const activos = conductores.filter((c) => c.estado === 'activo')
  const enDescanso = conductores.filter((c) => c.estado === 'descanso')
  const conLicencia = conductores.filter((c) => c.estado === 'licencia_medica')

  // El `Math.max(1, ...)` evita el NaN que salía al dividir entre cero: con la
  // base vacía estos promedios se pintan como 0, que es lo que significan.
  const experienciaPromedio = conductores.reduce((a, c) => a + c.experienciaAnios, 0) / Math.max(1, conductores.length)
  const puntajePromedio = conductores.reduce((a, c) => a + c.puntaje, 0) / Math.max(1, conductores.length)

  const incidentesPorSeveridad = (['alta', 'media', 'baja'] as const).map((s) => ({
    severidad: s,
    total: incidentes.filter((i) => i.severidad === s).length,
  }))

  const costoIncidentes = incidentes.reduce((a, i) => a + i.costo, 0)

  return (
    <div className="space-y-6">
      <SeccionHeader
        titulo="Conductores y seguridad"
        descripcion="Desempeño por conductor, cumplimiento de jornada e incidentes."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Conductores en ruta</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{activos.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {enDescanso.length} en descanso · {conLicencia.length} con licencia médica
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Experiencia media</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{experienciaPromedio.toFixed(1)} años</p>
            <p className="mt-1 text-xs text-muted-foreground">de {conductores.length} conductores en planilla</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Puntaje medio</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{puntajePromedio.toFixed(0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">escala de 0 a 100</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Costo de incidentes</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{soles(costoIncidentes)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{incidentes.length} eventos registrados</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Desempeño por conductor</CardTitle>
          <CardDescription>Puntaje, jornada y días consecutivos en ruta</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conductor</TableHead>
                <TableHead className="hidden sm:table-cell">Licencia</TableHead>
                <TableHead className="hidden lg:table-cell">Estado</TableHead>
                <TableHead className="hidden md:table-cell">Viajes</TableHead>
                <TableHead className="hidden lg:table-cell">Jornada</TableHead>
                <TableHead className="text-right">Puntaje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...conductores]
                .sort((a, b) => b.puntaje - a.puntaje)
                .map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-medium">
                          {c.nombres
                            .split(' ')
                            .slice(0, 2)
                            .map((p) => p[0])
                            .join('')}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{c.nombres}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {c.experienciaAnios} años · base {c.base}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs sm:table-cell">{c.licencia}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge
                        variant={c.estado === 'activo' ? 'secondary' : 'outline'}
                        className={c.estado === 'activo' ? 'bg-success/12 text-success' : ''}
                      >
                        {c.estado === 'activo' ? 'En ruta' : c.estado === 'descanso' ? 'Descanso' : 'Licencia'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden tabular-nums md:table-cell">{numero(c.viajesCompletados)}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {c.estado === 'activo' ? (
                        <span
                          className={`text-sm tabular-nums ${c.horasSemana > 60 ? 'text-destructive' : c.horasSemana > 52 ? 'text-warning-foreground' : ''}`}
                        >
                          {c.horasSemana.toFixed(0)} h/sem
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`font-medium tabular-nums ${c.puntaje >= 85 ? 'text-success' : c.puntaje >= 75 ? '' : 'text-destructive'}`}
                      >
                        {c.puntaje}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Incidentes registrados</CardTitle>
            <CardDescription>Averías, multas y accidents en el periodo</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {incidentes.map((i) => (
                <li key={i.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3 text-sm">
                  <span className="w-14 shrink-0 text-xs text-muted-foreground">{fechaCorta(i.fecha)}</span>
                  <Badge className={TONO_SEVERIDAD[i.severidad]}>{i.severidad}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{ETIQUETA_INCIDENTE[i.tipo]}</span>
                    <span className="block text-xs text-muted-foreground">{i.descripcion}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{soles(i.costo)}</span>
                  <Badge variant="outline" className="shrink-0 capitalize">
                    {i.estado.replace('_', ' ')}
                  </Badge>
                </li>
              ))}
              {incidentes.length === 0 && (
                <li className="py-8 text-center text-sm text-muted-foreground">Sin incidentes registrados.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumen de seguridad</CardTitle>
            <CardDescription>Distribución por severidad</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {incidentesPorSeveridad.map(({ severidad, total }) => (
                <li key={severidad}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="inline-flex items-center gap-2 capitalize">
                      {severidad === 'alta' ? (
                        <ShieldAlert className="size-4 text-destructive" aria-hidden />
                      ) : severidad === 'media' ? (
                        <Clock className="size-4 text-warning-foreground" aria-hidden />
                      ) : (
                        <Award className="size-4 text-muted-foreground" aria-hidden />
                      )}
                      Severidad {severidad}
                    </span>
                    <span className="tabular-nums">{total}</span>
                  </div>
                  <Progress
                    value={(total / Math.max(1, incidentes.length)) * 100}
                    indicatorClassName={
                      severidad === 'alta' ? 'bg-destructive' : severidad === 'media' ? 'bg-warning' : 'bg-primary'
                    }
                  />
                </li>
              ))}
            </ul>

            <div className="mt-6 space-y-3 border-t pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Star className="size-4" aria-hidden />
                  Conductores sin incidentes
                </span>
                <span className="font-medium tabular-nums">
                  {conductores.filter((c) => !incidentes.some((i) => i.conductorId === c.id)).length}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <UserRound className="size-4" aria-hidden />
                  Con al menos un incidente
                </span>
                <span className="font-medium tabular-nums">
                  {conductores.filter((c) => incidentes.some((i) => i.conductorId === c.id)).length}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top conductores</CardTitle>
          <CardDescription>Los tres mejores puntajes del periodo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            {[...conductores]
              .sort((a, b) => b.puntaje - a.puntaje)
              .slice(0, 3)
              .map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border p-4">
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${
                      i === 0 ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.nombres}</p>
                    <p className="text-xs text-muted-foreground">
                      {numero(c.viajesCompletados)} viajes · {c.experienciaAnios} años
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-success tabular-nums">
                      {c.puntaje} pts · {porcentaje(c.horasSemana, 0)} jornada
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
