import { AlertCircle, Database, RefreshCw, ServerOff, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Estados que el panel muestra mientras no hay datos, o si no se pudieron leer.
 *
 * Están juntos en un archivo porque las siete pantallas del panel necesitan las
 * tres cosas, y porque las tres se parecen lo bastante como para que sea fácil
 * que una pantalla invente la suya y acabe enseñando ceros cuando en realidad no
 * sabe nada.
 *
 * La distinción importante es entre "no hay datos" y "no se pudo saber": con la
 * base vacía el panel está funcionando bien, y decirlo como si fuera un error
 * manda a la gente a revisar lo que no está roto.
 */

/** Placeholder mientras llega la respuesta. */
export function Cargando({ texto = 'Cargando datos…' }: { texto?: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
      <RefreshCw className="size-5 animate-spin" aria-hidden />
      <p className="text-sm">{texto}</p>
    </div>
  )
}

/** Fallo al leer los datos, con la causa y una forma de reintentar. */
export function ErrorDatos({
  error,
  sinServidor,
  onReintentar,
}: {
  error: Error
  sinServidor: boolean
  onReintentar: () => void
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        {sinServidor ? (
          <ServerOff className="size-5" aria-hidden />
        ) : (
          <AlertCircle className="size-5" aria-hidden />
        )}
      </div>
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold">
          {sinServidor ? 'No se pudo contactar con el servidor' : 'No se pudieron leer los datos'}
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {sinServidor ? (
            <>
              El servidor local no está levantado. Enciéndelo con <code>npm run dev:full</code> y vuelve a
              intentarlo.
            </>
          ) : (
            error.message
          )}
        </p>
      </div>
      <Button variant="outline" onClick={onReintentar}>
        <RefreshCw className="size-4" aria-hidden />
        Reintentar
      </Button>
    </div>
  )
}

/**
 * Hay datos en la base pero todavía no hay viajes cerrados que los facturar.
 *
 * El caso real: se han dado de alta camiones, clientes y conductores, pero aún no
 * se ha registrado ningún viaje. El panel financiero no tiene nada que mostrar,
 * y eso no es lo mismo que una base vacía.
 */
export function SinFinanzas() {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Wallet className="size-5" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold">Todavía no hay viajes que facturar</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          La serie financiera se calcula con los viajes registrados, no con los camiones ni los clientes. En
          cuanto se registre el primer viaje, aquí aparecerán los ingresos, los costos y el margen.
        </p>
      </div>
    </div>
  )
}

/**
 * La base responde bien pero no tiene nada guardado.
 *
 * No es un error: es la base recién creada. El texto dice qué hacer en vez de
 * limitarse a mostrar tablas vacías, que es lo que hace que un panel parezca
 * roto cuando en realidad está funcionando.
 */
export function SinDatos() {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Database className="size-5" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold">Todavía no hay datos cargados</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          La base está vacía, y todo lo que ves en el panel viene de ella. Registra un camión, un cliente o un
          viaje, y el panel se llenará solo.
        </p>
      </div>
    </div>
  )
}
