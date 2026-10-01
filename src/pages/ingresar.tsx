import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, KeyRound, Lock, LogIn, Mail, ServerOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorApi, ErrorSesion, ErrorSinServidor } from '@/lib/api'
import { useSesion } from '@/lib/sesion'

/** A dónde ir después de entrar si no hay un destino pendiente. */
const DESTINO_POR_DEFECTO = '/dashboard'

export default function Ingresar() {
  const { estado, entrar } = useSesion()
  const navegar = useNavigate()
  const ubicacion = useLocation()

  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // Si ya hay sesión abierta, entrar de nuevo no tiene sentido.
  if (estado === 'autenticado') {
    return <Navigate to={DESTINO_POR_DEFECTO} replace />
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await entrar(email.trim(), contrasena)
      // Se recuerda a dónde quería ir la persona antes de que la mandaran aquí.
      const destino = (ubicacion.state as { desde?: string } | null)?.desde ?? DESTINO_POR_DEFECTO
      navegar(destino, { replace: true })
    } catch (e) {
      if (e instanceof ErrorSesion) {
        setError(e.message)
      } else if (e instanceof ErrorSinServidor) {
        setError('No se pudo contactar con el servidor local.')
      } else if (e instanceof ErrorApi) {
        setError(e.message)
      } else {
        setError('No se pudo iniciar sesión. Inténtalo otra vez.')
      }
      setEnviando(false)
    }
  }

  if (estado === 'sin-servidor') return <ServidorCaido />
  if (estado === 'cargando') return <Cargando />

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-accent text-xl font-bold text-accent-foreground">
            A
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Empresa Advaluro</h1>
          <p className="text-sm text-muted-foreground">Panel de operaciones</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Iniciar sesión</CardTitle>
            <CardDescription>
              Con tu cuenta de la empresa para ver los datos de la operación.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={enviar} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Correo</Label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nombre@advaluro.pe"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contrasena">Contraseña</Label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="contrasena"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={contrasena}
                    onChange={(e) => setContrasena(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando ? (
                  'Entrando…'
                ) : (
                  <>
                    <LogIn className="size-4" aria-hidden />
                    Entrar
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          ¿No tienes cuenta? Pídele a un administrador que te cree una.{' '}
          <Link to="/" className="underline underline-offset-4 hover:text-foreground">
            Volver a la web
          </Link>
        </p>
      </div>
    </div>
  )
}

function Cargando() {
  return (
    <div className="grid min-h-svh place-items-center">
      <p className="text-sm text-muted-foreground">Comprobando la sesión…</p>
    </div>
  )
}

/**
 * El servidor local no está levantado. Es el caso más probable al empezar, así
 * que el mensaje dice exactamente qué ejecutar en lugar de un error genérico.
 */
function ServidorCaido() {
  return (
    <div className="grid min-h-svh place-items-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 grid size-11 place-items-center rounded-lg bg-warning/20">
            <ServerOff className="size-5 text-warning-foreground" aria-hidden />
          </div>
          <CardTitle className="text-base">El servidor no está corriendo</CardTitle>
          <CardDescription>
            El panel necesita la API local para saber quién eres y de dónde sacar los datos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-3">
            <p className="mb-1.5 text-xs text-muted-foreground">Levanta la aplicación con:</p>
            <code className="block font-mono text-sm">npm run dev:full</code>
          </div>
          <p className="text-sm text-muted-foreground">
            La primera vez, el servidor muestra en la consola el correo y la contraseña del
            administrador inicial. Anótalos: solo se ven una vez.
          </p>
          <Button variant="outline" className="w-full" onClick={() => location.reload()}>
            <KeyRound className="size-4" aria-hidden />
            Reintentar
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
