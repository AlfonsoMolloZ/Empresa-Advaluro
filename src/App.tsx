import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { PanelLayout } from '@/components/panel-layout'
import { RutaProtegida } from '@/components/ruta-protegida'
import { Skeleton } from '@/components/ui/skeleton'
import { ProveedorDeDatos } from '@/lib/datos'
import { ProveedorDeSesion } from '@/lib/sesion'

const Landing = lazy(() => import('@/pages/landing'))
const Ingresar = lazy(() => import('@/pages/ingresar'))
const Resumen = lazy(() => import('@/pages/panel/resumen'))
const Viajes = lazy(() => import('@/pages/panel/viajes'))
const Flota = lazy(() => import('@/pages/panel/flota'))
const Carga = lazy(() => import('@/pages/panel/carga'))
const Financiero = lazy(() => import('@/pages/panel/financiero'))
const Conductores = lazy(() => import('@/pages/panel/conductores'))
const Clientes = lazy(() => import('@/pages/panel/clientes'))

function Cargando() {
  return (
    <div className="space-y-4 p-4 lg:p-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  )
}

/**
 * Los enlaces antiguos a /panel/viajes y compañía siguen funcionando: se pasa la
 * parte que viene después de /panel a la ruta equivalente de /dashboard. Con un
 * `Navigate` simple, /panel/viajes acababa en el resumen y se perdía la página.
 */
function RedirigirPanelViejo() {
  const { pathname } = useLocation()
  const sufijo = pathname.replace(/^\/panel/, '').replace(/^\/+/, '')
  return <Navigate to={sufijo ? `/dashboard/${sufijo}` : '/dashboard'} replace />
}

/**
 * El panel con su proveedor de datos.
 *
 * El orden importa: `RutaProtegida` va por fuera porque solo se pide el dataset
 * cuando hay sesión. Si el proveedor de datos se montara antes, haría la
 * petición sin cookie, recibiría un 401 y saltaría el aviso de "falta iniciar
 * sesión" por un "no se pudieron leer los datos", que no lleva a ninguna parte.
 */
function Panel() {
  return (
    <RutaProtegida>
      <ProveedorDeDatos>
        <PanelLayout />
      </ProveedorDeDatos>
    </RutaProtegida>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ProveedorDeSesion>
        <Suspense fallback={<Cargando />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/ingresar" element={<Ingresar />} />

            <Route path="/dashboard" element={<Panel />}>
              <Route index element={<Resumen />} />
              <Route path="viajes" element={<Viajes />} />
              <Route path="flota" element={<Flota />} />
              <Route path="carga" element={<Carga />} />
              <Route path="financiero" element={<Financiero />} />
              <Route path="conductores" element={<Conductores />} />
              <Route path="clientes" element={<Clientes />} />
            </Route>

            {/* Compatibilidad con los enlaces previos a /dashboard. */}
            <Route path="/panel/*" element={<RedirigirPanelViejo />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ProveedorDeSesion>
    </BrowserRouter>
  )
}
