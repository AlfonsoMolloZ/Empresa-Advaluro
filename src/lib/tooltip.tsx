import type { TooltipContentProps } from 'recharts'
import { soles, valorNumerico } from './formato'

/** Tarjeta de tooltip estándar para gráficos monetarios. */
export function TooltipSoles({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          {p.name}: <span className="font-medium text-foreground tabular-nums">{soles(valorNumerico(p.value))}</span>
        </p>
      ))}
    </div>
  )
}
