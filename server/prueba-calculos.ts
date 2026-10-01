/**
 * Pruebas de la analítica del panel (`src/data/calculos.ts`).
 *
 * La mitad de estas pruebas son con el dataset vacío, y no por curiosidad sino
 * porque ese es el caso que rompía la aplicación: con la base recién creada, el
 * resumen se leía `finanzasMensuales[finanzasMensuales.length - 1]`, que era
 * `undefined`, y la pantalla moría con un TypeError al abrirse. Lo que se
 * comprueba aquí es que con cero filas todo devuelve un número presentable, y
 * sobre todo que nunca devuelve `NaN` ni `Infinity`: un `NaN` pintado en una
 * tarjeta se lee como un error de cálculo, y no lo es.
 *
 * Uso: node server/prueba-calculos.ts
 */

import {
  cerrados,
  composicionCostos,
  distribucionPorRubro,
  entregadoEnTiempo,
  facturacionPorCliente,
  kpisResumen,
  margenBrutoViaje,
  margenDe,
  mesEnCurso,
  onTimeRate,
  prorratear,
  rankingRutas,
  serieFinanciera,
  utilizacionFlota,
  variacion,
} from '../src/data/calculos.ts'
import { DATASET_VACIO, sinDatos } from '../src/data/dataset.ts'
import type { Dataset, MesFinancieroApi, ViajeApi } from '../src/data/dataset.ts'

const fallos: string[] = []
let pasadas = 0

function comprobar(condicion: boolean, descripcion: string, extra?: unknown) {
  if (condicion) {
    pasadas++
    console.log(`  ok   ${descripcion}`)
  } else {
    fallos.push(descripcion)
    console.log(`  FALLA ${descripcion}${extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`)
  }
}

function igual<T>(obtenido: T, esperado: T, descripcion: string) {
  const bien = JSON.stringify(obtenido) === JSON.stringify(esperado)
  comprobar(bien, bien ? descripcion : `${descripcion} (obtenido: ${JSON.stringify(obtenido)})`)
}

/**
 * Falla si algún número de la estructura no es un número usable.
 *
 * Es la comprobación que de verdad importa con la base vacía: un `NaN` se
 * propaga en silencio por los cálculos y aparece en pantalla como un número
 * roto, muy lejos de su origen.
 */
function sinNaN(valor: unknown, ruta = 'kpis'): string[] {
  const malos: string[] = []
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) malos.push(`${ruta} = ${valor}`)
    return malos
  }
  if (Array.isArray(valor)) {
    valor.forEach((v, i) => malos.push(...sinNaN(v, `${ruta}[${i}]`)))
    return malos
  }
  if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) malos.push(...sinNaN(v, `${ruta}.${k}`))
  }
  return malos
}

function viaje(extra: Partial<ViajeApi> = {}): ViajeApi {
  return {
    id: 'v1',
    referencia: 'AD-1',
    camionId: 'c1',
    conductorId: 'co1',
    clienteId: 'cl1',
    rutaId: 'r1',
    rubroId: 'refrigerados',
    estado: 'entregado',
    salida: '2026-09-01T08:00:00Z',
    llegadaProgramada: '2026-09-02T08:00:00Z',
    llegadaReal: '2026-09-02T07:00:00Z',
    km: 100,
    toneladas: 10,
    flete: 1000,
    costoCombustible: 100,
    costoPeaje: 50,
    costoMantenimiento: 25,
    costoOtros: 25,
    temperaturaC: 4,
    observaciones: null,
    costoCombustibleEstimado: false,
    precioGalonUsado: 17.9,
    placa: 'ABC-123',
    nombreConductor: 'Persona Prueba',
    origenId: 'lima',
    destinoId: 'trujillo',
    ...extra,
  }
}

function mes(extra: Partial<MesFinancieroApi> = {}): MesFinancieroApi {
  return {
    mes: '2026-09',
    etiqueta: 'sep',
    ingresos: 1000,
    costos: {
      combustible: 100,
      mantenimiento: 50,
      planilla: 200,
      peajes: 50,
      permisos: 30,
      gastosViaje: 20,
      administrativo: 50,
    },
    totalCostos: 500,
    utilidad: 500,
    viajes: 2,
    toneladas: 20,
    diasTranscurridos: 30,
    diasDelMes: 30,
    mesEnCurso: false,
    ...extra,
  }
}

function dataset(extra: Partial<Dataset> = {}): Dataset {
  return { ...DATASET_VACIO, ...extra }
}

// ── El caso que rompía la aplicación ──────────────────────────────────────────

console.log('\n── Base vacía: nada de NaN ni de reventones ──')

comprobar(sinDatos(DATASET_VACIO), 'el dataset vacío se reconoce como sin datos')
comprobar(!sinDatos(dataset({ camiones: [{ id: 'c1' } as never] })), 'con un camión ya no se considera vacío')

