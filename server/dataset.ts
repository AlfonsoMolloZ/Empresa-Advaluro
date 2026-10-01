import type { DatabaseSync } from 'node:sqlite'
import { todas } from './db.ts'
import { aCamel } from './casillas.ts'

/**
 * Arma el dataset completo que consume el panel.
 *
 * Devuelve exactamente la misma forma que producía el generador de datos
 * simulados (`generarDataset()`), pero calculado a partir de lo que hay de
 * verdad en la base. Esa es la razón de este módulo: las ocho páginas del panel
 * no necesitan cambiar ni una línea cuando los datos pasan de inventados a
 * reales, porque reciben las mismas estructuras.
 *
 * Lo que aquí se calcula NO está guardado en ninguna tabla, y por eso nunca
 * queda desfasado:
 *
 *   - costo_combustible de un viaje
 *   - tanque_restante y el último abastecimiento de cada camión
 *   - viajes, toneladas y facturación de los últimos 90 días
 *   - la serie financiera por mes
 */

type Fila = Record<string, unknown>

/**
 * Lee un nmero de la base.
 *
 * `null` y `''` devuelven el valor por defecto, NO cero. Es lo que permite que un
 * camin sin tanque propio herede el del tipo: en JavaScript `Number(null)` es 0,
 * y sin este cuidado un campo vaco se convertira en cero en silencio y la
 * herencia nunca se aplicara.
 */
const num = (v: unknown, porDefecto = 0): number => {
  if (v === null || v === undefined || v === '') return porDefecto
  const n = Number(v)
  return Number.isFinite(n) ? n : porDefecto
}

const txt = (v: unknown, porDefecto = ''): string => (v === null || v === undefined ? porDefecto : String(v))

const bool = (v: unknown): boolean => v === 1 || v === true || v === '1'

/** Reduce un timestamp ISO a 'AAAA-MM', que es como se agrupan los meses. */
const mesDe = (iso: string): string => iso.slice(0, 7)

const ETIQUETAS_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const etiquetaMes = (mes: string): string => {
  const [anio, m] = mes.split('-')
  return `${ETIQUETAS_MES[Number(m) - 1] ?? m} ${anio}`
}

const diasDelMes = (mes: string): number => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate()

/** Fecha de hoy según la zona horaria configurada, no la del servidor. */
function hoy(): Date {
  const zona = process.env.TZ ?? 'America/Lima'
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  return new Date(`${partes}T12:00:00`)
}

