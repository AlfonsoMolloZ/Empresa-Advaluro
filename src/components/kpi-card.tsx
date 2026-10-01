import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Variacion } from '@/lib/formato'
import { cn } from '@/lib/utils'

const TONO = {
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-accent/15 text-accent',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/18 text-warning-foreground',
  danger: 'bg-destructive/12 text-destructive',
  info: 'bg-info/12 text-info',
} as const

const TONO_ICONO = {
  primary: 'bg-primary text-primary-foreground',
  accent: 'bg-accent text-accent-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  danger: 'bg-destructive text-destructive-foreground',
  info: 'bg-info text-info-foreground',
} as const

export type TonoKpi = keyof typeof TONO

interface KpiCardProps {
  titulo: string
  valor: string
  icono: LucideIcon
  tono?: TonoKpi
  /** Variación contra el mes anterior, ya formateada. */
  variacion?: Variacion
  pie?: ReactNode
  className?: string
}

export function KpiCard({ titulo, valor, icono: Icono, tono = 'primary', variacion, pie, className }: KpiCardProps) {
  return (
    <div className={cn('rounded-xl border bg-card p-4 ring-1 ring-foreground/5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">{titulo}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{valor}</p>
        </div>
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', TONO_ICONO[tono])}>
          <Icono className="size-4.5" aria-hidden />
        </span>
      </div>

      {(variacion || pie) && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          {variacion && (
            <span className={cn('inline-flex items-center gap-0.5 font-medium tabular-nums', variacion.clase)}>
              {variacion.flecha === 'up' && <ArrowUpRight className="size-3.5" aria-hidden />}
              {variacion.flecha === 'down' && <ArrowDownRight className="size-3.5" aria-hidden />}
              {variacion.flecha === null && <Minus className="size-3.5" aria-hidden />}
              {variacion.texto}
            </span>
          )}
          {pie && <span className="truncate text-muted-foreground">{pie}</span>}
        </div>
      )}
    </div>
  )
}
