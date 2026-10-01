import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Gauge,
  Leaf,
  MapPin,
  Menu,
  Phone,
  Route,
  ShieldCheck,
  Snowflake,
  Truck,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CIUDADES as ciudades, RUTAS as rutas, getCiudad, getRuta } from '@/data'
import { km, numero } from '@/lib/formato'

const SERVICIOS = [
  {
    icono: Truck,
    titulo: 'Carga general y paletizada',
    texto: 'Distribución de mercadería consolidada entre ciudades con control de temperatura cuando el rubro lo requiere.',
  },
  {
    icono: Snowflake,
    titulo: 'Refrigerados',
    texto: 'Unidades frigoríficas con monitoreo continuo de temperatura para cadenas de alimentos y platos preparados.',
  },
  {
    icono: Building2,
    titulo: 'Industria y minería',
    texto: 'Traslado de insumos, repuestos y materiales pesados con permisos y protocolos de seguridad al día.',
  },
  {
    icono: Leaf,
    titulo: 'Agroindustria',
    texto: 'Acopio de cosechas y transporte de productos perecibles con rutas y ventanas definidas con el productor.',
  },
]

const DIFERENCIALES = [
  { icono: ShieldCheck, titulo: 'Unidad mantenida al día', texto: 'Revisión técnica y SOAT vigentes en cada unidad de la flota.' },
  { icono: Clock3, titulo: 'Salidas programadas', texto: 'Ventanas de despacho por corredor y seguimiento del viaje en tiempo real.' },
  { icono: Gauge, titulo: 'Control de kilometraje', texto: 'Mantenimiento preventivo según el kilometraje real recorrido.' },
  { icono: Route, titulo: 'Cobertura nacional', texto: `${rutas.length} corredores activos conectando ${ciudades.length} ciudades del Perú.` },
]

const CORREDORES = rutas.slice(0, 6)

