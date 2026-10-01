import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, Banknote, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { KpiCard } from '@/components/kpi-card'
import { Cargando, ErrorDatos, SinDatos, SinFinanzas } from '@/components/estados-datos'
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
import {
  fechaCorta,
  km,
  numero,
  porcentaje,
  soles,
  solesCompacto,
  valorNumerico,
  variacion as fmtVariacion,
} from '@/lib/formato'
import { TooltipSoles } from '@/lib/tooltip'
import { usePanel } from '@/lib/panel'

export default function Financiero() {
  const {
    estado,
    vacio,
    error,
    sinServidor,
    recargar,
    finanzasMensuales,
    facturas,
    clientePorId,
    composicionCostos,
    rankingRutas,
  } = usePanel()

  if (estado === 'cargando') return <Cargando />
  if (error) return <ErrorDatos error={error} sinServidor={sinServidor} onReintentar={recargar} />
  if (vacio) return <SinDatos />

  // La serie financiera se arma a partir de los viajes, así que puede venir
  // vacía aunque haya clientes y camiones dados de alta. Se avisa con un mensaje
  // propio en vez de leer `finanzasMensuales[length - 1]`, que sería `undefined`
  // y reventaría la pantalla al abrirla.
  if (finanzasMensuales.length === 0) return <SinFinanzas />

  const ultimo = finanzasMensuales[finanzasMensuales.length - 1]
  const anterior = finanzasMensuales[finanzasMensuales.length - 2] ?? ultimo
  const composicion = composicionCostos()

  const margen = ultimo.ingresos === 0 ? 0 : (ultimo.utilidad / ultimo.ingresos) * 100
  const margenAnterior = anterior.ingresos === 0 ? 0 : (anterior.utilidad / anterior.ingresos) * 100

  const pendientes = facturas.filter((f) => f.estado === 'pendiente' || f.estado === 'vencida')
  const vencido = facturas.filter((f) => f.estado === 'vencida')
  const facturadoTotal = facturas.reduce((a, f) => a + f.monto, 0)
  const vencidoTotal = vencido.reduce((a, f) => a + f.monto, 0)
  // Sin facturas no hay nada que cobrar: se muestra 0 en vez de dividir entre cero.
  const impagoPct = facturadoTotal === 0 ? 0 : (vencidoTotal / facturadoTotal) * 100

  const serie = finanzasMensuales.map((m) => ({
    mes: m.etiqueta,
    ingresos: m.ingresos,
    costos: m.totalCostos,
    utilidad: m.utilidad,
    margen: m.ingresos === 0 ? 0 : (m.utilidad / m.ingresos) * 100,
  }))

  // Punto de equilibrio:mes en que la utilidad cruza cero.
  const puntoEquilibrio = finanzasMensuales.findIndex((m) => m.utilidad >= 0)
  const etiquetaEquilibrio = puntoEquilibrio >= 0 ? finanzasMensuales[puntoEquilibrio].etiqueta : 'aún no'

  const facturasRecientes = [...facturas].sort((a, b) => b.emitida.localeCompare(a.emitida)).slice(0, 8)

  // Se calcula una vez y se reutiliza: antes se llamaba dos veces por fila, y el
  // denominador de la barra comparaba contra la primera ruta, que con la base
  // vacía no existe.
  const rutas = rankingRutas(6)
  const ingresoPrimeraRuta = rutas[0]?.ingresos ?? 0

  return (
    <div className="space-y-6">
      <SeccionHeader
        titulo="Financiero"
        descripcion="Ingresos, costos, margen y cuentas por cobrar de la operación."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          titulo="Ingresos del mes"
          valor={solesCompacto(ultimo.ingresos)}
          icono={Banknote}
          tono="primary"
          variacion={fmtVariacion(((ultimo.ingresos - anterior.ingresos) / anterior.ingresos) * 100)}
          pie="vs mes anterior"
        />
        <KpiCard
          titulo="Costos del mes"
          valor={solesCompacto(ultimo.totalCostos)}
          icono={TrendingDown}
          tono="warning"
          pie={`${porcentaje((ultimo.totalCostos / ultimo.ingresos) * 100, 0)} de los ingresos`}
        />
        <KpiCard
          titulo="Utilidad"
          valor={solesCompacto(ultimo.utilidad)}
          icono={margen >= 0 ? TrendingUp : TrendingDown}
          tono={margen >= 0 ? 'success' : 'danger'}
          variacion={fmtVariacion(margen - margenAnterior)}
          pie="margen neto"
        />
        <KpiCard
          titulo="Por cobrar"
          valor={solesCompacto(pendientes.reduce((a, f) => a + f.monto, 0))}
          icono={Wallet}
          tono="info"
          pie={`${porcentaje(impagoPct)} vencido`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ingresos contra costos</CardTitle>
          <CardDescription>
            La barra de utilidad cruza cero en {etiquetaEquilibrio}; desde entonces la operación sostiene su
            estructura de costos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => solesCompacto(v)}
                />
                <Tooltip content={TooltipSoles} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeWidth={1} />
                <Bar dataKey="ingresos" name="Ingresos" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="costos" name="Costos" fill="var(--chart-6)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="utilidad" name="Utilidad" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Margen neto por mes</CardTitle>
            <CardDescription>Utilidad sobre ingresos, en porcentaje</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serie} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      const margen = valorNumerico(payload?.[0]?.value)
                      if (!active || !payload?.length) return null
                      return (
                        <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                          <p className="font-medium">{label}</p>
                          <p className="text-muted-foreground">
                            Margen:{' '}
                            <span
                              className={`font-medium tabular-nums ${margen >= 0 ? 'text-success' : 'text-destructive'}`}
                            >
                              {margen.toFixed(1)} %
                            </span>
                          </p>
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" />
                  <Line
                    type="monotone"
                    dataKey="margen"
                    name="Margen %"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estructura de costos</CardTitle>
            <CardDescription>Del mes en curso</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={composicion}
                    dataKey="valor"
                    nameKey="nombre"
                    innerRadius="52%"
                    outerRadius="85%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {composicion.map((c) => (
                      <Cell key={c.nombre} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip content={TooltipSoles} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-4 space-y-2">
              {composicion.map((c) => (
                <li key={c.nombre} className="flex items-center gap-2 text-xs">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                  <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                  <span className="shrink-0 tabular-nums">{solesCompacto(c.valor)}</span>
                  <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                    {porcentaje((c.valor / ultimo.totalCostos) * 100, 0)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalle de costos por mes</CardTitle>
          <CardDescription>Dónde se va cada sol de los últimos ocho meses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  {finanzasMensuales.map((m) => (
                    <TableHead key={m.mes} className="text-right">
                      {m.etiqueta}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  [
                    ['Combustible', 'combustible'],
                    ['Mantenimiento', 'mantenimiento'],
                    ['Planilla', 'planilla'],
                    ['Peajes', 'peajes'],
                    ['Gastos de viaje', 'gastosViaje'],
                    ['Permisos', 'permisos'],
                    ['Administrativo', 'administrativo'],
                  ] as const
                ).map(([label, clave]) => (
                  <TableRow key={clave}>
                    <TableCell className="font-medium">{label}</TableCell>
                    {finanzasMensuales.map((m) => (
                      <TableCell key={m.mes} className="text-right tabular-nums">
                        {solesCompacto(m.costos[clave])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-medium">
                  <TableCell>Total costos</TableCell>
                  {finanzasMensuales.map((m) => (
                    <TableCell key={m.mes} className="text-right tabular-nums">
                      {solesCompacto(m.totalCostos)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow className="font-medium">
                  <TableCell>Utilidad</TableCell>
                  {finanzasMensuales.map((m) => (
                    <TableCell
                      key={m.mes}
                      className={`text-right tabular-nums ${m.utilidad >= 0 ? 'text-success' : 'text-destructive'}`}
                    >
                      {solesCompacto(m.utilidad)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rutas más rentables</CardTitle>
            <CardDescription>Ingresos acumulados por corredor</CardDescription>
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
                      {soles(r.ingresos)} · {km(r.km)}
                    </span>
                  </div>
                  <Progress value={ingresoPrimeraRuta === 0 ? 0 : (r.ingresos / ingresoPrimeraRuta) * 100} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Facturas recientes</CardTitle>
            <CardDescription>{vencido.length} documentos vencidos en cartera</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento</TableHead>
                    <TableHead className="hidden sm:table-cell">Cliente</TableHead>
                    <TableHead className="hidden md:table-cell">Emitida</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {facturasRecientes.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">{f.numero}</TableCell>
                      <TableCell className="hidden sm:table-cell text-xs">
                        {clientePorId(f.clienteId)?.razonSocial}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {fechaCorta(f.emitida)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{numero(f.monto)}</TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={f.estado === 'pagada' ? 'secondary' : f.estado === 'vencida' ? 'destructive' : 'outline'}
                        >
                          {f.estado}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {vencido.length > 0 && (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-destructive/8 p-3 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  Hay {vencido.length} facturas vencidas por {soles(vencido.reduce((a, f) => a + f.monto, 0))}.
                  Recuperarlas impacta directamente el flujo de caja de la operación.
                </p>
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Detalle completo de cartera en <Link to="/panel/clientes" className="text-primary hover:underline">Clientes</Link>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
