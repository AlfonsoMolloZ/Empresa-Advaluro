import type { Rol } from './auth.ts'
import { ErrorApi } from './error.ts'

// Se reexporta para no romper los imports que ya usaban ErrorApi desde aquí.
export { ErrorApi, errorValidacion } from './error.ts'

/**
 * Lista blanca de entidades manipulables.
 *
 * El nombre de la tabla y las columnas SIEMPRE salen de este archivo, nunca de la
 * petición. Por eso la API no puede recibir SQL del cliente: cambiar el recurso
 * es cambiar la ruta, no tocar la base.
 */
export interface Recurso {
  /** Clave que aparece en la URL: /api/camiones */
  nombre: string
  /** Etiqueta para los mensajes de error. */
  etiqueta: string
  tabla: string
  /** Columnas que el cliente puede escribir. `id` y `creado_en` quedan fuera. */
  columnas: readonly string[]
  /** ORDER BY por defecto al listar. */
  orden: string
  /** Parámetros de consulta admitidos, traducidos a columnas. */
  filtros: Readonly<Record<string, string>>
  /** Columnas donde se busca el parámetro `?q=`. */
  busqueda?: readonly string[]
  /** Rol mínimo para crear o editar. */
  minimoEscribir: Rol
  /** Rol mínimo para borrar. */
  minimoBorrar: Rol
  /**
   * Comprobaciones antes de borrar. Si algo impide el borrado, se lanza un error
   * con un mensaje que dice qué hacer en su lugar.
   */
  noBorrarSi?: readonly Bloqueo[]
  /** Normaliza y valida el cuerpo de la petición. */
  normaliza: (cuerpo: Record<string, unknown>, idExistente: string | null) => Record<string, unknown>
  /**
   * Ajusta la fila al salir de la API, para que el cliente reciba exactamente la
   * forma que espera. Así ninguna otra parte tiene que acordarse de las rarezas.
   */
  alLeer?: (fila: Record<string, unknown>) => Record<string, unknown>
  /** Columnas que en la base son 0/1 y en la interfaz son true/false. */
  booleanas: readonly string[]
}

export interface Bloqueo {
  /** Tabla que se revisa en busca de filas que dependen de esta. */
  tabla: string
  /** Columna que apunta a la entidad que se quiere borrar. */
  columna: string
  /** Condición adicional, o null para cualquier fila. */
  condicion?: string | null
  /** Qué se le dice a la persona que intentó borrar. */
  mensaje: string
}

/**
 * Lanza un error con el código HTTP que le corresponde.
 *
 * Los campos van declarados a mano y no como propiedades del constructor porque
 * Node ejecuta estos archivos quitando los tipos, sin transformarlos: la sintaxis
 * de parameter properties de TypeScript no funciona en ese modo.
 */

/**
 * Lectores de un valor del cuerpo de la petición.
 *
 * Cuando el campo es obligatorio devuelven `string` y no `string | null`: así
 * TypeScript sabe que no hay que comprobar nada, sin `!` por todas partes. Cuando
 * es opcional, sí devuelven `string | null` y quien llama decide el valor.
 */
/**
 * Los nombres de campo empiezan en mayúscula porque se muestran junto a un
 * formulario ("La placa"), pero dentro de una frase van en minúscula: "Falta la
 * placa", no "Falta La placa".
 */
function enFrase(campo: string) {
  return campo.charAt(0).toLowerCase() + campo.slice(1)
}

function texto(v: unknown, campo: string, requerido: true, max?: number): string
function texto(v: unknown, campo: string, requerido?: false, max?: number): string | null
function texto(v: unknown, campo: string, requerido = true, max = 500): string | null {
  if (v === undefined || v === null || v === '') {
    if (requerido) throw new ErrorApi(422, `Falta ${enFrase(campo)}`, campo)
    return null
  }
  const s = String(v).trim()
  if (requerido && s === '') throw new ErrorApi(422, `Falta ${enFrase(campo)}`, campo)
  if (s.length > max) throw new ErrorApi(422, `${campo} es demasiado largo (máximo ${max})`, campo)
  return s
}

