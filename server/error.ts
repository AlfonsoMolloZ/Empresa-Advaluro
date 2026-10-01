/**
 * Error de la API con el código HTTP que corresponde.
 *
 * Vive en su propio archivo y no en `recursos.ts` porque lo usan casi todos los
 * módulos, y `recursos.ts` ya importa de `auth.ts`: si `auth.ts` importara de
 * vuelta desde `recursos.ts` se formaría un ciclo.
 */
export class ErrorApi extends Error {
  estado: number
  campo?: string

  constructor(estado: number, mensaje: string, campo?: string) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.estado = estado
    this.campo = campo
  }
}

/** 422: lo que se envió no cumple las reglas, y el campo culpable va junto. */
export function errorValidacion(mensaje: string, campo?: string) {
  return new ErrorApi(422, mensaje, campo)
}

/** 404: se pidió algo que no existe. */
export function errorNoEncontrado(mensaje: string) {
  return new ErrorApi(404, mensaje)
}

/** 409: la operación chocaría con el estado actual (duplicado, último admin, etc.). */
export function errorConflicto(mensaje: string) {
  return new ErrorApi(409, mensaje)
}

/** 401 y 403: falta iniciar sesión, o la sesión no alcanza para esto. */
export function errorSesion(mensaje: string, estado: 401 | 403 = 403) {
  return new ErrorApi(estado, mensaje)
}
