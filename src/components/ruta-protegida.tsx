import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useSesion } from '@/lib/sesion'
import type { Rol } from '@/lib/api'

/**
 * Envuelve las rutas del panel.
 *
 * - Mientras se comprueba la sesión, no se muestra nada: si se mostrara el panel
 *   un instante antes de saber que no hay sesión, se verían datos en pantalla.
 * - Sin sesión, manda a la pantalla de entrada y recuerda a dónde se quería ir.
 * - Con sesión, comprueba además el rol mínimo si se indica uno.
 *
 * El control real está en el servidor: si alguien falsea esto desde el navegador,
 * la API le responde 403 igual. Esto solo evita mostrar pantallas vacías.
 */
export function RutaProtegida({
  children,
  minimo,
}: {
  children: ReactNode
  minimo?: Rol
}) {
  const { estado, sesion, puede } = useSesion()
  const ubicacion = useLocation()

  if (estado === 'cargando') return <Cargando />

  // Si el servidor no está, la pantalla de entrada explica cómo levantarlo.
  if (estado === 'sin-servidor') return <Navigate to="/ingresar" replace />

  if (estado === 'invitado' || !sesion) {
    return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname }} />
  }

  if (minimo && !puede(minimo)) {
    return <SinPermiso rolNecesario={minimo} />
  }

  return <>{children}</>
}

function Cargando() {
  return (
    <div className="grid min-h-svh place-items-center">
      <div className="w-full max-w-sm space-y-3 p-6">
        <Skeleton className="mx-auto size-12 rounded-xl" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  )
}

const NOMBRE_ROL: Record<Rol, string> = {
  admin: 'administrador',
  operador: 'operador',
  lectura: 'solo lectura',
}

function SinPermiso({ rolNecesario }: { rolNecesario: Rol }) {
  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div>
        <h1 className="text-lg font-semibold">No tienes permiso para ver esto</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta sección es para cuentas con rol {NOMBRE_ROL[rolNecesario]} o superior. Si la
          necesitas, pídele a un administrador que ajuste tu cuenta.
        </p>
      </div>
    </div>
  )
}
