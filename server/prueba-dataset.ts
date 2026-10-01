/**
 * Contrato de `GET /api/dataset`.
 *
 * Los tipos de `src/data/dataset.ts` no se verifican solos: son una promesa de
 * que el servidor manda eso. Si mañana `armarDataset()` deja de enviar una
 * columna, o le cambia el nombre, o devuelve `null` donde se declaró `string`,
 * el panel no se queja: pinta `undefined` y se ve raro. Nada de eso rompe la
 * compilación, porque el tipo lo declara el frontend y el servidor no lo
 * comprueba. Esta prueba es la que cierra ese hueco, y es la razón de existir de
 * la nota que hay al principio de `dataset.ts`.
 *
 * Se hace en dos momentos, porque con la base vacía casi nada se puede
 * comprobar: los listados vienen vacíos y los campos derivados valen cero. Al
 * final se siembran unas pocas filas y se vuelve a pedir el dataset para
 * verificar los valores derivados de verdad.
 *
 * Uso: node --import ./server/carga-extension-ts.mjs server/prueba-dataset.ts
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const carpeta = mkdtempSync(join(tmpdir(), 'advaluro-dataset-'))
process.env.DATABASE_URL = `archivo:${join(carpeta, 'prueba.db')}`
process.env.API_PORT = '8801'

const { servidor } = await import('./index.ts')
const { abrirBase, cerrarBase } = await import('./db.ts')
const { DATASET_VACIO, sinDatos } = await import('../src/data/dataset.ts')

let pasadas = 0
const fallos: string[] = []

function comprobar(condicion: boolean, descripcion: string, extra?: unknown) {
  if (condicion) {
    pasadas++
    console.log(`  ok   ${descripcion}`)
  } else {
    fallos.push(descripcion + (extra === undefined ? '' : ` → ${JSON.stringify(extra)}`))
    console.log(`  FALLA ${descripcion}${extra !== undefined ? ` → ${JSON.stringify(extra)}` : ''}`)
  }
}

let cookie = ''

async function pedir(ruta: string, metodo = 'GET', cuerpo?: unknown): Promise<{ estado: number; datos: any }> {
  const res = await fetch(`http://localhost:8801${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  })
  const texto = await res.text()
  const cabecera = res.headers.get('set-cookie')
  if (cabecera) cookie = cabecera.split(';')[0]
  return { estado: res.status, datos: texto ? JSON.parse(texto) : null }
}

/** Cualquier `NaN` en la respuesta se serializa a `null`, así que se busca en texto. */
function numerosRotos(valor: unknown, ruta = 'dataset'): string[] {
  const malos: string[] = []
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) malos.push(`${ruta} = ${valor}`)
  } else if (Array.isArray(valor)) {
    valor.forEach((v, i) => malos.push(...numerosRotos(v, `${ruta}[${i}]`)))
  } else if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) malos.push(...numerosRotos(v, `${ruta}.${k}`))
  }
  return malos
}

/** Comprueba que un objeto tenga estas claves con el tipo indicado. */
function conClaves(objeto: unknown, esperadas: Record<string, string>, donde: string) {
  if (typeof objeto !== 'object' || objeto === null) {
    comprobar(false, `${donde} es un objeto`)
    return
  }
  const o = objeto as Record<string, unknown>
  for (const [clave, tipo] of Object.entries(esperadas)) {
    if (!(clave in o)) {
      comprobar(false, `${donde} incluye ${clave}`)
      continue
    }
    const valor = o[clave]
    const bien = tipo === 'numero' ? typeof valor === 'number' && Number.isFinite(valor) : typeof valor === tipo
    comprobar(bien, bien ? `${donde}.${clave} es ${tipo}` : `${donde}.${clave} es ${tipo}, llegó ${JSON.stringify(valor)}`)
  }
}

servidor.listen(8801)
const db = abrirBase()

