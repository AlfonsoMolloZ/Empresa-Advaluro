import {
  Banknote,
  Boxes,
  LogOut,
  MapPinned,
  Menu,
  Truck,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ETIQUETA_ROL } from '@/lib/api'
import { useDatos } from '@/lib/datos'
import { fechaCorta } from '@/lib/formato'
import { useSesion } from '@/lib/sesion'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Separator } from './ui/separator'
import { Sheet, SheetContent, SheetTitle } from './ui/sheet'

interface Enlace {
  to: string
  label: string
  icono: LucideIcon
  descripcion: string
}

export const SECCIONES: Enlace[] = [
  { to: '/dashboard', label: 'Resumen', icono: TrendingUp, descripcion: 'Estado general de la operación' },
  { to: '/dashboard/viajes', label: 'Viajes y rutas', icono: MapPinned, descripcion: 'Mapa y viajes en curso' },
  { to: '/dashboard/flota', label: 'Flota', icono: Truck, descripcion: 'Camiones y mantenimiento' },
  { to: '/dashboard/carga', label: 'Mercadería', icono: Boxes, descripcion: 'Carga por tipo de rubro' },
  { to: '/dashboard/financiero', label: 'Financiero', icono: Banknote, descripcion: 'Ingresos, costos y margen' },
  { to: '/dashboard/conductores', label: 'Conductores', icono: UserRound, descripcion: 'Desempeño y seguridad' },
  { to: '/dashboard/clientes', label: 'Clientes', icono: Users, descripcion: 'Cartera y satisfacción' },
]

function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-base font-bold text-accent-foreground">
        A
      </span>
      {!compacta && (
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-tight text-white">Empresa Advaluro</span>
          <span className="block text-[11px] text-sidebar-foreground/70">Transporte interprovincial</span>
        </span>
      )}
    </Link>
  )
}

function Navegacion({ alCerrar }: { alCerrar?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 p-3">
      {SECCIONES.map(({ to, label, icono: Icono }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/dashboard'}
          onClick={alCerrar}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-accent text-white'
                : 'text-sidebar-foreground/80 hover:bg-white/5 hover:text-white',
            )
          }
        >
          <Icono className="size-4 shrink-0" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function PieSidebar() {
  const { sesion, salir } = useSesion()

  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="mb-1 flex items-center gap-2.5 rounded-lg bg-white/5 p-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
          <UserRound className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-medium text-white">
            {sesion?.nombre ?? 'Sesión'}
          </p>
          <p className="truncate text-[11px] text-sidebar-foreground/70">
            {sesion ? ETIQUETA_ROL[sesion.rol] : ''}
          </p>
        </div>
      </div>
      <div className="space-y-0.5">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="w-full justify-start text-sidebar-foreground/80 hover:bg-white/5 hover:text-white"
        >
          <Link to="/">
            <LogOut className="size-4" aria-hidden />
            Volver a la web pública
          </Link>
        </Button>
        {sesion && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void salir()}
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-white/5 hover:text-white"
          >
            <LogOut className="size-4" aria-hidden />
            Cerrar sesión
          </Button>
        )}
      </div>
    </div>
  )
}

export function PanelLayout() {
  const [abierto, setAbierto] = useState(false)
  const { pathname } = useLocation()
  const { sesion } = useSesion()
  // La fecha de corte la calcula el servidor junto con los derivados, así que
  // siempre corresponde a los datos que se están viendo.
  const { fechaCorte } = useDatos()
  const actual = SECCIONES.find((s) =>
    s.to === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(s.to),
  )

  return (
    <div className="flex min-h-svh bg-muted/40">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar lg:flex">
        <div className="p-4">
          <Marca />
        </div>
        <Separator className="bg-sidebar-border" />
        <Navegacion />
        <PieSidebar />
      </aside>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="left" className="flex w-72 flex-col bg-sidebar p-0">
          <SheetTitle className="sr-only">Menú del panel</SheetTitle>
          <div className="p-4">
            <Marca />
          </div>
          <Separator className="bg-sidebar-border" />
          <Navegacion alCerrar={() => setAbierto(false)} />
          <PieSidebar />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setAbierto(true)}>
            <Menu className="size-5" aria-hidden />
            <span className="sr-only">Abrir menú</span>
          </Button>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{actual?.label ?? 'Panel'}</p>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">{actual?.descripcion}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex">
              Datos al {fechaCorta(fechaCorte)}
            </Badge>
            {sesion && (
              <Badge className="hidden sm:inline-flex bg-accent text-accent-foreground">
                {ETIQUETA_ROL[sesion.rol]}
              </Badge>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
