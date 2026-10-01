import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Boxes, Fuel, HardHat, Mountain, Package, Snowflake, Sprout } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Cargando, ErrorDatos, SinDatos } from '@/components/estados-datos'
import { SeccionHeader } from '@/components/seccion'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { RUBROS } from '@/data'
import type { RubroCarga } from '@/data/types'
import { numero, porcentaje, soles, solesCompacto, valorNumerico } from '@/lib/formato'
import { usePanel } from '@/lib/panel'

const ICONO: Record<RubroCarga, LucideIcon> = {
  refrigerados: Snowflake,
  combustibles: Fuel,
  minerales: Mountain,
  construccion: HardHat,
  carga_general: Package,
  agroindustria: Sprout,
}

const COLOR: Record<RubroCarga, string> = {
  refrigerados: 'var(--chart-3)',
  combustibles: 'var(--chart-6)',
  minerales: 'var(--chart-5)',
  construccion: 'var(--chart-1)',
  carga_general: 'var(--chart-4)',
  agroindustria: 'var(--chart-2)',
}

export default function Carga() {
  const { estado, vacio, error, sinServidor, recargar, distribucionPorRubro } = usePanel()

  if (estado === 'cargando') return <Cargando />
  if (error) return <ErrorDatos error={error} sinServidor={sinServidor} onReintentar={recargar} />
  if (vacio) return <SinDatos />

  // Esto se calcula dentro del componente y no al importar el módulo: con la base
  // real los números no existen hasta que responde el servidor.
  const rubros = distribucionPorRubro()
  const toneladaTotal = rubros.reduce((a, r) => a + r.toneladas, 0)
  const ingresoTotal = rubros.reduce((a, r) => a + r.ingresos, 0)
  const viajesTotal = rubros.reduce((a, r) => a + r.viajes, 0)
  const rubroFuerte = rubros[0]
  const capacidadTotal = viajesTotal * 20
  // Sin viajes no hay denominador. Dividir por cero daría NaN en pantalla, que se
  // lee como un error de cálculo cuando en realidad no hay nada que calcular.
  const cargaUtilizada = capacidadTotal === 0 ? 0 : (toneladaTotal / capacidadTotal) * 100

  return (
    <div className="space-y-6">
      <SeccionHeader
        titulo="Carga y tipo de mercadería"
        descripcion="Qué se está transportando, cuánto pesa y cuánto deja cada rubro."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Tonelaje 90 días</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{numero(toneladaTotal, 1)} t</p>
            <p className="mt-1 text-xs text-muted-foreground">{rubros.reduce((a, r) => a + r.viajes, 0)} viajes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Ocupación de carga</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{porcentaje(cargaUtilizada)}</p>
            <p className="mt-1 text-xs text-muted-foreground">de la capacidad instalada</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Facturado 90 días</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{solesCompacto(ingresoTotal)}</p>
            <p className="mt-1 text-xs text-muted-foreground">en fletes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Rubro principal</p>
            <p className="mt-2 truncate text-2xl font-semibold">{rubroFuerte?.nombre}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {rubroFuerte && porcentaje(toneladaTotal === 0 ? 0 : (rubroFuerte.toneladas / toneladaTotal) * 100, 0)} del volumen
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Distribución por rubro</CardTitle>
            <CardDescription>Toneladas de los últimos 90 días</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={rubros}
                    dataKey="toneladas"
                    nameKey="nombre"
                    innerRadius="52%"
                    outerRadius="85%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {rubros.map((r) => (
                      <Cell key={r.rubro} fill={COLOR[r.rubro]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const t = valorNumerico(payload[0].value)
                      const d = payload[0].payload as { viajes: number; ingresos: number }
                      return (
                        <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                          <p className="font-medium">{payload[0].name}</p>
                          <p className="text-muted-foreground">
                            {numero(t, 1)} t · {d.viajes} viajes
                          </p>
                          <p className="text-muted-foreground">{soles(d.ingresos)}</p>
                        </div>
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Desglose por rubro</CardTitle>
            <CardDescription>Tonelaje, viajes e ingresos de cada tipo de mercadería</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {rubros.map((r) => {
                const Icono = ICONO[r.rubro]
                return (
                  <li key={r.rubro} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-lg"
                        style={{ background: `color-mix(in oklch, ${COLOR[r.rubro]} 15%, transparent)` }}
                      >
                        <Icono className="size-4" style={{ color: COLOR[r.rubro] }} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{r.nombre}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {RUBROS[r.rubro]?.descripcion ?? '—'}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-medium tabular-nums">{numero(r.toneladas, 1)} t</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {solesCompacto(r.ingresos)}
                        </span>
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <Progress
                        value={rubroFuerte?.toneladas ? (r.toneladas / rubroFuerte.toneladas) * 100 : 0}
                        indicatorClassName=""
                      />
                      <span className="w-28 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                        {r.viajes} viajes · {porcentaje(r.cargaUtilizada, 0)} lleno
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Specialized handling</CardTitle>
            <CardDescription>Rubro que exige equipamiento específico</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(Object.keys(RUBROS) as RubroCarga[])
                .filter((k) => RUBROS[k].exigirFrio || RUBROS[k].requiereTanque)
                .map((k) => {
                  const Icono = ICONO[k]
                  return (
                    <li key={k} className="flex items-center gap-3 rounded-lg border p-3">
                      <Icono className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 text-sm font-medium">{RUBROS[k].nombre}</span>
                      <Badge variant="outline">
                        {RUBROS[k].exigirFrio ? 'Unidad frigorífica' : 'Unidad cisterna'}
                      </Badge>
                    </li>
                  )
                })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Facturación por rubro</CardTitle>
            <CardDescription>Ingresos de flete por tipo de carga</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {rubros.map((r) => (
                <li key={r.rubro}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{r.nombre}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{soles(r.ingresos)}</span>
                  </div>
                  <Progress
                    value={ingresoTotal === 0 ? 0 : (r.ingresos / ingresoTotal) * 100}
                    indicatorClassName="bg-success"
                  />
                </li>
              ))}
            </ul>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              <Boxes className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Los rubros refrigerados y combustibles exigen unidades dedicadas, lo que reduce la
                disponibilidad de la flota en un momento dado.
              </p>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