try {
  const { asegurarAdminInicial } = await import('./auth.ts')
  asegurarAdminInicial(db, 'admin@advaluro.pe', 'clave-larga-123', 'Ana Pérez')
  const entrada = await pedir('/api/auth/entrar', 'POST', {
    email: 'admin@advaluro.pe',
    contrasena: 'clave-larga-123',
  })
  comprobar(entrada.estado === 200, 'se inicia sesión para poder leer el dataset', entrada.datos)

  // ── 1. Con la base vacía ────────────────────────────────────────────────────

  console.log('\n── Con la base recién creada ──')

  const vacio = await pedir('/api/dataset')
  comprobar(vacio.estado === 200, 'el dataset se puede pedir sin sesión cerrada', vacio.estado)
  comprobar(sinDatos(vacio.datos), 'el frontend lo reconoce como base sin datos')

  // Se comparan las claves en los dos sentidos. Solo en un sentido el test
  // pasaría igual de contento con un campo que el servidor envía y el panel
  // ignora, que es otra forma de que los datos no lleguen a verse.
  const delServidor = Object.keys(vacio.datos).sort()
  const declaradas = Object.keys(DATASET_VACIO).sort()
  const soloServidor = delServidor.filter((k) => !declaradas.includes(k))
  const soloFrontend = declaradas.filter((k) => !delServidor.includes(k))
  comprobar(soloServidor.length === 0, 'el servidor no manda claves que el panel no declara', soloServidor)
  comprobar(soloFrontend.length === 0, 'el panel no espera claves que el servidor no manda', soloFrontend)

  for (const [clave, valor] of Object.entries(DATASET_VACIO)) {
    if (Array.isArray(valor)) {
      comprobar(Array.isArray(vacio.datos[clave]), `${clave} es una lista aunque esté vacía`)
    }
  }
  comprobar(typeof vacio.datos.fechaCorte === 'string', 'fechaCorte es texto')
  comprobar(
    !Number.isNaN(new Date(vacio.datos.fechaCorte).getTime()),
    'fechaCorte es una fecha que se puede interpretar',
    vacio.datos.fechaCorte,
  )
  comprobar(numerosRotos(vacio.datos).length === 0, 'no hay NaN en la respuesta vacía', numerosRotos(vacio.datos))
  comprobar(Array.isArray(vacio.datos.finanzasMensuales), 'la serie financiera existe aunque sea una lista vacía')

  conClaves(
    vacio.datos.catalogo,
    { ciudades: 'object', rutas: 'object', rubros: 'object', tiposCamion: 'object' },
    'catalogo',
  )
  comprobar(Array.isArray(vacio.datos.catalogo?.ciudades), 'catalogo.ciudades es una lista')
  // Con la base recién creada el catálogo viene vacío, porque el servidor lo lee
  // de la base y no de la geografía estática del frontend. Por eso el panel no
  // puede depender de él para abrirse: mientras la semilla no cargue ciudades y
  // rutas, las pantallas usan `src/data/geografia.ts` y este catálogo solo
  // informará. Llename de cities de más en el server y esta expectativa cambia a
  // `> 0`.
  comprobar(
    vacio.datos.catalogo?.ciudades?.length === 0,
    'sin ciudades en la base, el catálogo llega vacío en vez de inventadas',
    vacio.datos.catalogo?.ciudades?.length,
  )

  // ── 2. Con datos sembrados ──────────────────────────────────────────────────

  console.log('\n── Con unos pocos datos reales ──')

  // Las fechas se calculan desde hoy a propósito: el dataset compara contra
  // ventanas de 90 días, así que una fecha escrita a mano empezaría a fallar
  // sola dentro de tres meses.
  const hoy = new Date()
  const dias = (n: number) => new Date(hoy.getTime() - n * 86_400_000).toISOString()
  const mesActual = hoy.toISOString().slice(0, 7)

  db.prepare("INSERT INTO ciudades (id,nombre,departamento,zona,lat,lng) VALUES ('lima','Lima','Lima','costa',-12.05,-77.04)").run()
  db.prepare("INSERT INTO ciudades (id,nombre,departamento,zona,lat,lng) VALUES ('trujillo','Trujillo','La Libertad','costa',-8.11,-79.03)").run()
  db.prepare("INSERT INTO rubros (id,nombre) VALUES ('general','Carga general')").run()
  db.prepare(
    "INSERT INTO rutas (id,origen_id,destino_id,km,tipo,carrocerias,peajes) VALUES ('lima-trujillo','lima','trujillo',560,'panamericana_norte','plataforma,refrigerado',2)",
  ).run()
  db.prepare(
    "INSERT INTO tipos_camion (id,nombre,chasis,ejes,capacidad_ton,capacidad_m3,tanque_litros,consumo_gal_100km) VALUES ('t1','Tractor 6x2','ch1',6,30,90,600,9)",
  ).run()
  db.prepare(
    "INSERT INTO conductores (id,nombres,licencia,experiencia_anios,telefono,base,puntaje,estado) VALUES ('co1','Luis Quispe','Q12345678',8,'999000111','Trujillo',96,'activo')",
  ).run()
  db.prepare(
    "INSERT INTO clientes (id,razon_social,ruc,rubro_id,contacto,telefono,ciudad_id,tarifa_por_km,plazo_pago_dias,satisfaccion) VALUES ('cl1','Comercial Andina S.A.','20512345678','general','Rosa Paz','999222333','lima',12.5,30,88)",
  ).run()
  db.prepare(
    "INSERT INTO camiones (id,placa,modelo,anio,tipo_id,tipo_carroceria,capacidad_ton,estado,conductor_id,km_total) VALUES ('cam1','ABC-123','Volvo FH',2021,'t1','refrigerado',28,'en_ruta','co1',150000)",
  ).run()
  db.prepare(
    "INSERT INTO viajes (id,referencia,camion_id,conductor_id,cliente_id,ruta_id,rubro_id,estado,salida,llegada_programada,llegada_real,km,toneladas,flete,costo_peaje,costo_mantenimiento,costo_otros) VALUES ('v1','AD-1001','cam1','co1','cl1','lima-trujillo','general','entregado',?1,?2,?3,560,24,7000,300,200,100)",
  ).run(dias(6), dias(4), dias(4))
  db.prepare(
    "INSERT INTO facturas (id,numero,cliente_id,viaje_id,emitida,vencimiento,monto,estado) VALUES ('f1','F001','cl1','v1',?1,?2,7000,'pendiente')",
  ).run(dias(5), dias(-25))
  db.prepare(
    "INSERT INTO gastos (id,mes,categoria,concepto,monto) VALUES ('g1',?1,'planilla','Planilla del mes',1800)",
  ).run(mesActual)

  const lleno = await pedir('/api/dataset')
  comprobar(lleno.estado === 200, 'el dataset se puede pedir con datos', lleno.estado)
  comprobar(!sinDatos(lleno.datos), 'con datos sembrados ya no se considera base vacía')
  comprobar(numerosRotos(lleno.datos).length === 0, 'no hay NaN en la respuesta con datos', numerosRotos(lleno.datos))
  comprobar(
    lleno.datos.catalogo?.ciudades?.length === 2 && lleno.datos.catalogo?.rutas?.length === 1,
    'el catálogo refleja lo que hay en la base',
    { ciudades: lleno.datos.catalogo?.ciudades?.length, rutas: lleno.datos.catalogo?.rutas?.length },
  )

  console.log('\n── Entidades que vuelven del servidor ──')

  conClaves(
    lleno.datos.camiones[0],
    {
      id: 'string', placa: 'string', tipo: 'string', capacidadTon: 'numero', kmTotal: 'numero',
      viajesUltimos90d: 'numero', tonneajeTransportado: 'numero', tanqueRestante: 'object',
      consumoMedidoGal100km: 'object', ultimoAbastecimiento: 'object', mantenimientosPendientes: 'numero',
    },
    'camion',
  )
  comprobar(
    lleno.datos.camiones[0].viajesUltimos90d === 1,
    'el camión cuenta el viaje de hace una semana',
    lleno.datos.camiones[0].viajesUltimos90d,
  )
  comprobar(
    lleno.datos.camiones[0].tanqueRestante === null,
    'sin abastecimientos, el tanque restante es null y no un cero inventado',
    lleno.datos.camiones[0].tanqueRestante,
  )

  conClaves(
    lleno.datos.conductores[0],
    {
      id: 'string', nombres: 'string', viajesCompletados: 'numero', diasConsecutivos: 'numero',
      horasSemana: 'numero', viajesUltimos90d: 'numero', incidentes: 'numero', puntaje: 'numero',
    },
    'conductor',
  )
  comprobar(
    lleno.datos.conductores[0].viajesCompletados === 1,
    'el conductor cuenta el viaje completado',
    lleno.datos.conductores[0].viajesCompletados,
  )

  conClaves(
    lleno.datos.clientes[0],
    {
      id: 'string', razonSocial: 'string', ruc: 'string', enviosUltimos90d: 'numero',
      facturacionUltimos90d: 'numero', pendiente: 'numero', diasPromedioPago: 'numero',
    },
    'cliente',
  )
  comprobar(
    lleno.datos.clientes[0].facturacionUltimos90d === 7000,
    'la facturación del cliente sale de sus facturas',
    lleno.datos.clientes[0].facturacionUltimos90d,
  )

  conClaves(
    lleno.datos.viajesTodos[0],
    {
      id: 'string', referencia: 'string', estado: 'string', salida: 'string',
      llegadaProgramada: 'string', km: 'numero', toneladas: 'numero', flete: 'numero',
      costoCombustible: 'numero', placa: 'string', nombreConductor: 'string',
      origenId: 'string', destinoId: 'string', temperaturaC: 'object',
    },
    'viaje',
  )
  comprobar(
    lleno.datos.viajesTodos[0].costoCombustible > 0,
    'el costo de combustible lo calcula el servidor',
    lleno.datos.viajesTodos[0].costoCombustible,
  )
  comprobar(
    lleno.datos.viajesTodos[0].placa === 'ABC-123',
    'el viaje trae la placa para no tener que buscarla en otra lista',
  )
  comprobar(
    lleno.datos.viajesTodos[0].origenId === 'lima' && lleno.datos.viajesTodos[0].destinoId === 'trujillo',
    'el viaje trae origen y destino ya resueltos a ciudades',
  )

  conClaves(lleno.datos.facturas[0], { id: 'string', numero: 'string', monto: 'numero', estado: 'string' }, 'factura')
  comprobar(lleno.datos.gastos[0].monto === 1800, 'el gasto vuelve con su monto', lleno.datos.gastos[0].monto)
  comprobar(lleno.datos.gastos[0].mes === mesActual, 'el gasto conserva su mes', lleno.datos.gastos[0].mes)

  console.log('\n── Coherencia entre listas ──')

  const idsTodos = new Set(lleno.datos.viajesTodos.map((v: { id: string }) => v.id))
  comprobar(lleno.datos.viajes.every((v: { id: string }) => idsTodos.has(v.id)), 'los viajes activos están entre todos los viajes')
  comprobar(
    lleno.datos.viajesTodos.length >= lleno.datos.viajesHistoricos.length,
    'el histórico no puede ser más largo que el total',
  )
  comprobar(lleno.datos.facturas[0].clienteId === 'cl1', 'la factura apunta a su cliente')

  console.log('\n── Serie financiera ──')

  const meses = lleno.datos.finanzasMensuales
  comprobar(Array.isArray(meses) && meses.length > 0, 'con un viaje facturado hay al menos un mes', meses?.length)
  if (Array.isArray(meses) && meses.length > 0) {
    const m = meses.at(-1)
    conClaves(
      m,
      {
        mes: 'string', etiqueta: 'string', ingresos: 'numero', totalCostos: 'numero',
        utilidad: 'numero', viajes: 'numero', diasTranscurridos: 'numero', diasDelMes: 'numero',
        mesEnCurso: 'boolean',
      },
      'mesFinanciero',
    )
    const sumaCostos = Object.values(m.costos as Record<string, number>).reduce((a, b) => a + b, 0)
    comprobar(
      Math.abs(sumaCostos - m.totalCostos) < 0.01,
      'el total de costos es la suma de sus conceptos',
      { sumaCostos, totalCostos: m.totalCostos },
    )
    comprobar(
      Math.abs(m.ingresos - m.totalCostos - m.utilidad) < 0.01,
      'la utilidad es ingresos menos costos',
      { ingresos: m.ingresos, totalCostos: m.totalCostos, utilidad: m.utilidad },
    )
    comprobar(m.diasTranscurridos > 0 && m.diasTranscurridos <= m.diasDelMes, 'los días transcurridos no superan los del mes', m)
    comprobar(mesActual.endsWith(m.mes.slice(5)) || m.mes === mesActual, 'el último mes es el mes en curso', m.mes)
  }

  console.log('\n── Privacidad ──')

  const texto = JSON.stringify(lleno.datos)
  comprobar(!texto.includes('password_hash'), 'el dataset no filtra hashes de contraseña')
  comprobar(!texto.includes('clave-larga-123'), 'el dataset no filtra contraseñas')
} catch (error) {
  fallos.push(`excepción inesperada: ${(error as Error).message}`)
  console.log(`\n  EXCEPCIÓN: ${(error as Error).stack}`)
} finally {
  servidor.close()
  cerrarBase()
  try {
    rmSync(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    console.log(`(no se pudo borrar la carpeta temporal ${carpeta}; bórrala a mano)`)
  }
}

console.log(`\n${'─'.repeat(50)}`)
if (fallos.length === 0) {
  console.log(`EL CONTRATO DEL DATASET SE CUMPLE (${pasadas})`)
} else {
  console.log(`${pasadas} pasaron, ${fallos.length} fallaron:\n`)
  for (const f of fallos) console.log(`  x ${f}`)
  process.exitCode = 1
}
