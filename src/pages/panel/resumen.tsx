import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { AlertTriangle, Banknote, Gauge, MapPinned, Package, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { KpiCard } from '@/components/kpi-card'
import { SeccionHeader } from '@/components/seccion'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { getCiudad, getRuta } from '@/data'
import { Cargando, ErrorDatos, SinDatos } from '@/components/estados-datos'
import { usePanel } from '@/lib/panel'
import {
  fechaCorta,
  km,
  numero,
  porcentaje,
  relativo,
  soles,
  solesCompacto,
  valorNumerico,
  variacion as fmtVariacion,
} from '@/lib/formato'

function TooltipContenido({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color ?? p.fill }} />
          {p.name}: <span className="font-medium text-foreground tabular-nums">{soles(valorNumerico(p.value))}</span>
        </p>
      ))}
    </div>
  )
}

export default function Resumen() {
  const {
    estado,
    vacio,
    error,
    sinServidor,
    recargar,
    clientePorId,
    camionPorId,
    composicionCostos,
    distribucionPorRubro,
    finanzasMensuales,
    incidentes,
    kpisResumen,
    rankingRutas,
    viajes,
    ahora,
  } = usePanel()

  if (estado === 'cargando') return <Cargando />
  if (error) return <ErrorDatos error={error} sinServidor={sinServidor} onReintentar={recargar} />
  if (vacio) return <SinDatos />

  const k = kpisResumen()
  const composicion = composicionCostos()
  const rubros = distribucionPorRubro().slice(0, 5)
  const rutas = rankingRutas(5)
  const incidentesAbiertos = incidentes.filter((i) => i.estado !== 'cerrado')
  // La serie financiera viene de los viajes, así que puede estar vacía aunque la
  // base tenga camiones y clientes. Antes se leía `finanzasMensuales[length - 1]`
  // sin más y la pantalla moría con un TypeError al abrirla.
  const mes = finanzasMensuales.at(-1) ?? null
  const margenMes = mes && mes.ingresos !== 0 ? (mes.utilidad / mes.ingresos) * 100 : 0
  const equilibrio = finanzasMensuales.find((m) => m.utilidad >= 0)
  const mesEquilibrio = equilibrio ? equilibrio.etiqueta.toLowerCase() : 'ningún mes aún'

  const serieIngresos = finanzasMensuales.map((m) => ({ mes: m.etiqueta, ingresos: m.ingresos, utilidad: m.utilidad }))
  const serieToneladas = finanzasMensuales.map((m) => ({ mes: m.etiqueta, toneladas: m.toneladas, viajes: m.viajes }))

  const enCurso = viajes.filter((v) => v.estado === 'en_curso' || v.estado === 'retrasado')
  const programados = viajes.filter((v) => v.estado === 'programado')

  return (
    <div className="space-y-6">
      <SeccionHeader
        titulo="Resumen de operación"
        descripcion="Cómo viene el mes, dónde está la flota y qué hay que mirar hoy."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          titulo="Facturación del mes"
          valor={solesCompacto(k.ingresosMes)}
          icono={Banknote}
          tono="primary"
          variacion={fmtVariacion(k.variacionIngresos)}
          pie={`acumulado a ${mes?.diasTranscurridos ?? 0} días vs mes anterior`}
        />
        <KpiCard
          titulo="Utilidad del mes"
          valor={solesCompacto(k.utilidadMes)}
          icono={Gauge}
          tono={k.utilidadMes >= 0 ? 'success' : 'danger'}
          pie={`margen ${porcentaje(k.margenNeto)}`}
        />
        <KpiCard
          titulo="Entregas a tiempo"
          valor={porcentaje(k.onTimeRate)}
          icono={MapPinned}
          tono="info"
          variacion={fmtVariacion(k.variacionOnTime)}
          pie="vs mes anterior"
        />
        <KpiCard
          titulo="Flota operativa"
          valor={`${k.camionesOperativos} / ${k.camionesTotal}`}
          icono={Truck}
          tono="accent"
          pie={`${viajes.length} viajes registrados`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ingresos y utilidad mensual</CardTitle>
            <CardDescription>
              {/* El texto se arma con los datos, no con una frase fija. Con la base
                  real no se puede afirmar que la empresa "arrancó en rojo en marzo":
                  si no hay meses registrados, esa frase sería inventada. */}
              {mes
                ? `Hoy opera con ${porcentaje(margenMes)} de margen${
                    mes.mesEnCurso ? `, con ${mes.diasTranscurridos} días acumulados del mes` : ''
                  }. ${equilibrio ? `Cruza el equilibrio en ${mesEquilibrio}.` : 'Todavía no cruza el equilibrio.'}`
                : 'La serie financiera se calcula con los viajes registrados, así que aún no hay mes que mostrar.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serieIngresos} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                  <defs>
                    <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => solesCompacto(v)}
                  />
                  <Tooltip content={TooltipContenido} />
                  <Area
                    type="monotone"
                    dataKey="ingresos"
                    name="Ingresos"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill="url(#gradIngresos)"
                  />
                  <Area
                    type="monotone"
                    dataKey="utilidad"
                    name="Utilidad"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    fill="transparent"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Composición de costos</CardTitle>
            <CardDescription>Del mes en curso</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={composicion}
                    dataKey="valor"
                    nameKey="nombre"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {composicion.map((c) => (
                      <Cell key={c.nombre} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip content={TooltipContenido} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-4 space-y-1.5">
              {composicion.map((c) => (
                <li key={c.nombre} className="flex items-center gap-2 text-xs">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                  <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                  <span className="shrink-0 font-medium tabular-nums">{solesCompacto(c.valor)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tonelaje despachado</CardTitle>
            <CardDescription>Volumen y número de viajes por mes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serieToneladas} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Tooltip
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                          <p className="mb-1 font-medium">{label}</p>
                          <p className="text-muted-foreground">
                            Toneladas:{' '}
                            <span className="font-medium text-foreground tabular-nums">
                              {numero(valorNumerico(payload[0].value), 1)} t
                            </span>
                          </p>
                          <p className="text-muted-foreground">
                            Viajes:{' '}
                            <span className="font-medium text-foreground tabular-nums">
                              {numero(valorNumerico(payload[1]?.value))}
                            </span>
                          </p>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="toneladas" name="Toneladas" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="viajes" name="Viajes" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mercadería por rubro</CardTitle>
            <CardDescription>Toneladas de los últimos 90 días</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {rubros.map((r) => (
                <li key={r.rubro}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{r.nombre}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {numero(r.toneladas, 1)} t · {r.viajes} viajes
                    </span>
                  </div>
                  <Progress value={(r.toneladas / rubros[0].toneladas) * 100} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Viajes en curso</CardTitle>
              <CardDescription>{enCurso.length} unidades en ruta ahora mismo</CardDescription>
            </div>
            <Link
              to="/panel/viajes"
              className="text-xs font-medium text-primary hover:underline"
            >
              Ver mapa
            </Link>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {enCurso.map((v) => {
                const r = getRuta(v.rutaId)
                const camion = camionPorId(v.camionId)
                const origen = getCiudad(r.origenId)
                const destino = getCiudad(r.destinoId)
                return (
                  <div key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{v.referencia}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {origen.nombre} <span className="text-muted-foreground">→</span> {destino.nombre}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{km(v.km)}</span>
                    <span className="text-xs text-muted-foreground">{camion?.placa}</span>
                    <Badge variant={v.estado === 'retrasado' ? 'destructive' : 'secondary'}>
                      {v.estado === 'retrasado' ? 'Con retraso' : relativo(v.llegadaProgramada, ahora)}
                    </Badge>
                  </div>
                )
              })}
              {enCurso.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin viajes en curso.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rutas con más tránsito</CardTitle>
            <CardDescription>Por número de viajes</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {rutas.map((r) => (
                <li key={r.rutaId} className="flex items-center gap-3 text-sm">
                  <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {r.origen} <span className="text-muted-foreground">→</span> {r.destino}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{r.viajes} v.</span>
                  <span
                    className={`w-14 shrink-0 text-right text-xs font-medium tabular-nums ${
                      r.puntualidad >= 90 ? 'text-success' : r.puntualidad >= 80 ? 'text-warning-foreground' : 'text-destructive'
                    }`}
                  >
                    {porcentaje(r.puntualidad, 0)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Próximas salidas</CardTitle>
            <CardDescription>{programados.length} viajes ya programados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {programados.slice(0, 5).map((v) => {
                const r = getRuta(v.rutaId)
                return (
                  <div key={v.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">{fechaCorta(v.salida)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {getCiudad(r.origenId).nombre} <span className="text-muted-foreground">→</span>{' '}
                      {getCiudad(r.destinoId).nombre}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {clientePorId(v.clienteId)?.razonSocial}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Incidentes por resolver</CardTitle>
            <CardDescription>{incidentesAbiertos.length} casos abiertos</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {incidentesAbiertos.map((i) => (
                <li key={i.id} className="flex items-start gap-3 text-sm">
                  <AlertTriangle
                    className={`mt-0.5 size-4 shrink-0 ${
                      i.severidad === 'alta' ? 'text-destructive' : i.severidad === 'media' ? 'text-warning-foreground' : 'text-muted-foreground'
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium capitalize">{i.tipo.replace('_', ' ')}</p>
                    <p className="truncate text-xs text-muted-foreground">{i.descripcion}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{soles(i.costo)}</span>
                </li>
              ))}
              {incidentesAbiertos.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin incidentes abiertos.</p>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