export function armarDataset(db: DatabaseSync) {
  const ciudades = todas<Fila>(db, 'SELECT * FROM ciudades ORDER BY nombre').map(aCamel)
  const rubros = todas<Fila>(db, 'SELECT * FROM rubros ORDER BY nombre').map(aCamel)
  const rutasFila = todas<Fila>(db, 'SELECT * FROM rutas ORDER BY id').map(aCamel)
  const conductoresFila = todas<Fila>(db, 'SELECT * FROM conductores ORDER BY nombres').map(aCamel)
  const clientesFila = todas<Fila>(db, 'SELECT * FROM clientes ORDER BY razon_social').map(aCamel)
  const camionesFila = todas<Fila>(db, 'SELECT * FROM camiones ORDER BY placa').map(aCamel)
  const viajesFila = todas<Fila>(db, 'SELECT * FROM viajes ORDER BY salida').map(aCamel)
  const facturas = todas<Fila>(db, 'SELECT * FROM facturas ORDER BY emitida').map(aCamel)
  const mantenimientos = todas<Fila>(db, 'SELECT * FROM mantenimientos ORDER BY fecha_programada').map(aCamel)
  const incidentes = todas<Fila>(db, 'SELECT * FROM incidentes ORDER BY fecha').map(aCamel)
  const abastecimientos = todas<Fila>(db, 'SELECT * FROM abastecimientos ORDER BY fecha').map(aCamel)
  const gastos = todas<Fila>(db, 'SELECT * FROM gastos ORDER BY mes').map(aCamel)

  // Los tipos de camin se tipan una sola vez y se reutilizan. Leer claves sueltas
  // de la fila cruda en cinco sitios distintos es como se cuelan los errores de
  // maysculas: `tanque_litros` y `tanqueLitros` no son la misma clave.
  const tiposCamion = todas<Fila>(db, 'SELECT * FROM tipos_camion ORDER BY nombre').map((t) => ({
    id: txt(t.id),
    nombre: txt(t.nombre),
    chasis: txt(t.chasis),
    ejes: num(t.ejes),
    capacidadTon: num(t.capacidad_ton),
    capacidadM3: num(t.capacidad_m3),
    tanqueLitros: num(t.tanque_litros),
    consumoGal100km: num(t.consumo_gal_100km),
    activo: bool(t.activo),
  }))

  const rubroPorId = new Map(rubros.map((r) => [txt(r.id), txt(r.nombre)]))
  const tipoPorId = new Map(tiposCamion.map((t) => [t.id, t]))
  const rutaPorId = new Map(rutasFila.map((r) => [txt(r.id), r]))
  const camionPorId = new Map(camionesFila.map((c) => [txt(c.id), c]))

  // Cuando falta la referencia hay que devolver un objeto con la misma forma, no
  // `{}`: con `{}` TypeScript deja de saber qué propiedades existen y el acceso a
  // `tipo.tanqueLitros` deja de compilar.
  const TIPO_VACIO = {
    id: '', nombre: '', chasis: '', ejes: 0, capacidadTon: 0, capacidadM3: 0,
    tanqueLitros: 0, consumoGal100km: 0, activo: false,
  }

  //  Catálogos 
  const rutas = rutasFila.map((r) => ({
    id: txt(r.id),
    origenId: txt(r.origenId),
    destinoId: txt(r.destinoId),
    km: num(r.km),
    tipo: txt(r.tipo, 'transversal'),
    carroceria: txt(r.carrocerias).split(',').filter(Boolean),
    peajes: num(r.peajes),
  }))

  const catalogo = {
    ciudades: ciudades.map((c) => ({
      id: txt(c.id), nombre: txt(c.nombre), departamento: txt(c.departamento),
      zona: txt(c.zona), lat: num(c.lat), lng: num(c.lng),
    })),
    rutas,
    rubros: rubros.map((r) => ({ id: txt(r.id), nombre: txt(r.nombre) })),
    tiposCamion: tiposCamion.map((t) => ({
      id: t.id, nombre: t.nombre, chasis: t.chasis, ejes: t.ejes,
      capacidadTon: t.capacidadTon, capacidadM3: t.capacidadM3,
      tanqueLitros: t.tanqueLitros, consumoGal100km: t.consumoGal100km,
    })),
  }

  //  Ventana de 90 días para los contadores derivados 
  const fechaHoy = hoy()
  const msHoy = fechaHoy.getTime()
  const desde90 = new Date(msHoy - 90 * 86_400_000).toISOString()

  //  Conductores 
  const viajesPorConductor = agrupar(viajesFila, (v) => txt(v.conductorId))
  const incidentesPorConductor = agrupar(incidentes, (i) => txt(i.conductorId))
  const gastosPorConductor = agrupar(gastos, (g) => txt(g.conductorId))

  const conductores = conductoresFila.map((c) => {
    const id = txt(c.id)
    const suyos = viajesPorConductor.get(id) ?? []
    const recientes = suyos.filter((v) => txt(v.salida) >= desde90 && txt(v.estado) === 'entregado')
    const kilometros = recientes.reduce((a, v) => a + num(v.km), 0)

    // Días consecutivos de operación: se cuentan hacia atrás desde el último
    // viaje, sin saltarse días. Un día sin viaje rompe la cuenta.
    const diasOperados = new Set(
      suyos.filter((v) => txt(v.estado) !== 'programado').map((v) => txt(v.salida).slice(0, 10)),
    )
    let diasConsecutivos = 0
    for (let i = 0; ; i++) {
      const dia = new Date(msHoy - i * 86_400_000).toISOString().slice(0, 10)
      if (!diasOperados.has(dia)) break
      diasConsecutivos++
    }

    return {
      id,
      nombres: txt(c.nombres),
      licencia: txt(c.licencia),
      experienciaAnios: num(c.experienciaAnios),
      telefono: txt(c.telefono),
      base: txt(c.base),
      viajesCompletados: suyos.filter((v) => txt(v.estado) === 'entregado').length,
      diasConsecutivos: txt(c.estado) === 'activo' ? diasConsecutivos : 0,
      horasSemana: Math.round((kilometros / 45 / 13) * 10) / 10,
      puntaje: num(c.puntaje, 100),
      estado: txt(c.estado, 'activo'),
      viajesUltimos90d: recientes.length,
      incidentes: (incidentesPorConductor.get(id) ?? []).length,
      severityAlta: (incidentesPorConductor.get(id) ?? []).filter((i) => txt(i.severidad) === 'alta').length,
      gastosRegistrados: (gastosPorConductor.get(id) ?? []).reduce((a, g) => a + num(g.monto), 0),
      activo: bool(c.activo),
    }
  })

  //  Clientes 
  const viajesPorCliente = agrupar(viajesFila, (v) => txt(v.clienteId))
  const facturasPorCliente = agrupar(facturas, (f) => txt(f.clienteId))

  const clientes = clientesFila.map((c) => {
    const id = txt(c.id)
    const suyos = (viajesPorCliente.get(id) ?? []).filter((v) => txt(v.salida) >= desde90)
    const susFacturas = (facturasPorCliente.get(id) ?? []).filter((f) => txt(f.emitida) >= desde90)
    const pagadas = susFacturas.filter((f) => txt(f.estado) === 'pagada')

    // Días medios de pago: días entre emitir y pagar, solo de las que se pagaron.
    const dias = pagadas.map((f) =>
      Math.max(0, Math.round((Date.parse(txt(f.vencimiento)) - Date.parse(txt(f.emitida))) / 86_400_000)),
    )

    return {
      id,
      razonSocial: txt(c.razonSocial),
      rubro: rubroPorId.get(txt(c.rubroId)) ?? 'carga_general',
      ruc: txt(c.ruc),
      contacto: txt(c.contacto),
      telefono: txt(c.telefono),
      ciudadId: txt(c.ciudadId),
      tarifaPorKm: num(c.tarifaPorKm),
      enviosUltimos90d: suyos.length,
      facturacionUltimos90d: susFacturas.reduce((a, f) => a + num(f.monto), 0),
      facturadoUltimos90d: susFacturas.reduce((a, f) => a + num(f.monto), 0),
      pendiente: susFacturas.filter((f) => txt(f.estado) !== 'pagada').reduce((a, f) => a + num(f.monto), 0),
      satisfaccion: num(c.satisfaccion, 0),
      diasPromedioPago: dias.length ? Math.round(dias.reduce((a, b) => a + b, 0) / dias.length) : 0,
      plazoPagoDias: num(c.plazoPagoDias, 30),
      activo: bool(c.activo),
    }
  })

  // --- Camiones ---
  // El nivel del tanque se calcula a partir del ?ltimo abastecimiento y de los
  // kil?metros recorridos desde entonces. No se escribe en ninguna parte.
  // El nivel de tanque se calcula, no se escribe: es la única forma de que no
  // se desincronice del resto de los datos.
  const viajesPorCamion = agrupar(viajesFila, (v) => txt(v.camionId))
  const abastPorCamion = agrupar(abastecimientos, (a) => txt(a.camionId))
  const mantPorCamion = agrupar(mantenimientos, (m) => txt(m.camionId))

  const camiones = camionesFila.map((c) => {
    const id = txt(c.id)
    const tipo = tipoPorId.get(txt(c.tipoId)) ?? TIPO_VACIO
    const tanque = num(c.tanqueLitros, num(tipo.tanqueLitros, 0))
    const consumo = num(c.consumoGal100km, num(tipo.consumoGal100km, 0))

    const suyos = (viajesPorCamion.get(id) ?? []).filter((v) => txt(v.salida) >= desde90)
    const ultimaCarga = (abastPorCamion.get(id) ?? []).at(-1)
    const consumos = (abastPorCamion.get(id) ?? []).map((a) => ({
      fecha: txt(a.fecha),
      km: num(a.km, 0),
      galones: num(a.galones),
    }))

    // Consumo real medido: desde la primera carga con odómetro anotado hasta la
    // última. Solo se calcula si hay dos puntos, porque con uno no hay distancia.
    const conKm = consumos.filter((x) => x.km > 0)
    const consumoMedido =
      conKm.length >= 2
        ? ((conKm.at(-1)!.galones - conKm[0].galones) / (conKm.at(-1)!.km - conKm[0].km)) * 100
        : null

    /*
     * Nivel del tanque.
     *
     *   tanque_restante = tanque - galones consumidos desde la última carga
     *   galones consumidos = km recorridos desde entonces x consumo / 100
     *
     * Sin los kilómetros de los viajes no hay forma de saberlo, así que cuando
     * falta el dato se devuelve null en vez de un número inventado. Un `0`
     * Mentiroso en la columna de combustible haría pensar que el camión está
     * vacío cuando en realidad nadie lo ha medido.
     */
    const cargas = abastPorCamion.get(id) ?? []
    const ultimaFecha = cargas.at(-1) ? txt(cargas.at(-1)!.fecha) : null
    const kmDesdeLaCarga = ultimaFecha
      ? (viajesPorCamion.get(id) ?? [])
          .filter((v) => txt(v.salida).slice(0, 10) >= ultimaFecha.slice(0, 10))
          .reduce((a, v) => a + num(v.km), 0)
      : null

    const tieneLoNecesarioParaCalcular =
      tanque > 0 && consumo > 0 && ultimaFecha !== null && kmDesdeLaCarga !== null

    const tanqueRestante = tieneLoNecesarioParaCalcular
      ? Math.max(0, Math.round((tanque - (kmDesdeLaCarga * consumo) / 100) * 10) / 10)
      : null

    return {
      id,
      placa: txt(c.placa),
      modelo: txt(c.modelo),
      anio: num(c.anio),
      tipo: txt(c.tipoCarroceria, 'plataforma'),
      tipoCamionId: txt(c.tipoId),
      tipoCamion: txt(tipo.nombre),
      capacidadTon: num(c.capacidadTon, num(tipo.capacidadTon, 0)),
      estado: txt(c.estado, 'disponible'),
      conductorId: txt(c.conductorId) || null,
      kmTotal: num(c.kmTotal),
      kmUltimoServicio: num(c.kmUltimoServicio),
      proximoServicioKm: num(c.proximoServicioKm),
      taller: txt(c.taller),
      fechaIngreso: txt(c.fechaIngreso),
      viajesUltimos90d: suyos.length,
      tonneajeTransportado: suyos.reduce((a, v) => a + num(v.toneladas), 0),
      // Combustible
      tanqueLitros: tanque,
      consumoGal100km: consumo,
      tanqueRestante,
      tanqueRestanteEsEstimado: true,
      kmDesdeUltimoAbastecimiento: kmDesdeLaCarga,
      diasDesdeUltimoAbastecimiento: ultimaFecha
        ? Math.max(
            0,
            Math.round(
              (msHoy - Date.parse(`${ultimaFecha.slice(0, 10)}T12:00:00`)) / 86_400_000,
            ),
          )
        : null,
      ultimoAbastecimiento: ultimaCarga ? txt(ultimaCarga.fecha) : null,
      galonesUltimoMes: (abastPorCamion.get(id) ?? [])
        .filter((a) => mesDe(txt(a.fecha)) === mesDe(hoy().toISOString()))
        .reduce((a, x) => a + num(x.galones), 0),
      costoCombustibleMes: (abastPorCamion.get(id) ?? [])
        .filter((a) => mesDe(txt(a.fecha)) === mesDe(hoy().toISOString()))
        .reduce((a, x) => a + num(x.costoTotal), 0),
      consumoMedidoGal100km: consumoMedido === null ? null : Math.round(consumoMedido * 10) / 10,
      mantenimientosPendientes: (mantPorCamion.get(id) ?? []).filter(
        (m) => txt(m.estado) !== 'completado',
      ).length,
      kmParaServicio: Math.max(0, num(c.kmTotal) - num(c.kmUltimoServicio)),
      activo: bool(c.activo),
    }
  })

  //  Viajes 
  // El costo de combustible sale del precio que se está pagando de verdad: el
  // promedio de las últimas cargas registradas. Si todavía no hay ninguna, se usa
  // el precio de referencia, y el viaje se marca como estimado.
  const PRECIO_REFERENCIA = 17.9
  const ultimasCargas = [...abastecimientos]
    .sort((a, b) => txt(a.fecha).localeCompare(txt(b.fecha)))
    .slice(-20)
  const precioReal = ultimasCargas.length
    ? ultimasCargas.reduce((a, x) => a + num(x.precioGalon), 0) / ultimasCargas.length
    : PRECIO_REFERENCIA

  const viajes: Record<string, unknown>[] = viajesFila.map((v) => {
    const camion = camionPorId.get(txt(v.camionId)) ?? {}
    const tipo = tipoPorId.get(txt(camion.tipoId)) ?? TIPO_VACIO
    const consumo = num(camion.consumoGal100km, num(tipo.consumoGal100km, 0))
    const km = num(v.km)

    return {
      ...v,
      km,
      toneladas: num(v.toneladas),
      flete: num(v.flete),
      clienteId: txt(v.clienteId) || null,
      // Si la unidad no tiene consumo conocido, no se inventa un costo.
      costoCombustible: consumo > 0 ? Math.round((km * consumo) / 100 * precioReal) : 0,
      costoCombustibleEstimado: !(km > 0 && consumo > 0) || ultimasCargas.length === 0,
      precioGalonUsado: Math.round(precioReal * 100) / 100,
      placa: txt(camion.placa),
      nombreConductor: txt(conductoresFila.find((c) => txt(c.id) === txt(v.conductorId))?.nombres),
      origenId: txt(rutaPorId.get(txt(v.rutaId))?.origenId),
      destinoId: txt(rutaPorId.get(txt(v.rutaId))?.destinoId),
    }
  })

  const ahora = hoy().toISOString()
  const viajesHistoricos = viajes.filter((v) => txt(v.estado) === 'entregado' && txt(v.salida) < ahora)
  const viajesActivos = viajes.filter((v) => ['en_curso', 'programado', 'retrasado'].includes(txt(v.estado)))

  //  Serie financiera: se arma desde viajes, abastecimientos, gastos y
  //    mantenimientos. Los tres últimos salen de lo que la persona registró.
  const finanzasMensuales = armarFinanzas(viajes, abastecimientos, gastos, mantenimientos)
  return {
    fechaCorte: ahora,
    camiones,
    conductores,
    clientes,
    viajes: viajesActivos,
    viajesHistoricos,
    viajesTodos: viajes,
    facturas,
    mantenimientos,
    incidentes,
    abastecimientos,
    gastos,
    finanzasMensuales,
    catalogo,
  }
}