export default function Landing() {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const enlaces = [
    { href: '#servicios', label: 'Servicios' },
    { href: '#cobertura', label: 'Cobertura' },
    { href: '#porque', label: 'Por qué Advaluro' },
    { href: '#contacto', label: 'Contacto' },
  ]

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              A
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold">Empresa Advaluro</span>
              <span className="block text-xs text-muted-foreground">Transporte interprovincial</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {enlaces.map((e) => (
              <a key={e.href} href={e.href} className="text-sm text-muted-foreground hover:text-foreground">
                {e.label}
              </a>
            ))}
            <Button asChild size="sm">
              <Link to="/dashboard">Panel operativo</Link>
            </Button>
          </nav>

          <button
            type="button"
            className="grid size-9 place-items-center rounded-lg hover:bg-muted md:hidden"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label={menuAbierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuAbierto}
          >
            {menuAbierto ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {menuAbierto && (
          <div className="border-t md:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
              {enlaces.map((e) => (
                <a
                  key={e.href}
                  href={e.href}
                  className="rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setMenuAbierto(false)}
                >
                  {e.label}
                </a>
              ))}
              <Button asChild className="mt-2" size="sm">
                <Link to="/dashboard">Panel operativo</Link>
              </Button>
            </nav>
          </div>
        )}
      </header>

      <main>
        <section className="relative overflow-hidden border-b">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
            aria-hidden
          />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <Badge variant="secondary" className="mb-4">
                <MapPin className="mr-1.5 size-3.5" aria-hidden />
                {ciudades.length} ciudades · {rutas.length} corredores
              </Badge>
              <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
                Transporte interprovincial con control de punta a punta
              </h1>
              <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
                Advaluro conecta empresas y productores con carga segura, trazabilidad por corredor y
                despacho programado en los principales corredores del Perú.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button size="lg" asChild>
                  <Link to="/dashboard">
                    Ver el panel operativo
                    <ArrowRight className="ml-2 size-4" aria-hidden />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#contacto">Solicitar cotización</a>
                </Button>
              </div>

              <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t pt-6">
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Corredores</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{rutas.length}</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Unidades</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">8</dd>
                </div>
                <div>
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">Rubros</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">6</dd>
                </div>
              </dl>
            </div>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Corredores principales</CardTitle>
                <CardDescription>Rutas activas con despacho frecuente</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {CORREDORES.map((r) => {
                    const o = getCiudad(r.origenId)
                    const d = getCiudad(r.destinoId)
                    return (
                      <li key={r.id} className="flex items-center gap-3 text-sm">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary">
                          <Route className="size-4 text-secondary-foreground" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {o.nombre} <span className="text-muted-foreground">→</span> {d.nombre}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {o.departamento} · {km(r.km)} de recorrido
                          </span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="servicios" className="border-b scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Servicios</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              Cuatro líneas de servicio con equipamiento y protocolos ajustados a cada tipo de carga.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {SERVICIOS.map((s) => (
                <Card key={s.titulo}>
                  <CardContent className="pt-6">
                    <span className="grid size-10 place-items-center rounded-lg bg-accent/12 text-accent">
                      <s.icono className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 font-medium">{s.titulo}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{s.texto}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="cobertura" className="border-b scroll-mt-20 bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Cobertura</h2>
                <p className="mt-2 text-sm text-muted-foreground md:text-base">
                  La operación se concentra en el corredor de la costa y sierra norte, con conexiones
                  hacia la sierra sur. La disponibilidad por corredor se actualiza en el panel.
                </p>
                <ul className="mt-6 space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                    Despacho diario en corredores de alta frecuencia
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                    Unidades dedicadas para refrigerados y combustibles
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                    Seguimiento por corredor y hora estimada de llegada
                  </li>
                </ul>
                <Button className="mt-6" variant="outline" asChild>
                  <Link to="/dashboard/viajes">
                    Ver viajes en ruta
                    <ArrowRight className="ml-2 size-4" aria-hidden />
                  </Link>
                </Button>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Ciudades conectadas</CardTitle>
                  <CardDescription>{ciudades.length} destinos con corredor activo</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-wrap gap-2">
                    {ciudades.map((c) => (
                      <li key={c.id}>
                        <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs">
                          <MapPin className="size-3 text-muted-foreground" aria-hidden />
                          {c.nombre}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Ejemplo de corredor: {getCiudad(CORREDORES[0].origenId).nombre} –{' '}
                    {getCiudad(CORREDORES[0].destinoId).nombre}, {km(getRuta(CORREDORES[0].id).km)} con{' '}
                    {getRuta(CORREDORES[0].id).peajes} casetas de peaje. Los valores son demostrativos.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section id="porque" className="border-b scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Por qué Advaluro</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              Una operación que recién arranca, con procesos definidos desde el primer viaje.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {DIFERENCIALES.map((d) => (
                <div key={d.titulo} className="rounded-lg border p-4">
                  <d.icono className="size-5 text-primary" aria-hidden />
                  <h3 className="mt-3 text-sm font-medium">{d.titulo}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{d.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="contacto" className="scroll-mt-20 bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Solicitar una cotización</h2>
                <p className="mt-2 text-sm text-muted-foreground md:text-base">
                  Cuéntanos el origen, el destino y el tipo de carga. Respondemos con disponibilidad de
                  unidad y tarifa referencial.
                </p>
                <ul className="mt-6 space-y-3 text-sm">
                  <li className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg border bg-background">
                      <Phone className="size-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-xs text-muted-foreground">Teléfono</span>
                      <span className="font-medium">+51 900 000 000</span>
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-lg border bg-background">
                      <MapPin className="size-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-xs text-muted-foreground">Oficina</span>
                      <span className="font-medium">Lima, Perú</span>
                    </span>
                  </li>
                </ul>
                <p className="mt-6 text-xs text-muted-foreground">
                  Proyecto demostrativo. Los datos de contacto, tarifas y cifras son ficticios.
                </p>
              </div>

              <Card>
                <CardContent className="pt-6">
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs tracking-wide text-muted-foreground uppercase">Rubro más mover</dt>
                      <dd className="mt-1 text-sm font-medium">Carga general</dd>
                    </div>
                    <div>
                      <dt className="text-xs tracking-wide text-muted-foreground uppercase">Capacidad por unidad</dt>
                      <dd className="mt-1 text-sm font-medium tabular-nums">{numero(18)} t</dd>
                    </div>
                    <div>
                      <dt className="text-xs tracking-wide text-muted-foreground uppercase">Ventana de despacho</dt>
                      <dd className="mt-1 text-sm font-medium">06:00 – 20:00</dd>
                    </div>
                    <div>
                      <dt className="text-xs tracking-wide text-muted-foreground uppercase">Seguimiento</dt>
                      <dd className="mt-1 text-sm font-medium">Por corredor y unidad</dd>
                    </div>
                  </dl>
                  <Button className="mt-6 w-full" size="lg" asChild>
                    <Link to="/dashboard">
                      Entrar al panel
                      <ArrowRight className="ml-2 size-4" aria-hidden />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Empresa Advaluro. Prototipo demostrativo.</p>
          <p>Datos simulados · Panel de gestión interna</p>
        </div>
      </footer>
    </div>
  )
}
