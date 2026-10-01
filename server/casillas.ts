/**
 * Conversión entre los dos formatos de nombres que conviven en el proyecto.
 *
 *   base de datos  tipo_carroceria   (snake_case, estándar SQL)
 *   interfaz       tipoCarroceria    (camelCase, convención de TypeScript)
 *
 * La conversión vive aquí y en ningún otro sitio. Al mover los datos a Postgres
 * más adelante, el nombre de las columnas no cambia y estas dos funciones
 * siguen siendo la única frontera que hay que tocar.
 */

export function aCamel(objeto: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const [clave, valor] of Object.entries(objeto)) {
    salida[clave.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())] = valor
  }
  return salida
}

export function aSnake(objeto: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const [clave, valor] of Object.entries(objeto)) {
    salida[clave.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = valor
  }
  return salida
}