//  Agregados 

function agrupar<T>(filas: T[], clave: (f: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const fila of filas) {
    const k = clave(fila)
    if (!k) continue
    const lista = mapa.get(k)
    if (lista) lista.push(fila)
    else mapa.set(k, [fila])
  }
  return mapa
}

function armarFinanzas(
  viajes: Record<string, unknown>[],
  abastecimientos: Record<string, unknown>[],
  gastos: Record<string, unknown>[],
  mantenimientos: Record<string, unknown>[],
) {
  const referencia = hoy()
  const mesActual = mesDe(referencia.toISOString())
  const diasTranscurridos = referencia.getDate()
  const total = diasDelMes(mesActual)

  // Doce meses hacia atrás: suficiente para un panel anual sin cargar de más.
  const meses: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(referencia.getFullYear(), referencia.getMonth() - i, 1)
    meses.push(mesDe(d.toISOString()))
  }

  return meses.map((mes) => {
    const delMes = viajes.filter((v) => mesDe(txt(v.salida)) === mes && txt(v.estado) === 'entregado')
    const ingresos = delMes.reduce((a, v) => a + num(v.flete), 0)

    const costoCombustible = abastecimientos
      .filter((a) => mesDe(txt(a.fecha)) === mes)
      .reduce((a, x) => a + num(x.costoTotal), 0)

    const costoMantenimiento = mantenimientos
      .filter((m) => mesDe(txt(m.fechaProgramada)) === mes)
      .reduce((a, m) => a + num(m.costoEstimado), 0)

    const delMesGastos = gastos.filter((g) => txt(g.mes) === mes)
    const porCategoria = (cat: string) =>
      delMesGastos.filter((g) => txt(g.categoria) === cat).reduce((a, g) => a + num(g.monto), 0)

    const planilla = porCategoria('planilla')
    const permisos = porCategoria('permisos') + porCategoria('alquiler') + porCategoria('seguro')
    const administrativo =
      porCategoria('administrativo') + porCategoria('impuestos') + porCategoria('otro')

    const peajes = delMes.reduce((a, v) => a + num(v.costoPeaje), 0)
    const otros = delMes.reduce((a, v) => a + num(v.costoOtros) + num(v.costoMantenimiento), 0)

    const costos = { combustible: costoCombustible, mantenimiento: costoMantenimiento, planilla, peajes, permisos, gastosViaje: otros, administrativo }
    const totalCostos = Object.values(costos).reduce((a, b) => a + b, 0)

    return {
      mes,
      etiqueta: etiquetaMes(mes),
      ingresos,
      costos,
      totalCostos,
      utilidad: ingresos - totalCostos,
      viajes: delMes.length,
      toneladas: delMes.reduce((a, v) => a + num(v.toneladas), 0),
      diasTranscurridos: mes === mesActual ? diasTranscurridos : total,
      diasDelMes: total,
      mesEnCurso: mes === mesActual,
    }
  })
}

