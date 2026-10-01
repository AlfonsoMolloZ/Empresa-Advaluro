import { Building2, Clock, HandCoins, Users } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
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
import { RUBROS, getCiudad } from '@/data'
import { numero, porcentaje, soles, solesCompacto, valorNumerico } from '@/lib/formato'
import { usePanel } from '@/lib/panel'
import { Cargando, ErrorDatos, SinDatos } from '@/components/estados-datos'

const PALETA = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)']

export default function Clientes() {
  const { estado, vacio, error, sinServidor, recargar, facturacionPorCliente } = usePanel()

  if (estado === 'cargando') return <Cargando />
  if (error) return <ErrorDatos error={error} sinServidor={sinServidor} onReintentar={recargar} />
  if (vacio) return <SinDatos />

  const cartera = facturacionPorCliente()
  const total = cartera.reduce((a, c) => a + c.monto, 0)

  const satisfaccionPromedio =
    cartera.reduce((a, c) => a + c.cliente.satisfaccion, 0) / Math.max(1, cartera.length)

  const mejorCliente = [...cartera].sort((a, b) => b.cliente.satisfaccion - a.cliente.satisfaccion)[0]
  const peorCliente = [...cartera].sort((a, b) => a.cliente.satisfaccion - b.cliente.satisfaccion)[0]

  const pagoPromedio = cartera.reduce((a, c) => a + c.cliente.diasPromedioPago, 0) / Math.max(1, cartera.length)

  // Concentración: el primer cliente respecto del total.
  const top1 = cartera[0]
  const top3 = cartera.slice(0, 3).reduce((a, c) => a + c.monto, 0)

  return (
    <div className="space-y-6">
      <SeccionHeader
        titulo="Clientes y satisfacción"
        descripcion="Cartera, concentración de ingresos, plazos de pago y nivel de servicio percibido."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Clientes activos</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{cartera.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">empresas con flete en los últimos 90 días</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Facturado 90 días</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{solesCompacto(total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{numero(cartera.reduce((a, c) => a + c.envios, 0))} envíos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Satisfacción media</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {satisfaccionPromedio.toFixed(1)}
              <span className="text-base font-normal text-muted-foreground"> / 100</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              mejor {mejorCliente?.cliente.satisfaccion} · peor {peorCliente?.cliente.satisfaccion}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Plazo de pago medio</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{pagoPromedio.toFixed(0)} días</p>
            <p className="mt-1 text-xs text-muted-foreground">desde la emisión de la factura</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Concentración de ingresos</CardTitle>
            <CardDescription>Participación de cada cliente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={cartera}
                    dataKey="monto"
                    nameKey="nombre"
                    innerRadius="52%"
                    outerRadius="85%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {cartera.map((c, i) => (
                      <Cell key={c.cliente.id} fill={PALETA[i % PALETA.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload as { cliente: { razonSocial: string }; participacion: number }
                      return (
                        <div className="max-w-56 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                          <p className="font-medium">{d.cliente.razonSocial}</p>
                          <p className="text-muted-foreground">
                            {soles(valorNumerico(payload[0].value))} · {d.participacion} %
                          </p>
                        </div>
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              <Building2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                El mayor cliente representa el {porcentaje(top1?.participacion ?? 0, 0)} de la facturación y los tres
                primeros el {porcentaje((top3 / total) * 100, 0)}. Una cartera tan concentrada hace que perder un
                contrato tenga impacto directo en la operación.
              </p>
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cartera de clientes</CardTitle>
            <CardDescription>Facturación, envíos y satisfacción de los últimos 90 días</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="hidden lg:table-cell">Rubro</TableHead>
                    <TableHead className="hidden md:table-cell">Envíos</TableHead>
                    <TableHead className="text-right">Facturado</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Participación</TableHead>
                    <TableHead className="text-right">Satisfacción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cartera.map(({ cliente, monto, envios, participacion }) => (
                    <TableRow key={cliente.id}>
                      <TableCell>
                        <div className="truncate font-medium">{cliente.razonSocial}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {getCiudad(cliente.ciudadId).nombre} · {cliente.contacto}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant="outline">{RUBROS[cliente.rubro]?.nombre ?? cliente.rubro}</Badge>
                      </TableCell>
                      <TableCell className="hidden tabular-nums md:table-cell">{envios}</TableCell>
                      <TableCell className="text-right tabular-nums">{soles(monto)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        {porcentaje(participacion)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-medium tabular-nums ${
                            cliente.satisfaccion >= 90 ? 'text-success' : cliente.satisfaccion >= 82 ? '' : 'text-warning-foreground'
                          }`}
                        >
                          {cliente.satisfaccion}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Satisfacción por cliente</CardTitle>
            <CardDescription>Puntaje de 0 a 100 sobre la atención y el cumplimiento de plazos</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {[...cartera]
                .sort((a, b) => b.cliente.satisfaccion - a.cliente.satisfaccion)
                .map(({ cliente }) => (
                  <li key={cliente.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{cliente.razonSocial}</span>
                      <span className="shrink-0 font-medium tabular-nums">{cliente.satisfaccion}</span>
                    </div>
                    <Progress
                      value={cliente.satisfaccion}
                      indicatorClassName={
                        cliente.satisfaccion >= 90 ? 'bg-success' : cliente.satisfaccion >= 82 ? 'bg-info' : 'bg-warning'
                      }
                    />
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plazos de pago</CardTitle>
            <CardDescription>Días promedio desde la facturación hasta el cobro</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {cartera
                .sort((a, b) => b.cliente.diasPromedioPago - a.cliente.diasPromedioPago)
                .map(({ cliente }) => (
                  <li key={cliente.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{cliente.razonSocial}</span>
                      <span
                        className={`shrink-0 text-xs tabular-nums ${
                          cliente.diasPromedioPago > 50 ? 'text-destructive' : 'text-muted-foreground'
                        }`}
                      >
                        {cliente.diasPromedioPago} días
                      </span>
                    </div>
                    <Progress
                      value={(cliente.diasPromedioPago / 62) * 100}
                      indicatorClassName={cliente.diasPromedioPago > 50 ? 'bg-destructive' : 'bg-primary'}
                    />
                  </li>
                ))}
            </ul>
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Los plazos largos de cobro ajustan el capital de trabajo: mientras el proveedor
                paga combustible y peajes de inmediato, la empresa financia la operación hasta
                recibir el pago del cliente.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clientes por rubro</CardTitle>
          <CardDescription>Distribución de la cartera</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(
              cartera.reduce<Record<string, { clientes: number; monto: number }>>((acc, c) => {
                acc[c.cliente.rubro] ??= { clientes: 0, monto: 0 }
                acc[c.cliente.rubro].clientes += 1
                acc[c.cliente.rubro].monto += c.monto
                return acc
              }, {}),
            ).map(([rubro, d]) => (
              <div key={rubro} className="flex items-center gap-3 rounded-lg border p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
                  <Users className="size-4 text-secondary-foreground" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{RUBROS[rubro as keyof typeof RUBROS].nombre}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {d.clientes} cliente{d.clientes === 1 ? '' : 's'} · {solesCompacto(d.monto)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-info/8 p-3 text-xs text-muted-foreground">
            <HandCoins className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              Diversificar por rubro reduce la exposición a ciclos de un solo sector: la minera y la
              agroindustria tienen estacionalidades distintas y se complementan durante el año.
            </p>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
