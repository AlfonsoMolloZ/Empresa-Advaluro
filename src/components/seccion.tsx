import { cn } from '@/lib/utils'

/** Encabezado de sección del panel: título, descripción y acciones. */
export function SeccionHeader({
  titulo,
  descripcion,
  acciones,
  className,
}: {
  titulo: string
  descripcion?: string
  acciones?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="flex items-center gap-2">{acciones}</div>}
    </div>
  )
}

/** Etiqueta pequeña para agrupar KPIs dentro de una tarjeta. */
export function MiniEtiqueta({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase',
        'bg-muted text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Estado vacío para tablas y paneles sin registros. */
export function Vacio({ titulo, descripcion }: { titulo: string; descripcion?: string }) {
  return (
    <div className="grid place-items-center gap-1 rounded-lg border border-dashed py-10 text-center">
      <p className="text-sm font-medium">{titulo}</p>
      {descripcion && <p className="max-w-sm text-xs text-muted-foreground">{descripcion}</p>}
    </div>
  )
}