function numero(v: unknown, campo: string, requerido: true, min?: number): number
function numero(v: unknown, campo: string, requerido?: false, min?: number): number | null
function numero(v: unknown, campo: string, requerido = true, min?: number): number | null {
  if (v === undefined || v === null || v === '') {
    if (requerido) throw new ErrorApi(422, `Falta ${enFrase(campo)}`, campo)
    return null
  }
  // Se quitan los separadores de miles (1,234.50 → 1234.50) antes de convertir.
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(n)) throw new ErrorApi(422, `${campo} debe ser un número`, campo)
  if (min !== undefined && n < min) throw new ErrorApi(422, `${campo} no puede ser menor que ${min}`, campo)
  return n
}

function entero(v: unknown, campo: string, requerido: true, min?: number): number
function entero(v: unknown, campo: string, requerido?: false, min?: number): number | null
function entero(v: unknown, campo: string, requerido = true, min?: number): number | null {
  const n = numero(v, campo, requerido as true, min)
  if (n === null) return null
  if (!Number.isInteger(n)) throw new ErrorApi(422, `${campo} debe ser un número entero`, campo)
  return n
}

const booleano = (v: unknown, porDefecto = 1): number => {
  if (v === undefined || v === null || v === '') return porDefecto
  return v === false || v === 0 || v === '0' || v === 'false' ? 0 : 1
}

const listado = (v: unknown, separador = ','): string => {
  if (v === undefined || v === null) return ''
  if (Array.isArray(v)) return v.join(separador)
  return String(v)
    .split(separador)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(separador)
}

// ── Catálogos ────────────────────────────────────────────────────────────────
// Solo un administrador los cambia. Los escribe el servidor, no el usuario.

export const CIUDADES: Recurso = {
  nombre: 'ciudades',
  etiqueta: 'La ciudad',
  tabla: 'ciudades',
  columnas: ['nombre', 'departamento', 'zona', 'lat', 'lng'],
  booleanas: [],
  orden: 'nombre',
  filtros: { zona: 'zona' },
  busqueda: ['nombre', 'departamento'],
  minimoEscribir: 'admin',
  minimoBorrar: 'admin',
  normaliza: (c) =>
    compact({
      nombre: texto(c.nombre, 'El nombre'),
      departamento: texto(c.departamento, 'El departamento'),
      zona: texto(c.zona, 'La zona'),
      lat: numero(c.lat, 'La latitud', true, -90),
      lng: numero(c.lng, 'La longitud', true, -180),
    }),
}

export const RUBROS: Recurso = {
  nombre: 'rubros',
  etiqueta: 'El rubro',
  tabla: 'rubros',
  columnas: ['nombre'],
  booleanas: [],
  orden: 'nombre',
  filtros: {},
  busqueda: ['nombre'],
  minimoEscribir: 'admin',
  minimoBorrar: 'admin',
  normaliza: (c) => compact({ nombre: texto(c.nombre, 'El nombre') }),
}

