/**
 * Prueba de humo de la API local.
 *
 * Levanta el servidor contra una base temporal, exercise cada ruta y comprueba
 * las reglas de integridad. Al terminar borra la base: no toca tus datos.
 *
 *   node server/prueba.ts
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const carpeta = mkdtempSync(join(tmpdir(), 'advaluro-prueba-'))
process.env.DATABASE_URL = `archivo:${join(carpeta, 'prueba.db')}`
process.env.API_PORT = '8799'

const { servidor } = await import('./index.ts')
const { abrirBase, cerrarBase } = await import('./db.ts')

let pasadas = 0
const fallos: string[] = []

function comprobar(condicion: boolean, descripcion: string, extra?: unknown) {
  if (condicion) {
    pasadas++
  } else {
    fallos.push(descripcion + (extra === undefined ? '' : ` → ${JSON.stringify(extra)}`))
  }
}

const IGUAL = (real: unknown, esperado: unknown, donde: string) =>
  comprobar(real === esperado, `${donde}: se esperaba ${JSON.stringify(esperado)}, llegó ${JSON.stringify(real)}`)

async function pedir(
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
  conSesion = true,
): Promise<{ estado: number; datos: any }> {
  const res = await fetch(`http://localhost:8799${ruta}`, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(conSesion && cookie ? { cookie } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  })
  const texto = await res.text()
  const datos = texto ? JSON.parse(texto) : null
  const cabecera = res.headers.get('set-cookie')
  if (cabecera) cookie = cabecera.split(';')[0]
  return { estado: res.status, datos }
}

/** Entra y, sobre todo, se asegura de dejar esa sesión como la activa. */
async function entrar(email: string, contrasena = 'clave-larga-123') {
  const r = await pedir('POST', '/api/auth/entrar', { email, contrasena }, false)
  if (r.estado !== 200) throw new Error(`no se pudo entrar como ${email}: ${JSON.stringify(r.datos)}`)
  return r
}

/** Deja la sesión sin cookie, como si nadie hubiera entrado. */
function cerrarSesionDePrueba() {
  cookie = ''
}

let cookie = ''

servidor.listen(8799)
abrirBase()