const kpisVacios = kpisResumen(DATASET_VACIO)
igual(sinNaN(kpisVacios), [], 'los KPIs con la base vacía no tienen ningún NaN')
igual(kpisVacios.ingresosMes, 0, 'los ingresos del mes son 0, no undefined')
igual(kpisVacios.camionesTotal, 0, 'el total de camiones es 0')
igual(kpisVacios.variacionIngresos, 0, 'sin periodo anterior la variación es 0, no NaN')
igual(kpisVacios.variacionMargen, 0, 'la variación de margen también es 0')
igual(kpisVacios.variacionOnTime, 0, 'la variación de puntualidad también es 0')

igual(onTimeRate(DATASET_VACIO.viajesTodos), 0, 'la puntualidad sin viajes es 0')
igual(utilizacionFlota(DATASET_VACIO), 0, 'la utilización sin viajes es 0')
igual(margenDe([]), 0, 'el margen sin viajes es 0')
igual(serieFinanciera(DATASET_VACIO), [], 'la serie financiera vacía es una lista vacía')
igual(composicionCostos(DATASET_VACIO), [], 'sin mes en curso no hay torta que dibujar')
igual(rankingRutas(DATASET_VACIO), [], 'sin viajes no hay ranking de rutas')
igual(facturacionPorCliente(DATASET_VACIO), [], 'sin clientes no hay cartera')
igual(distribucionPorRubro(DATASET_VACIO), [], 'sin viajes no hay rubros')
igual(mesEnCurso(DATASET_VACIO.finanzasMensuales), null, 'no hay mes en curso en una base vacía')

console.log('\n── Base vacía: los cálculos no lanzan ──')

for (const [nombre, accion] of [
  ['kpisResumen', () => kpisResumen(DATASET_VACIO)],
  ['composicionCostos', () => composicionCostos(DATASET_VACIO)],
  ['rankingRutas', () => rankingRutas(DATASET_VACIO)],
  ['distribucionPorRubro', () => distribucionPorRubro(DATASET_VACIO)],
  ['facturacionPorCliente', () => facturacionPorCliente(DATASET_VACIO)],
  ['serieFinanciera', () => serieFinanciera(DATASET_VACIO)],
] as const) {
  try {
    const resultado = accion()
    comprobar(Array.isArray(resultado) || typeof resultado === 'object', `${nombre} responde sin excepción`)
  } catch (e) {
    comprobar(false, `${nombre} responde sin excepción`, e instanceof Error ? e.message : e)
  }
}

// ── Con un solo mes: no hay con qué comparar ───────────────────────────────────

console.log('\n── Un solo mes: no hay periodo anterior ──')

const unMes = dataset({ finanzasMensuales: [mes({ mesEnCurso: true, diasTranscurridos: 15 })] })
const kpisUnMes = kpisResumen(unMes)
igual(sinNaN(kpisUnMes), [], 'los KPIs con un único mes no tienen NaN')
igual(kpisUnMes.variacionIngresos, 0, 'sin mes anterior la variación de ingresos es 0')
igual(kpisUnMes.variacionMargen, 0, 'sin mes anterior la variación de margen es 0')
igual(kpisUnMes.variacionOnTime, 0, 'sin mes anterior la variación de puntualidad es 0')
igual(kpisUnMes.margenNeto, 50, 'el margen del mes se calcula igual: 500/1000')
igual(mesEnCurso(unMes.finanzasMensuales)?.mes, '2026-09', 'el mes en curso se encuentra')

console.log('\n── Un mes con ingresos cero ──')

const sinIngresos = dataset({ finanzasMensuales: [mes({ ingresos: 0, utilidad: 0, mesEnCurso: true })] })
igual(sinNaN(kpisResumen(sinIngresos)), [], 'un mes sin ingresos no genera NaN en el margen')

// ── Prorrateo ─────────────────────────────────────────────────────────────────

console.log('\n── Prorrateo ──')

igual(prorratear(mes({ ingresos: 3100, diasDelMes: 31, diasTranscurridos: 31 })), 3100, 'un mes completo no se escala')
igual(prorratear(mes({ ingresos: 3100, diasDelMes: 31, diasTranscurridos: 15 })), 1500, 'medio mes se lleva la mitad')
igual(prorratear(mes({ ingresos: 100, diasDelMes: 0 })), 100, 'un mes de cero días devuelve la cifra sin dividir')

// ── Viajes sueltos ────────────────────────────────────────────────────────────

console.log('\n── Viajes ──')

const entregadoPronto = viaje()
const entregadoTarde = viaje({ id: 'v2', llegadaReal: '2026-09-02T20:00:00Z' })
const enCurso = viaje({ id: 'v3', estado: 'en_curso', llegadaReal: null })

comprobar(cerrados(entregadoPronto), 'un viaje entregado está cerrado')
comprobar(cerrados({ ...enCurso, estado: 'retrasado' }), 'un viaje retrasado está cerrado')
comprobar(!cerrados(enCurso), 'un viaje en curso no está cerrado')
comprobar(entregadoEnTiempo(entregadoPronto), 'llegar antes de la hora cuenta como a tiempo')
comprobar(!entregadoEnTiempo(entregadoTarde), 'llegar tarde no cuenta como a tiempo')
comprobar(!entregadoEnTiempo(enCurso), 'un viaje sin llegada real no cuenta como a tiempo')