export const RUTAS: Recurso = {
  nombre: 'rutas',
  etiqueta: 'La ruta',
  tabla: 'rutas',
  columnas: ['origen_id', 'destino_id', 'km', 'tipo', 'carrocerias', 'peajes', 'activa'],
  booleanas: ['activa'],
  orden: 'origen_id, destino_id',
  filtros: { origen_id: 'origen_id', destino_id: 'destino_id', tipo: 'tipo', activa: 'activa' },
  busqueda: ['carrocerias'],
  minimoEscribir: 'admin',
  minimoBorrar: 'admin',
  noBorrarSi: [
    { tabla: 'viajes', columna: 'ruta_id', mensaje: 'La ruta tiene viajes registrados. Desactívala con activa = 0 en vez de borrarla.' },
  ],
  normaliza: (c) =>
    compact({
      origen_id: texto(c.origen_id, 'La ciudad de origen'),
      destino_id: texto(c.destino_id, 'La ciudad de destino'),
      km: numero(c.km, 'La distancia', true, 1),
      tipo: texto(c.tipo, 'El tipo', false) ?? 'transversal',
      // Se acepta cualquiera de los dos nombres: al crear se manda `carroceria`
      // (la lista que ve el panel) y al editar se recibe `carrocerias` fusionado
      // desde el registro guardado.
      carrocerias: listado(c.carrocerias ?? c.carroceria),
      peajes: entero(c.peajes, 'Los peajes', false, 0) ?? 0,
      activa: booleano(c.activa),
    }),
  // En la base la lista de carrocerías se guarda como texto separado por comas;
  // quien la consume siempre quiere un arreglo.
  alLeer: (fila) => ({
    ...fila,
    carroceria: String(fila.carrocerias ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    carrocerias: undefined,
  }),
}

// ── Tipos de camión ──────────────────────────────────────────────────────────

export const TIPOS_CAMION: Recurso = {
  nombre: 'tipos_camion',
  etiqueta: 'El tipo de camión',
  tabla: 'tipos_camion',
  columnas: [
    'nombre', 'chasis', 'ejes', 'capacidad_ton', 'capacidad_m3',
    'tanque_litros', 'consumo_gal_100km', 'activo',
  ],
  booleanas: ['activo'],
  orden: 'nombre',
  filtros: { activo: 'activo' },
  busqueda: ['nombre', 'chasis'],
  minimoEscribir: 'admin',
  minimoBorrar: 'admin',
  noBorrarSi: [
    { tabla: 'camiones', columna: 'tipo_id', mensaje: 'Hay camiones de este tipo. Desactívalo con activo = 0 en vez de borrarlo.' },
  ],
  normaliza: (c) =>
    compact({
      nombre: texto(c.nombre, 'El nombre'),
      chasis: texto(c.chasis, 'El chasis', false),
      ejes: entero(c.ejes, 'Los ejes', false, 1),
      capacidad_ton: numero(c.capacidad_ton, 'La capacidad en toneladas', false, 0),
      capacidad_m3: numero(c.capacidad_m3, 'La capacidad en metros cúbicos', false, 0),
      tanque_litros: numero(c.tanque_litros, 'El tanque en litros', true, 1),
      consumo_gal_100km: numero(c.consumo_gal_100km, 'El consumo por 100 km', true, 0.1),
      activo: booleano(c.activo),
    }),
}

// ── Operación ────────────────────────────────────────────────────────────────

export const CAMIONES: Recurso = {
  nombre: 'camiones',
  etiqueta: 'El camión',
  tabla: 'camiones',
  columnas: [
    'placa', 'modelo', 'anio', 'tipo_id', 'tipo_carroceria', 'capacidad_ton',
    'estado', 'conductor_id', 'km_total', 'km_ultimo_servicio', 'proximo_servicio_km',
    'taller', 'fecha_ingreso', 'tanque_litros', 'consumo_gal_100km', 'activo',
  ],
  booleanas: ['activo'],
  orden: 'placa',
  filtros: { estado: 'estado', tipo_id: 'tipo_id', conductor_id: 'conductor_id', activo: 'activo' },
  busqueda: ['placa', 'modelo'],
  minimoEscribir: 'operador',
  minimoBorrar: 'admin',
  noBorrarSi: [
    { tabla: 'viajes', columna: 'camion_id', mensaje: 'El camión tiene viajes registrados. Márcalo como inactivo (activo = 0) en vez de borrarlo: así el historial se conserva.' },
    { tabla: 'abastecimientos', columna: 'camion_id', mensaje: 'El camión tiene abastecimientos registrados. Márcalo como inactivo (activo = 0) en vez de borrarlo.' },
  ],
  normaliza: (c) =>
    compact({
      placa: texto(c.placa, 'La placa', true, 12).toUpperCase(),
      modelo: texto(c.modelo, 'El modelo', false),
      anio: entero(c.anio, 'El año', false, 1990),
      tipo_id: texto(c.tipo_id, 'El tipo de camión'),
      tipo_carroceria: texto(c.tipo_carroceria, 'La carrocería', false) ?? 'plataforma',
      capacidad_ton: numero(c.capacidad_ton, 'La capacidad en toneladas', false, 0),
      estado: texto(c.estado, 'El estado', false) ?? 'disponible',
      conductor_id: texto(c.conductor_id, 'El conductor', false),
      km_total: numero(c.km_total, 'El kilometraje', false, 0) ?? 0,
      km_ultimo_servicio: numero(c.km_ultimo_servicio, 'El último servicio', false, 0),
      proximo_servicio_km: numero(c.proximo_servicio_km, 'El próximo servicio', false, 0),
      taller: texto(c.taller, 'El taller', false),
      fecha_ingreso: texto(c.fecha_ingreso, 'La fecha de ingreso', false, 10),
      tanque_litros: numero(c.tanque_litros, 'El tanque en litros', false, 1),
      consumo_gal_100km: numero(c.consumo_gal_100km, 'El consumo por 100 km', false, 0.1),
      activo: booleano(c.activo),
    }),
}

export const CONDUCTORES: Recurso = {
  nombre: 'conductores',
  etiqueta: 'El conductor',
  tabla: 'conductores',
  columnas: [
    'nombres', 'licencia', 'experiencia_anios', 'telefono', 'base',
    'puntaje', 'estado', 'activo',
  ],
  booleanas: ['activo'],
  orden: 'nombres',
  filtros: { estado: 'estado', activo: 'activo' },
  busqueda: ['nombres', 'licencia', 'base'],
  minimoEscribir: 'operador',
  minimoBorrar: 'admin',
  noBorrarSi: [
    { tabla: 'viajes', columna: 'conductor_id', mensaje: 'El conductor tiene viajes registrados. Márcalo como inactivo (activo = 0) en vez de borrarlo.' },
  ],
  normaliza: (c) =>
    compact({
      nombres: texto(c.nombres, 'El nombre'),
      licencia: texto(c.licencia, 'La licencia'),
      experiencia_anios: entero(c.experiencia_anios, 'Los años de experiencia', false, 0) ?? 0,
      telefono: texto(c.telefono, 'El teléfono', false),
      base: texto(c.base, 'La base', false),
      puntaje: numero(c.puntaje, 'El puntaje', false, 0) ?? 100,
      estado: texto(c.estado, 'El estado', false) ?? 'activo',
      activo: booleano(c.activo),
    }),
}

export const CLIENTES: Recurso = {
  nombre: 'clientes',
  etiqueta: 'El cliente',
  tabla: 'clientes',
  columnas: [
    'razon_social', 'ruc', 'rubro_id', 'contacto', 'telefono', 'email',
    'ciudad_id', 'tarifa_por_km', 'plazo_pago_dias', 'satisfaccion', 'activo',
  ],
  booleanas: ['activo'],
  orden: 'razon_social',
  filtros: { rubro_id: 'rubro_id', ciudad_id: 'ciudad_id', activo: 'activo' },
  busqueda: ['razon_social', 'ruc', 'contacto'],
  minimoEscribir: 'operador',
  minimoBorrar: 'admin',
  noBorrarSi: [
    { tabla: 'facturas', columna: 'cliente_id', mensaje: 'El cliente tiene facturas registradas. Márcalo como inactivo (activo = 0) en vez de borrarlo.' },
  ],
  normaliza: (c) =>
    compact({
      razon_social: texto(c.razon_social, 'La razón social'),
      ruc: texto(c.ruc, 'El RUC', false, 11),
      rubro_id: texto(c.rubro_id, 'El rubro', false),
      contacto: texto(c.contacto, 'El contacto', false),
      telefono: texto(c.telefono, 'El teléfono', false),
      email: texto(c.email, 'El correo', false, 120),
      ciudad_id: texto(c.ciudad_id, 'La ciudad', false),
      tarifa_por_km: numero(c.tarifa_por_km, 'La tarifa por km', false, 0) ?? 0,
      plazo_pago_dias: entero(c.plazo_pago_dias, 'El plazo de pago', false, 0) ?? 30,
      satisfaccion: numero(c.satisfaccion, 'La satisfacción', false, 0),
      activo: booleano(c.activo),
    }),
}

export const VIAJES: Recurso = {
  nombre: 'viajes',
  etiqueta: 'El viaje',
  tabla: 'viajes',
  columnas: [
    'referencia', 'camion_id', 'conductor_id', 'cliente_id', 'ruta_id', 'rubro_id',
    'estado', 'salida', 'llegada_programada', 'llegada_real', 'km', 'toneladas',
    'flete', 'costo_peaje', 'costo_mantenimiento', 'costo_otros', 'temperatura_c', 'observaciones',
  ],
  booleanas: [],
  orden: 'salida DESC',
  filtros: {
    camion_id: 'camion_id', conductor_id: 'conductor_id', cliente_id: 'cliente_id',
    ruta_id: 'ruta_id', estado: 'estado', rubro_id: 'rubro_id',
  },
  busqueda: ['referencia', 'observaciones'],
  minimoEscribir: 'operador',
  minimoBorrar: 'admin',
  normaliza: (c, _idExistente) =>
    compact({
      referencia: texto(c.referencia, 'La referencia', true, 40),
      camion_id: texto(c.camion_id, 'El camión'),
      conductor_id: texto(c.conductor_id, 'El conductor'),
      cliente_id: texto(c.cliente_id, 'El cliente', false),
      ruta_id: texto(c.ruta_id, 'La ruta'),
      rubro_id: texto(c.rubro_id, 'El rubro', false),
      estado: texto(c.estado, 'El estado', false) ?? 'programado',
      salida: texto(c.salida, 'La salida', true, 30),
      llegada_programada: texto(c.llegada_programada, 'La llegada programada', false, 30),
      llegada_real: texto(c.llegada_real, 'La llegada real', false, 30),
      km: numero(c.km, 'Los kilómetros', false, 0) ?? 0,
      toneladas: numero(c.toneladas, 'Las toneladas', false, 0),
      flete: numero(c.flete, 'El flete', false, 0) ?? 0,
      costo_peaje: numero(c.costo_peaje, 'El costo de peajes', false, 0) ?? 0,
      costo_mantenimiento: numero(c.costo_mantenimiento, 'El costo de mantenimiento', false, 0) ?? 0,
      costo_otros: numero(c.costo_otros, 'Otros costos', false, 0) ?? 0,
      temperatura_c: numero(c.temperatura_c, 'La temperatura', false),
      observaciones: texto(c.observaciones, 'Las observaciones', false, 1000),
    }),
}

export const ABASTECIMIENTOS: Recurso = {
  nombre: 'abastecimientos',
  etiqueta: 'El abastecimiento',
  tabla: 'abastecimientos',
  // costo_total es una columna generada: no se puede escribir.
  columnas: [
    'camion_id', 'conductor_id', 'fecha', 'galones', 'precio_galon',
    'tipo_combustible', 'estacion', 'km', 'notas',
  ],
  booleanas: [],
  orden: 'fecha DESC, id',
  filtros: { camion_id: 'camion_id', conductor_id: 'conductor_id', fecha: 'fecha' },
  busqueda: ['estacion', 'notas'],
  minimoEscribir: 'operador',
  minimoBorrar: 'admin',
  normaliza: (c) =>
    compact({
      camion_id: texto(c.camion_id, 'El camión'),
      conductor_id: texto(c.conductor_id, 'El conductor', false),
      fecha: texto(c.fecha, 'La fecha', true, 30),
      galones: numero(c.galones, 'Los galones', true, 0.01),
      precio_galon: numero(c.precio_galon, 'El precio por galón', true, 0.01),
      tipo_combustible: texto(c.tipo_combustible, 'El tipo de combustible', false) ?? 'diesel',
      estacion: texto(c.estacion, 'La estación', false),
      km: numero(c.km, 'El odómetro', false, 0),
      notas: texto(c.notas, 'Las notas', false, 500),
    }),
}

export const FACTURAS: Recurso = {
  nombre: 'facturas',
  etiqueta: 'La factura',
  tabla: 'facturas',
  columnas: ['numero', 'cliente_id', 'viaje_id', 'emitida', 'vencimiento', 'monto', 'estado'],
  booleanas: [],
  orden: 'emitida DESC',
  filtros: { cliente_id: 'cliente_id', viaje_id: 'viaje_id', estado: 'estado' },
  busqueda: ['numero'],
  minimoEscribir: 'operador',
  minimoBorrar: 'admin',
  normaliza: (c) =>
    compact({
      numero: texto(c.numero, 'El número', true, 30),
      cliente_id: texto(c.cliente_id, 'El cliente'),
      viaje_id: texto(c.viaje_id, 'El viaje', false),
      emitida: texto(c.emitida, 'La fecha de emisión', true, 10),
      vencimiento: texto(c.vencimiento, 'El vencimiento', true, 10),
      monto: numero(c.monto, 'El monto', true, 0),
      estado: texto(c.estado, 'El estado', false) ?? 'pendiente',
    }),
}

export const MANTENIMIENTOS: Recurso = {
  nombre: 'mantenimientos',
  etiqueta: 'El mantenimiento',
  tabla: 'mantenimientos',
  columnas: ['camion_id', 'tipo', 'fecha_programada', 'km_programado', 'costo_estimado', 'estado'],
  booleanas: [],
  orden: 'fecha_programada DESC',
  filtros: { camion_id: 'camion_id', estado: 'estado' },
  busqueda: ['tipo', 'estado'],
  minimoEscribir: 'operador',
  minimoBorrar: 'admin',
  normaliza: (c) =>
    compact({
      camion_id: texto(c.camion_id, 'El camión'),
      tipo: texto(c.tipo, 'El tipo'),
      fecha_programada: texto(c.fecha_programada, 'La fecha programada', true, 10),
      km_programado: numero(c.km_programado, 'El kilometraje programado', false, 0),
      costo_estimado: numero(c.costo_estimado, 'El costo estimado', false, 0) ?? 0,
      estado: texto(c.estado, 'El estado', false) ?? 'programado',
    }),
}

export const INCIDENTES: Recurso = {
  nombre: 'incidentes',
  etiqueta: 'El incidente',
  tabla: 'incidentes',
  columnas: ['viaje_id', 'conductor_id', 'tipo', 'fecha', 'severidad', 'descripcion', 'costo', 'estado'],
  booleanas: [],
  orden: 'fecha DESC',
  filtros: { viaje_id: 'viaje_id', conductor_id: 'conductor_id', severidad: 'severidad', estado: 'estado' },
  busqueda: ['descripcion', 'tipo'],
  minimoEscribir: 'operador',
  minimoBorrar: 'admin',
  normaliza: (c) =>
    compact({
      viaje_id: texto(c.viaje_id, 'El viaje', false),
      conductor_id: texto(c.conductor_id, 'El conductor', false),
      tipo: texto(c.tipo, 'El tipo'),
      fecha: texto(c.fecha, 'La fecha', true, 10),
      severidad: texto(c.severidad, 'La severidad', false) ?? 'baja',
      descripcion: texto(c.descripcion, 'La descripción', false, 1000),
      costo: numero(c.costo, 'El costo', false, 0) ?? 0,
      estado: texto(c.estado, 'El estado', false) ?? 'abierto',
    }),
}

export const GASTOS: Recurso = {
  nombre: 'gastos',
  etiqueta: 'El gasto',
  tabla: 'gastos',
  columnas: ['mes', 'categoria', 'concepto', 'monto', 'camion_id', 'conductor_id', 'notas'],
  booleanas: [],
  orden: 'mes DESC, categoria',
  filtros: { mes: 'mes', categoria: 'categoria', camion_id: 'camion_id' },
  busqueda: ['concepto', 'notas'],
  minimoEscribir: 'operador',
  minimoBorrar: 'admin',
  normaliza: (c) => {
    const mes = texto(c.mes, 'El mes', true, 7)
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      throw new ErrorApi(422, 'El mes debe tener el formato AAAA-MM', 'mes')
    }
    return compact({
      mes,
      categoria: texto(c.categoria, 'La categoría'),
      concepto: texto(c.concepto, 'El concepto'),
      monto: numero(c.monto, 'El monto', true, 0),
      camion_id: texto(c.camion_id, 'El camión', false),
      conductor_id: texto(c.conductor_id, 'El conductor', false),
      notas: texto(c.notas, 'Las notas', false, 500),
    })
  },
}

/** Quita las claves cuyo valor es null, para no pisar lo que ya está cargado. */
function compact(objeto: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(objeto)) {
    if (v !== undefined) salida[k] = v
  }
  return salida
}

export const RECURSOS: readonly Recurso[] = [
  CIUDADES, RUBROS, RUTAS, TIPOS_CAMION, CAMIONES, CONDUCTORES, CLIENTES,
  VIAJES, ABASTECIMIENTOS, FACTURAS, MANTENIMIENTOS, INCIDENTES, GASTOS,
]

export function recursoPorNombre(nombre: string): Recurso | undefined {
  return RECURSOS.find((r) => r.nombre === nombre)
}
