/** Formateadores en moneda y convención peruana (S/, millares con coma). */

const nf = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const PEN = 'S/'

export function soles(v: number) {
  return `${PEN}${nf.format(Math.round(v))}`
}

/** Versión compacta para ejes y tarjetas: S/125 mil, S/1.2 M */
export function solesCompacto(v: number) {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${PEN}${(v / 1_000_000).toFixed(1).replace('.', ',')} M`
  if (abs >= 1000) return `${PEN}${Math.round(v / 1000)} mil`
  return `${PEN}${nf.format(Math.round(v))}`
}

export function numero(v: number, decimales = 0) {
  return decimales === 0 ? nf.format(Math.round(v)) : nf1.format(v)
}

export function toneladas(v: number) {
  return `${nf1.format(v)} t`
}

export function porcentaje(v: number, decimales = 1) {
  return `${v.toFixed(decimales).replace('.', ',')} %`
}

export function km(v: number) {
  return `${nf.format(v)} km`
}

/** Fechas en formato corto peruano. */
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

export function fechaCorta(isoTexto: string) {
  const d = new Date(isoTexto)
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MESES_CORTOS[d.getUTCMonth()]}`
}

export function fechaLarga(isoTexto: string) {
  const d = new Date(isoTexto)
  return `${d.getUTCDate()} de ${MESES_CORTOS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}

export function hora(isoTexto: string) {
  const d = new Date(isoTexto)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** "hace 3 h", "en 2 d" respecto a la fecha de corte del panel. */
export function relativo(isoTexto: string, ahora: Date) {
  const diffMin = Math.round((new Date(isoTexto).getTime() - ahora.getTime()) / 60000)
  const futuro = diffMin >= 0
  const abs = Math.abs(diffMin)
  const texto =
    abs < 60
      ? `${abs} min`
      : abs < 60 * 24
        ? `${Math.round(abs / 60)} h`
        : `${Math.round(abs / (60 * 24))} d`
  return futuro ? `en ${texto}` : `hace ${texto}`
}

/** Duración legible a partir de horas. */
export function duracionHoras(horas: number) {
  const h = Math.floor(horas)
  const m = Math.round((horas - h) * 60)
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/**
 * Recharts tipa `value` como `ValueType | undefined` (string | number | array).
 * Esta utilidad lo normaliza a número para que las páginas no repitan el mismo
 * casteo defensivo dentro de cada `content={...}` del Tooltip.
 */
export function valorNumerico(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v)
  if (Array.isArray(v)) return Number(v[0])
  return 0
}

export interface Variacion {
  texto: string
  clase: string
  flecha: 'up' | 'down' | null
}

/** Variación con signo y su clase de color. */
export function variacion(v: number | null): Variacion {
  if (v === null) return { texto: '—', clase: 'text-muted-foreground', flecha: null }
  const positivo = v > 0
  const neutro = Math.abs(v) < 0.05
  if (neutro) return { texto: 'sin cambio', clase: 'text-muted-foreground', flecha: null }
  return {
    texto: `${positivo ? '+' : ''}${v.toFixed(1).replace('.', ',')} %`,
    clase: positivo ? 'text-success' : 'text-destructive',
    flecha: positivo ? 'up' : 'down',
  }
}