const tres = [entregadoPronto, entregadoTarde, enCurso]
igual(onTimeRate(tres), 50, 'de dos viajes cerrados, uno a tiempo: 50%')
igual(tres.filter(cerrados).length, 2, 'los dos cerrados se cuentan, el en curso no')

console.log('\n── Costo y margen por viaje ──')

const { costo, utilidad, margenPct } = margenBrutoViaje(entregadoPronto)
igual(costo, 200, 'el costo total suma los cuatro conceptos')
igual(utilidad, 800, 'la utilidad es el flete menos el costo')
igual(margenPct, 80, 'el margen es 800 sobre 1000')
igual(margenBrutoViaje(viaje({ flete: 0 })).margenPct, 0, 'un viaje sin flete da margen 0, no NaN')

console.log('\n── Variación porcentual ──')

igual(variacion(110, 100), 10, 'subir de 100 a 110 es 10%')
igual(variacion(90, 100), -10, 'bajar de 100 a 90 es -10%')
igual(variacion(50, 0), null, 'sin base de comparación se devuelve null')

// ── Flota y rutas ─────────────────────────────────────────────────────────────

console.log('\n── Utilización de flota ──')

const conCamiones = dataset({
  camiones: [{ id: 'c1', capacidadTon: 20 } as never],
  viajesTodos: [viaje({ id: 'v1', toneladas: 20, camionId: 'c1' })],
})
igual(utilizacionFlota(conCamiones), 100, 'un viaje que llena el camión da 100%')
igual(
  sinNaN(utilizacionFlota(dataset({ viajesTodos: [viaje()] }))),
  [],
  'un viaje cuyo camión no está en la base no divide por cero',
)

console.log('\n── Rubros y rutas ──')

const conViajes = dataset({
  viajesTodos: [
    viaje({ id: 'v1', rubroId: 'refrigerados', rutaId: 'r1' }),
    viaje({ id: 'v2', rubroId: 'refrigerados', rutaId: 'r1' }),
    viaje({ id: 'v3', rubroId: 'combustibles', rutaId: 'r2' }),
  ],
  fechaCorte: '2026-10-01T12:00:00Z',
})

const rubros = distribucionPorRubro(conViajes)
igual(rubros.length, 2, 'los dos rubros con viajes cerrados aparecen')
igual(rubros[0].rubro, 'refrigerados', 'el rubro con más toneladas va primero')
igual(rubros[0].viajes, 2, 'se cuentan los dos viajes de refrigerados')
igual(rubros[0].toneladas, 20, 'las toneladas se suman')
igual(sinNaN(rubros), [], 'los rubros no tienen NaN')

const conRubroDesconocido = dataset({ viajesTodos: [viaje({ rubroId: 'rubro_inexistente' })] })
const rubrosDesconocidos = distribucionPorRubro(conRubroDesconocido)
igual(rubrosDesconocidos[0].nombre, 'rubro_inexistente', 'un rubro que no está en el catálogo no rompe la pantalla')

const rutas = rankingRutas(conViajes)
igual(rutas.length, 2, 'las dos rutas usadas aparecen en el ranking')
igual(sinNaN(rutas), [], 'el ranking no tiene NaN')
igual(
  rutas[0].puntualidad,
  100,
  'viajes entregados a tiempo dan 100% de puntualidad',
)
igual(rutas[0].origen, 'r1', 'una ruta que no está en el catálogo se muestra con su identificador')
igual(rutas[0].destino, '—', 'su destino se deja como guion en vez de inventar un nombre')

console.log('\n── Facturación por cliente ──')

const conClientes = dataset({
  clientes: [
    { id: 'a', facturacionUltimos90d: 750, enviosUltimos90d: 3 } as never,
    { id: 'b', facturacionUltimos90d: 250, enviosUltimos90d: 1 } as never,
  ],
})
const cartera = facturacionPorCliente(conClientes)
igual(cartera[0].cliente.id, 'a', 'el cliente que más factura va primero')
igual(cartera[0].participacion, 75, 'su participación es 75%')
igual(cartera[1].participacion, 25, 'el resto suma el 25%')
igual(sinNaN(cartera), [], 'la cartera no tiene NaN')
igual(
  facturacionPorCliente(dataset({ clientes: [{ id: 'a', facturacionUltimos90d: 0 } as never] }))[0].participacion,
  0,
  'si nadie ha facturado, la participación es 0 y no NaN',
)

console.log(`\n${'─'.repeat(50)}`)
if (fallos.length === 0) {
  console.log(`TODAS LAS PRUEBAS DE CÁLCULOS PASARON (${pasadas})`)
} else {
  console.log(`${pasadas} pasaron, ${fallos.length} fallaron:`)
  for (const f of fallos) console.log(`  x ${f}`)
  process.exitCode = 1
}