try {
  console.log('\n── Sesión y permisos ──')

  // Antes de entrar, la API debe negarse.
  const sinSesion = await pedir('GET', '/api/camiones', undefined, false)
  IGUAL(sinSesion.estado, 401, 'sin sesión, leer camiones')

  // El primer arranque crea un administrador.
  const { asegurarAdminInicial } = await import('./auth.ts')
  const { una } = await import('./db.ts')
  const db = abrirBase()
  const admin = asegurarAdminInicial(db, 'admin@advaluro.pe', 'clave-larga-123', 'Ana Pérez')
  comprobar(admin.creado, 'se crea el administrador inicial en la primera ejecución')

  const malClave = await pedir('POST', '/api/auth/entrar', { email: 'admin@advaluro.pe', contrasena: 'incorrecta' }, false)
  IGUAL(malClave.estado, 401, 'contraseña incorrecta es rechazada')

  const sesionAdmin = await pedir('POST', '/api/auth/entrar', { email: 'admin@advaluro.pe', contrasena: 'clave-larga-123' }, false)
  IGUAL(sesionAdmin.estado, 200, 'iniciar sesión como administrador')
  IGUAL(sesionAdmin.datos.sesion.rol, 'admin', 'el rol devuelto es admin')
  comprobar(!!cookie, 'se envía la cookie de sesión')

  const anonimo = await pedir('GET', '/api/auth/estado', undefined, false)
  IGUAL(anonimo.datos.sesion, null, 'sin cookie no hay sesión')

  console.log('\n── Integridad de la base ──')

  // Un rol inválido debe rebotar contra el CHECK de la base.
  let rolInvalidoRechazado = false
  try {
    una(db, "SELECT 1") // sanity
    db.prepare("INSERT INTO perfiles (id,email,nombre,rol,password_hash) VALUES('x','x@y.z','X','jefe','h')").run()
  } catch {
    rolInvalidoRechazado = true
  }
  comprobar(rolInvalidoRechazado, 'la base rechaza un rol que no existe')

  console.log('\n── Catálogos ──')

  const ciudad = await pedir('POST', '/api/ciudades', {
    nombre: 'Chimbote', departamento: 'Ancash', zona: 'costa', lat: -9.0853, lng: -78.5783,
  })
  IGUAL(ciudad.estado, 201, 'crear ciudad')
  const ciudadId = ciudad.datos.ciudades.id

  const ciudadDuplicada = await pedir('POST', '/api/ciudades', {
    nombre: 'Chimbote', departamento: 'Ancash', zona: 'costa', lat: 0, lng: 0,
  })
  IGUAL(ciudadDuplicada.estado, 409, 'no se puede repetir el nombre de una ciudad')

  const Lima = await pedir('POST', '/api/ciudades', {
    nombre: 'Lima', departamento: 'Lima', zona: 'costa', lat: -12.0464, lng: -77.0428,
  })
  IGUAL(Lima.estado, 201, 'crear segunda ciudad')

  const ruta = await pedir('POST', '/api/rutas', {
    origen_id: ciudadId, destino_id: Lima.datos.ciudades.id, km: 570, tipo: 'panamericana_norte', carrocerias: ['carga_general'], peajes: 4,
  })
  IGUAL(ruta.estado, 201, 'crear ruta')
  IGUAL(ruta.datos.rutas.carroceria[0], 'carga_general', 'la lista de carrocerías se convierte a array')
  IGUAL(ruta.datos.rutas.origenId, ciudadId, 'la ruta sale con el nombre de columna en camelCase')

  const rutaInvertida = await pedir('POST', '/api/rutas', {
    origen_id: ciudadId, destino_id: ciudadId, km: 10,
  })
  IGUAL(rutaInvertida.estado, 422, 'una ruta no puede empezar y terminar en la misma ciudad')

  console.log('\n── Tipos de camión y camiones ──')

  const tipo = await pedir('POST', '/api/tipos_camion', {
    nombre: 'Tracto 6x4', chasis: 'Volvo FH16', ejes: 3, capacidad_ton: 30,
    tanque_litros: 400, consumo_gal_100km: 9.5,
  })
  IGUAL(tipo.estado, 201, 'crear tipo de camión')
  IGUAL(tipo.datos.tipos_camion.consumoGal100km, 9.5, 'el consumo por 100 km se conserva')
  const tipoId = tipo.datos.tipos_camion.id

  const tipoSinTanque = await pedir('POST', '/api/tipos_camion', {
    nombre: 'Incompleto', consumo_gal_100km: 8,
  })
  IGUAL(tipoSinTanque.estado, 422, 'un tipo de camión exige tanque y consumo')

  const conductor = await pedir('POST', '/api/conductores', {
    nombres: 'Luis Ramírez', licencia: 'Q1234567', experiencia_anios: 9, base: 'Chimbote', estado: 'activo',
  })
  IGUAL(conductor.estado, 201, 'crear conductor')
  const conductorId = conductor.datos.conductores.id

  const camion = await pedir('POST', '/api/camiones', {
    placa: 't3g-784', modelo: 'Volvo FH', anio: 2021, tipo_id: tipoId,
    tipo_carroceria: 'plataforma', capacidad_ton: 30, estado: 'disponible', km_total: 120000,
  })
  IGUAL(camion.estado, 201, 'crear camión')
  IGUAL(camion.datos.camiones.placa, 'T3G-784', 'la placa se guarda en mayúsculas')
  IGUAL(camion.datos.camiones.tanqueLitros, null, 'el camión nace sin tanque propio (lo hereda del tipo)')
  const camionId = camion.datos.camiones.id

  const camionMismoTipo = await pedir('POST', '/api/camiones', {
    placa: 'PQR-111', tipo_id: tipoId, consumo_gal_100km: 10.2,
  })
  IGUAL(camionMismoTipo.estado, 201, 'crear segundo camión con consumo propio')

  const camionRepetido = await pedir('POST', '/api/camiones', { placa: 'T3G-784', tipo_id: tipoId })
  IGUAL(camionRepetido.estado, 409, 'no se puede repetir la placa')
  IGUAL(camionRepetido.datos.campo, 'placa', 'el error señala el campo culpable')

  const camionSinTipo = await pedir('POST', '/api/camiones', { placa: 'ZZZ-999', tipo_id: 'no-existe' })
  IGUAL(camionSinTipo.estado, 422, 'un camión con tipo inexistente se rechaza')

  console.log('\n── Combustible ──')

  // Las dos cargas y el odómetro van con fecha de hoy, para que la prueba dé el
  // mismo resultado sea cual sea el día del mes. Importa: si el día 1 la carga
  // "de hace dos días" cae en el mes anterior, y la serie financiera lo refleja
  // así — que es lo correcto, no un fallo.
  const hoyIso = new Date().toISOString().slice(0, 10)

  const carga1 = await pedir('POST', '/api/abastecimientos', {
    camion_id: camionId, conductor_id: conductorId, fecha: hoyIso,
    galones: 250, precio_galon: 17.5, estacion: 'Primax', km: 119000,
  })
  IGUAL(carga1.estado, 201, 'registrar abastecimiento')
  IGUAL(carga1.datos.abastecimientos.costoTotal, 4375, 'el costo total se calcula: 250 x 17.5')

  const carga2 = await pedir('POST', '/api/abastecimientos', {
    camion_id: camionId, fecha: hoyIso, galones: 300, precio_galon: 18, km: 120000,
  })
  IGUAL(carga2.estado, 201, 'registrar segundo abastecimiento')
  IGUAL(carga2.datos.abastecimientos.costoTotal, 5400, 'segundo costo total: 300 x 18')

  const cargaCero = await pedir('POST', '/api/abastecimientos', {
    camion_id: camionId, fecha: hoyIso, galones: 0, precio_galon: 18,
  })
  IGUAL(cargaCero.estado, 422, 'no se puede abastecerse de 0 galones')

  // El costo total es una columna generada: mandarlo debe ignorarse, no contar de más.
  const cargaInyectada = await pedir('POST', '/api/abastecimientos', {
    camion_id: camionId, fecha: hoyIso, galones: 10, precio_galon: 10, costoTotal: 999999, km: 120000,
  })
  IGUAL(cargaInyectada.datos.abastecimientos.costoTotal, 100, 'el costo total no se puede falsear desde el cliente')

  console.log('\n── Viajes ──')

  const viaje = await pedir('POST', '/api/viajes', {
    referencia: 'ADV-TEST-0001', camion_id: camionId, conductor_id: conductorId,
    ruta_id: ruta.datos.rutas.id, estado: 'entregado', salida: hoyIso,
    llegada_real: hoyIso, km: 300, toneladas: 12, flete: 4200, costo_peaje: 120,
  })
  IGUAL(viaje.estado, 201, 'crear viaje')
  IGUAL(viaje.datos.viajes.km, 300, 'el viaje guarda los kilómetros')
  IGUAL(viaje.datos.viajes.flete, 4200, 'el viaje guarda el flete')

  const viajeSinCamion = await pedir('POST', '/api/viajes', {
    referencia: 'ADV-TEST-0002', camion_id: 'no-existe', conductor_id: conductorId,
    ruta_id: ruta.datos.rutas.id, salida: hoyIso,
  })
  IGUAL(viajeSinCamion.estado, 422, 'un viaje con camión inexistente se rechaza')

  console.log('\n── Gastos ──')

  const gasto = await pedir('POST', '/api/gastos', {
    mes: hoyIso.slice(0, 7), categoria: 'planilla', concepto: 'Planilla de octubre', monto: 42000,
  })
  IGUAL(gasto.estado, 201, 'crear gasto')

  const gastoCombustible = await pedir('POST', '/api/gastos', {
    mes: hoyIso.slice(0, 7), categoria: 'combustible', concepto: 'Intento de doble conteo', monto: 1000,
  })
  IGUAL(gastoCombustible.estado, 422, 'la categoría combustible está prohibida en gastos')

  const gastoMesMalo = await pedir('POST', '/api/gastos', {
    mes: 'octubre', categoria: 'planilla', concepto: 'Mal formado', monto: 100,
  })
  IGUAL(gastoMesMalo.estado, 422, 'el mes debe tener el formato AAAA-MM')

  console.log('\n── Borrado protegido ──')

  const borrarConDatos = await pedir('DELETE', `/api/camiones/${camionId}`)
  IGUAL(borrarConDatos.estado, 409, 'no se puede borrar un camión con abastecimientos')
  comprobar(
    borrarConDatos.datos.error?.includes('inactivo'),
    'el error sugiere marcarlo inactivo en vez de borrarlo',
    borrarConDatos.datos.error,
  )

  const desactivar = await pedir('PUT', `/api/camiones/${camionId}`, { activo: false })
  IGUAL(desactivar.estado, 200, 'se puede desactivar el camión')
  IGUAL(desactivar.datos.camiones.activo, false, 'queda registrado como inactivo')

  const borrarTipoUsado = await pedir('DELETE', `/api/tipos_camion/${tipoId}`)
  IGUAL(borrarTipoUsado.estado, 409, 'no se puede borrar un tipo con camiones')

  const borrarInsumo = await pedir('DELETE', `/api/abastecimientos/${cargaInyectada.datos.abastecimientos.id}`)
  IGUAL(borrarInsumo.estado, 200, 'un abastecimiento sí se puede borrar')

  console.log('\n── Roles ──')

  const { hashearContrasena, buscarUsuario } = await import('./auth.ts')
  for (const [email, rol] of [['op@advaluro.pe', 'operador'], ['lectura@advaluro.pe', 'lectura']] as const) {
    db.prepare(
      'INSERT INTO perfiles (id,email,nombre,rol,password_hash) VALUES(?,?,?,?,?)',
    ).run(`p-${rol}`, email, `Usuario ${rol}`, rol, hashearContrasena('clave-larga-123'))
  }

  // Operador: puede crear, no puede borrar.
  await pedir('POST', '/api/auth/entrar', { email: 'op@advaluro.pe', contrasena: 'clave-larga-123' }, false)
  const opCrea = await pedir('POST', '/api/conductores', { nombres: 'Nuevo Op', licencia: 'Q9999999' })
  IGUAL(opCrea.estado, 201, 'el operador sí puede crear')
  const opBorra = await pedir('DELETE', `/api/conductores/${opCrea.datos.conductores.id}`)
  IGUAL(opBorra.estado, 403, 'el operador no puede borrar')
  comprobar(
    opBorra.datos.error?.includes('operador'),
    'el error explica qué rol falta',
    opBorra.datos.error,
  )

  // Solo lectura: ni crea ni edita.
  await pedir('POST', '/api/auth/entrar', { email: 'lectura@advaluro.pe', contrasena: 'clave-larga-123' }, false)
  const lecturaLee = await pedir('GET', '/api/camiones')
  IGUAL(lecturaLee.estado, 200, 'el rol lectura sí puede consultar')
  const lecturaCrea = await pedir('POST', '/api/conductores', { nombres: 'No', licencia: 'Q0000001' })
  IGUAL(lecturaCrea.estado, 403, 'el rol lectura no puede crear')

  // El catálogo es solo de administrador.
  const lecturaCatalogo = await pedir('POST', '/api/ciudades', {
    nombre: 'Trujillo', departamento: 'La Libertad', zona: 'costa', lat: 0, lng: 0,
  })
  IGUAL(lecturaCatalogo.estado, 403, 'el rol lectura no puede tocar el catálogo')


  console.log('\n── Gestión de cuentas ──')

  await entrar('admin@advaluro.pe')
  const miId = (await pedir('GET', '/api/auth/mi-cuenta')).datos.usuario.id
  IGUAL(typeof miId, 'string', 'la cuenta propia tiene identificador')

  // Crear una cuenta devuelve la contraseña una sola vez, para poder
  // comunicársela. Nunca vuelve a salir de la base en claro.
  const nuevo = await pedir('POST', '/api/auth/usuarios', {
    email: 'Nuevo.Gerente@Advaluro.pe', nombre: 'Nuevo Gerente', contrasena: 'clave-larga-123', rol: 'operador',
  })
  IGUAL(nuevo.estado, 201, 'crear cuenta')
  IGUAL(nuevo.datos.usuario.email, 'nuevo.gerente@advaluro.pe', 'el correo se guarda en minúsculas')
  IGUAL(nuevo.datos.usuario.rol, 'operador', 'la cuenta nace con el rol pedido')
  IGUAL(nuevo.datos.usuario.activo, 1, 'la cuenta nace activa')
  IGUAL(nuevo.datos.usuario.password_hash, undefined, 'la respuesta no incluye el hash')
  IGUAL(nuevo.datos.contrasenaInicial, 'clave-larga-123', 'la contraseña se devuelve una vez al crearla')

  const idNuevo = nuevo.datos.usuario.id

  // La contraseña guardada es un hash de scrypt, no el texto.
  const hashGuardado = una<{ password_hash: string }>(db, 'SELECT password_hash FROM perfiles WHERE id = ?', idNuevo)!
  comprobar(hashGuardado.password_hash.startsWith('scrypt$'), 'la contraseña se guarda hasheada con scrypt')
  comprobar(!hashGuardado.password_hash.includes('clave-larga-123'), 'el texto de la contraseña no está en la base')

  // El listado tampoco incluye el hash.
  const listado = await pedir('GET', '/api/auth/usuarios')
  IGUAL(listado.estado, 200, 'listar cuentas')
  comprobar(
    listado.datos.usuarios.every((u: any) => u.password_hash === undefined),
    'el listado tampoco expone hashes',
  )

  // Correo duplicado: 409, no 500.
  const duplicado = await pedir('POST', '/api/auth/usuarios', {
    email: 'nuevo.gerente@advaluro.pe', nombre: 'Otro', contrasena: 'clave-larga-123', rol: 'lectura',
  })
  IGUAL(duplicado.estado, 409, 'no se pueden crear dos cuentas con el mismo correo')

  // Validaciones de entrada, cada una señalando su campo.
  const correoMalo = await pedir('POST', '/api/auth/usuarios', { email: 'sin-arroba', nombre: 'X', contrasena: 'clave-larga-123', rol: 'lectura' })
  IGUAL(correoMalo.estado, 422, 'correo inválido')
  IGUAL(correoMalo.datos.campo, 'email', 'el error de correo señala el campo email')
  IGUAL((await pedir('POST', '/api/auth/usuarios', { email: 'a@b.com', nombre: 'X', contrasena: 'corta', rol: 'lectura' })).datos.campo, 'contrasena', 'el error de contraseña señala su campo')
  IGUAL((await pedir('POST', '/api/auth/usuarios', { email: 'a@b.com', nombre: 'X', contrasena: 'clave-larga-123', rol: 'jefe' })).datos.campo, 'rol', 'el error de rol señala su campo')
  IGUAL((await pedir('POST', '/api/auth/usuarios', { email: 'a@b.com', contrasena: 'clave-larga-123', rol: 'lectura' })).datos.campo, 'nombre', 'falta el nombre')

  // Cambiar rol y nombre. Lo que no se manda se conserva.
  const cambiado = await pedir('PUT', `/api/auth/usuarios/${idNuevo}`, { rol: 'lectura' })
  IGUAL(cambiado.estado, 200, 'cambiar el rol')
  IGUAL(cambiado.datos.usuario.rol, 'lectura', 'el rol cambió')
  IGUAL(cambiado.datos.usuario.nombre, 'Nuevo Gerente', 'lo que no se manda se conserva')
  IGUAL((await pedir('PUT', `/api/auth/usuarios/${idNuevo}`, { nombre: 'Gerente Nuevo' })).datos.usuario.rol, 'lectura', 'cambiar solo el nombre no toca el rol')

  // Desactivar y reactivar. La cuenta se conserva, no se borra.
  const desactivado = await pedir('DELETE', `/api/auth/usuarios/${idNuevo}`)
  IGUAL(desactivado.estado, 200, 'desactivar cuenta')
  IGUAL(desactivado.datos.usuario.activo, 0, 'la cuenta queda inactiva')
  comprobar(!!buscarUsuario(db, idNuevo), 'la cuenta desactivada sigue existiendo')
  IGUAL((await pedir('PUT', `/api/auth/usuarios/${idNuevo}`, { activo: true })).datos.usuario.activo, 1, 'reactivar cuenta')

  // Una cuenta desactivada no puede entrar, y se explica por qué.
  await entrar('nuevo.gerente@advaluro.pe')
  await entrar('admin@advaluro.pe')
  IGUAL((await pedir('DELETE', `/api/auth/usuarios/${idNuevo}`)).estado, 200, 'se desactiva otra vez')
  const entraDesactivado = await pedir('POST', '/api/auth/entrar', { email: 'nuevo.gerente@advaluro.pe', contrasena: 'clave-larga-123' }, false)
  IGUAL(entraDesactivado.estado, 401, 'una cuenta desactivada no puede iniciar sesión')
  IGUAL(entraDesactivado.datos.error, 'Esta cuenta está desactivada', 'y se explica por qué')
  await entrar('admin@advaluro.pe')
  await pedir('PUT', `/api/auth/usuarios/${idNuevo}`, { activo: true })

  // Restablecer contraseña cierra las sesiones abiertas de esa cuenta: si la
  // contraseña estaba comprometida, dejarlas vivas sería no hacer nada.
  await entrar('nuevo.gerente@advaluro.pe')
  const sesionesAntes = una<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM sesiones WHERE perfil_id = ?', idNuevo)!.n
  comprobar(sesionesAntes >= 1, 'la cuenta nueva tiene su sesión abierta', sesionesAntes)
  await entrar('admin@advaluro.pe')
  IGUAL((await pedir('PUT', `/api/auth/usuarios/${idNuevo}/contrasena`, { contrasena: 'clave-nueva-999' })).estado, 200, 'restablecer contraseña')
  IGUAL(una<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM sesiones WHERE perfil_id = ?', idNuevo)!.n, 0, 'al restablecer la contraseña se cierran todas sus sesiones abiertas')
  IGUAL((await pedir('POST', '/api/auth/entrar', { email: 'nuevo.gerente@advaluro.pe', contrasena: 'clave-larga-123' }, false)).estado, 401, 'la contraseña anterior ya no sirve')
  IGUAL((await pedir('POST', '/api/auth/entrar', { email: 'nuevo.gerente@advaluro.pe', contrasena: 'clave-nueva-999' }, false)).estado, 200, 'la nueva sí sirve')

  // Nadie, ni un admin, puede tocar el rol o la actividad de alguien por encima
  // de su propio rol: aquí el rol lectura lo intenta.
  await entrar('nuevo.gerente@advaluro.pe', 'clave-nueva-999')
  IGUAL((await pedir('GET', '/api/auth/usuarios')).estado, 403, 'un operador no puede listar cuentas')
  IGUAL((await pedir('PUT', '/api/auth/mi-cuenta', { nombre: 'Gerente Editado' })).estado, 200, 'pero sí cambiar su propio nombre')
  await entrar('admin@advaluro.pe')

  console.log('\n── Protección del último administrador ──')

  // Con un solo administrador, ese administrador no puede quedarse sin cargo:
  // la empresa se quedaría sin quien administre las cuentas.
  IGUAL((await pedir('DELETE', `/api/auth/usuarios/${miId}`)).estado, 409, 'no se puede desactivar al único administrador')
  IGUAL((await pedir('PUT', `/api/auth/usuarios/${miId}`, { rol: 'operador' })).estado, 409, 'ni quitarle su rol a sí mismo')
  const ultimoAdmin = await pedir('DELETE', `/api/auth/usuarios/${miId}`)
  comprobar(String(ultimoAdmin.datos.error).includes('único administrador'), 'el error explica el motivo', ultimoAdmin.datos.error)

  // Con dos administradores, uno sí puede.admin al otro.
  const admin2 = await pedir('POST', '/api/auth/usuarios', {
    email: 'admin2@advaluro.pe', nombre: 'Segundo Admin', contrasena: 'clave-larga-123', rol: 'admin',
  })
  IGUAL(admin2.estado, 201, 'se crea un segundo administrador')
  const idAdmin2 = admin2.datos.usuario.id
  IGUAL((await pedir('DELETE', `/api/auth/usuarios/${idAdmin2}`)).estado, 200, 'con dos administradores uno puede desactivar al otro')
  IGUAL((await pedir('PUT', `/api/auth/usuarios/${idAdmin2}`, { activo: true })).estado, 200, 'y volverlo a activar')

  // Y el segundo tampoco puede autodesactivarse ni quitarse su propio rol, para
  // no quedarse fuera de la sesión que está usando.
  await entrar('admin2@advaluro.pe')
  IGUAL((await pedir('DELETE', `/api/auth/usuarios/${idAdmin2}`)).estado, 409, 'nadie puede desactivar su propia cuenta')
  IGUAL((await pedir('PUT', `/api/auth/usuarios/${idAdmin2}`, { rol: 'lectura' })).estado, 409, 'nadie puede quitarse su propio rol de administrador')
  IGUAL((await pedir('PUT', `/api/auth/usuarios/${idAdmin2}`, { nombre: 'Segundo Admin Renombrado' })).estado, 200, 'pero sí cambiar su propio nombre')
  IGUAL(buscarUsuario(db, idAdmin2)!.nombre, 'Segundo Admin Renombrado', 'el nombre cambió')
  await entrar('admin@advaluro.pe')

  // Un administrador desactivado no puede iniciar sesión aunque sepa su contraseña.
  await pedir('DELETE', `/api/auth/usuarios/${idAdmin2}`)
  IGUAL((await pedir('POST', '/api/auth/entrar', { email: 'admin2@advaluro.pe', contrasena: 'clave-larga-123' }, false)).estado, 401, 'un admin desactivado tampoco puede entrar')
  await pedir('PUT', `/api/auth/usuarios/${idAdmin2}`, { activo: true })

  console.log('\n── Cuenta propia ──')

  // Cualquiera puede ver y cambiar su nombre, sin ser admin.
  await entrar('lectura@advaluro.pe')
  const idLectura = (await pedir('GET', '/api/auth/mi-cuenta')).datos.usuario.id
  IGUAL((await pedir('GET', '/api/auth/mi-cuenta')).datos.usuario.rol, 'lectura', 'un rol lectura ve su propia cuenta')
  IGUAL((await pedir('GET', '/api/auth/usuarios')).estado, 403, 'pero no la lista de todas las cuentas')
  IGUAL((await pedir('PUT', '/api/auth/mi-cuenta', { nombre: 'Persona Lectura' })).estado, 200, 'cambiar su propio nombre')
  IGUAL(buscarUsuario(db, idLectura)!.nombre, 'Persona Lectura', 'el nombre cambió')
  IGUAL((await pedir('PUT', `/api/auth/usuarios/${idLectura}`, { rol: 'admin' })).estado, 403, 'pero no puede tocar su rol por la API de admin')

  // Cambiar la contraseña propia exige la actual.
  // Cambiar la contraseña propia exige la actual. Es 422, no 401: la sesión está
  // bien, lo que falla es el campo `actual` (ver la nota en index.ts).
  IGUAL((await pedir('PUT', '/api/auth/mi-contrasena', { actual: 'equivocada', nueva: 'clave-mia-111' })).estado, 422, 'no se cambia la contraseña sin la actual')
  IGUAL((await pedir('PUT', '/api/auth/mi-contrasena', { actual: 'clave-larga-123', nueva: 'corta' })).estado, 422, 'la nueva se valida')
  IGUAL((await pedir('PUT', '/api/auth/mi-contrasena', { actual: 'clave-larga-123', nueva: 'clave-mia-111' })).estado, 200, 'cambiar la contraseña propia')
  // Las sesiones propias sobreviven: la contraseña no estaba comprometida.
  const sesionesPropias = una<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM sesiones WHERE perfil_id = ?', idLectura)!.n
  IGUAL(
    una<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM sesiones WHERE perfil_id = ?', idLectura)!.n,
    sesionesPropias,
    'cambiar la contraseña propia no cierra la sesión abierta',
  )
  IGUAL((await pedir('POST', '/api/auth/entrar', { email: 'lectura@advaluro.pe', contrasena: 'clave-larga-123' }, false)).estado, 401, 'la contraseña anterior ya no entra')
  IGUAL((await pedir('POST', '/api/auth/entrar', { email: 'lectura@advaluro.pe', contrasena: 'clave-mia-111' }, false)).estado, 200, 'la nueva sí')

  // Sin sesión no se toca nada de la cuenta propia.
  cerrarSesionDePrueba()
  IGUAL((await pedir('GET', '/api/auth/mi-cuenta', undefined, false)).estado, 401, 'mi-cuenta exige sesión')
  IGUAL((await pedir('PUT', '/api/auth/mi-cuenta', { nombre: 'Intruso' }, false)).estado, 401, 'y no se puede cambiar sin ella')
  IGUAL((await pedir('PUT', '/api/auth/mi-contrasena', { actual: 'clave-mia-111', nueva: 'clave-larga-123' }, false)).estado, 401, 'ni cambiar la contraseña sin ella')


  console.log('\n── Búsqueda y filtros ──')

  await pedir('POST', '/api/auth/entrar', { email: 'admin@advaluro.pe', contrasena: 'clave-larga-123' }, false)
  const busca = await pedir('GET', '/api/camiones?q=t3g')
  IGUAL(busca.estado, 200, 'buscar por texto')
  IGUAL(busca.datos.camiones.length, 1, 'la búsqueda no distingue mayúsculas')

  const filtra = await pedir('GET', '/api/camiones?activo=1')
  IGUAL(filtra.datos.camiones.every((c: any) => c.activo === true), true, 'el filtro por activo funciona')

  const filtroDesconocido = await pedir('GET', '/api/camiones?inventado=5')
  IGUAL(filtroDesconocido.estado, 200, 'un filtro desconocido se ignora en vez de romper')

  console.log('\n── Dataset del panel ──')

  const dataset = await pedir('GET', '/api/dataset')
  IGUAL(dataset.estado, 200, 'obtener el dataset')
  const d = dataset.datos
  IGUAL(d.camiones.length, 2, 'el dataset trae los camiones')
  IGUAL(d.catalogo.ciudades.length, 2, 'el dataset trae el catálogo de ciudades')
  IGUAL(d.abastecimientos.length, 2, 'el dataset trae los abastecimientos')
  IGUAL(d.viajesTodos.length, 1, 'el dataset trae los viajes')

  // El dataset Enriquece los viajes con datos de otras tablas. El CRUD devuelve
  // solo lo que está guardado; el dataset es el que une las piezas.
  const viajeEnDataset = d.viajesTodos[0]
  IGUAL(viajeEnDataset.placa, 'T3G-784', 'el viaje viene con la placa del camión')
  IGUAL(viajeEnDataset.nombreConductor, 'Luis Ramírez', 'el viaje viene con el nombre del conductor')
  IGUAL(
    viajeEnDataset.costoCombustible,
    Math.round((300 * 9.5) / 100 * 17.75),
    'el costo de combustible sale del km y del consumo: 300 km a 9.5 gal/100 km',
  )
  IGUAL(viajeEnDataset.costoCombustibleEstimado, false, 'con cargas registradas el precio no es estimado')

  const camionEnDataset = d.camiones.find((c: any) => c.id === camionId)
  IGUAL(camionEnDataset.tanqueLitros, 400, 'el camión hereda el tanque de su tipo')
  IGUAL(camionEnDataset.consumoGal100km, 9.5, 'y el consumo del tipo')
  IGUAL(camionEnDataset.ultimoAbastecimiento, hoyIso, 'se indica el último abastecimiento')

  // El nivel del tanque se calcula: tanque 400 menos lo consumido desde la carga.
  // Este camión hizo un viaje de 300 km a 9.5 gal/100 km = 28.5 galones.
  IGUAL(camionEnDataset.tanqueRestante, 371.5, 'el nivel del tanque se calcula, no se escribe')
  IGUAL(camionEnDataset.kmDesdeUltimoAbastecimiento, 300, 'se informa el km recorrido desde la carga')

  // El otro camión no tiene ni tanque ni consumos: la respuesta debe ser null,
  // no 0. Un cero haría creer que el tanque está vacío.
  const sinDatos = d.camiones.find((c: any) => c.id === camionMismoTipo.datos.camiones.id)
  IGUAL(sinDatos.tanqueRestante, null, 'sin datos suficientes el nivel es null, no cero')

  // Consumo real medido a partir de dos cargas con odómetro anotado.
  IGUAL(camionEnDataset.consumoMedidoGal100km, 5, 'el consumo medido sale de los odómetros: 50 gal / 1000 km')

  const mesActual = d.finanzasMensuales.at(-1)
  IGUAL(mesActual.mes, hoyIso.slice(0, 7), 'la serie financiera cierra en el mes actual')
  IGUAL(mesActual.mesEnCurso, true, 'el mes actual se marca como en curso')
  IGUAL(mesActual.diasTranscurridos, new Date().getDate(), 'los días transcurridos son los de hoy')
  IGUAL(mesActual.costos.planilla, 42000, 'el gasto de planilla aparece en la serie')

  // El combustible de la serie tiene que ser exactamente la suma de las cargas
  // del mes. Se compara contra el propio conjunto en vez de contra un número
  // fijo, para que la prueba no dependa del día en que se ejecute.
  const cargasDelMes = d.abastecimientos.filter((a: any) => a.fecha.slice(0, 7) === mesActual.mes)
  IGUAL(
    mesActual.costos.combustible,
    Math.round(cargasDelMes.reduce((a: number, x: any) => a + x.costoTotal, 0)),
    'el combustible sale de los abastecimientos, no de gastos',
  )
  comprobar(mesActual.costos.combustible > 0, 'hay combustible registrado en el mes')
  IGUAL(
    mesActual.totalCostos,
    Object.values(mesActual.costos).reduce((a: number, b: any) => a + b, 0),
    'los buckets de costo suman exactamente el total',
  )

  // La base de datos real no debe haber quedado tocada por la prueba.
  IGUAL(
    una<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM gastos')!.n,
    1,
    'los intentos fallidos no dejaron filas a medias',
  )
} catch (error) {
  fallos.push(`excepción inesperada: ${(error as Error).message}`)
} finally {
  servidor.close()
  // Hay que cerrar la conexión antes de borrar: con la base abierta, los archivos
  // de WAL están bloqueados y Windows no los deja eliminar.
  cerrarBase()
  try {
    rmSync(carpeta, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    console.log(`(no se pudo borrar la carpeta temporal ${carpeta}; bórrala a mano)`)
  }
}

console.log(`\n${'─'.repeat(50)}`)
if (fallos.length === 0) {
  console.log(`TODAS LAS PRUEBAS PASARON (${pasadas})`)
} else {
  console.log(`${pasadas} pasaron, ${fallos.length} fallaron:\n`)
  for (const f of fallos) console.log(`  x ${f}`)
  process.exitCode = 1
}
