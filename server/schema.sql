-- ============================================================================
-- Empresa Advaluro — esquema de la base de datos
-- ============================================================================
--
-- Este archivo se ejecuta en `archivo:data/advaluro.db` con el módulo nativo
-- `node:sqlite`, que viene incluido en Node 24. No requiere instalar nada.
--
-- PORTABILIDAD
-- ------------
-- Las tablas, columnas y relaciones son estándar y ya están pensadas para
-- Postgres, que es el destino si más adelante decides mover los datos a la
-- nube. Al migrar, solo cambian estas tres cosas:
--
--   1. INTEGER 0/1        -> BOOLEAN
--   2. TEXT PRIMARY KEY    -> TEXT PRIMARY KEY (igual) o UUID
--   3. AUTOINCREMENT      -> GENERATED ALWAYS AS IDENTITY
--
-- El resto (CHECK, FOREIGN KEY, índices, columnas generadas) es igual en ambos.
-- La API nunca concatena valores en las consultas: siempre usa parámetros, así
-- que no hay riesgo de inyección SQL.
--
-- CONVENCIONES
-- ------------
--   * Las tablas se llaman en plural, las columnas en singular y snake_case.
--   * Los importes y las distancias son números sin formato; el símbolo S/ y los
--     separadores de miles los pone la interfaz.
--   * Las fechas se guardan como texto ISO: 'AAAA-MM-DD' para fechas y
--     'AAAA-MM-DDT00:00:00Z' para instantes. Se ordenan bien porque el formato
--     es de longitud fija.
--   * Los meses son 'AAAA-MM'.
--   * `activo` sirve para dar de baja un registro sin borrarlo. Ver la nota sobre
--     borrado al final de cada bloque.
-- ============================================================================


-- ── 1. Catálogos ────────────────────────────────────────────────────────────
-- Son datos de referencia que rara vez cambian. Se cargan una vez y se editan
-- desde la sección de Datos si hace falta.

CREATE TABLE ciudades (
  id           TEXT PRIMARY KEY,
  nombre       TEXT    NOT NULL UNIQUE,
  departamento TEXT    NOT NULL,
  zona         TEXT    NOT NULL CHECK (zona IN ('costa', 'sierra', 'selva')),
  lat          REAL    NOT NULL,
  lng          REAL    NOT NULL
);

CREATE TABLE rubros (
  id     TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE rutas (
  id          TEXT NOT NULL PRIMARY KEY,
  origen_id   TEXT NOT NULL REFERENCES ciudades (id),
  destino_id  TEXT NOT NULL REFERENCES ciudades (id),
  km          REAL NOT NULL CHECK (km > 0),
  tipo        TEXT NOT NULL DEFAULT 'transversal'
                CHECK (tipo IN ('panamericana_norte', 'panamericana_sur', 'transversal', 'costera')),
  -- Cuántas carrocerías admite la ruta. En Postgres esto sería TEXT[]; aquí se
  -- guarda como texto separado por comas y el helper lo separa al leer.
  carrocerias TEXT NOT NULL DEFAULT '',
  peajes      INTEGER NOT NULL DEFAULT 0 CHECK (peajes >= 0),
  activa      INTEGER NOT NULL DEFAULT 1,
  UNIQUE (origen_id, destino_id),
  CHECK (origen_id <> destino_id)
);

CREATE INDEX idx_rutas_origen  ON rutas (origen_id);
CREATE INDEX idx_rutas_destino ON rutas (destino_id);


-- ── 2. Tipos de camión ──────────────────────────────────────────────────────
-- Define el valor por defecto de tanque y consumo. Un camión puede ajustarlos
-- más adelante; si los deja vacíos, hereda de aquí.
--
-- Por qué galones cada 100 km y no por tramo: porque así dos camiones distintos
-- se pueden comparar, y el costo de un viaje se puede proyectar antes de salir.
-- El consumo por tramo se deriva: km x consumo / 100.

CREATE TABLE tipos_camion (
  id                TEXT NOT NULL PRIMARY KEY,
  nombre            TEXT NOT NULL UNIQUE,
  chasis            TEXT,
  ejes              INTEGER,
  capacidad_ton     REAL CHECK (capacidad_ton > 0),
  capacidad_m3      REAL CHECK (capacidad_m3 > 0),
  tanque_litros     REAL NOT NULL CHECK (tanque_litros > 0),
  consumo_gal_100km REAL NOT NULL CHECK (consumo_gal_100km > 0),
  activo            INTEGER NOT NULL DEFAULT 1
);


-- ── 3. Conductores ──────────────────────────────────────────────────────────
-- Lo que se cuenta (viajes completados, días consecutivos) NO se guarda aquí:
-- se calcula a partir de los viajes. Ver la nota de "campos derivados" al final.

CREATE TABLE conductores (
  id                TEXT NOT NULL PRIMARY KEY,
  nombres           TEXT NOT NULL,
  licencia          TEXT NOT NULL UNIQUE,
  experiencia_anios INTEGER NOT NULL DEFAULT 0 CHECK (experiencia_anios >= 0),
  telefono          TEXT,
  base              TEXT,
  puntaje           REAL NOT NULL DEFAULT 100,
  estado            TEXT NOT NULL DEFAULT 'activo'
                      CHECK (estado IN ('activo', 'descanso', 'licencia_medica')),
  activo            INTEGER NOT NULL DEFAULT 1
);


-- ── 4. Clientes ─────────────────────────────────────────────────────────────

CREATE TABLE clientes (
  id                  TEXT NOT NULL PRIMARY KEY,
  razon_social        TEXT NOT NULL,
  ruc                 TEXT UNIQUE,
  rubro_id            TEXT REFERENCES rubros (id),
  contacto            TEXT,
  telefono            TEXT,
  email               TEXT,
  ciudad_id           TEXT REFERENCES ciudades (id),
  tarifa_por_km       REAL NOT NULL DEFAULT 0 CHECK (tarifa_por_km >= 0),
  plazo_pago_dias     INTEGER NOT NULL DEFAULT 30 CHECK (plazo_pago_dias >= 0),
  satisfaccion        REAL CHECK (satisfaccion BETWEEN 0 AND 100),
  activo              INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_clientes_rubro  ON clientes (rubro_id);
CREATE INDEX idx_clientes_ciudad ON clientes (ciudad_id);


-- ── 5. Camiones ─────────────────────────────────────────────────────────────
-- `tanque_litros` y `consumo_gal_100km` son opcionales a propósito: si están en
-- NULL, el valor viene de tipos_camion. Así el dato de fábrica se escribe una
-- sola vez y cada unidad puede desviarse si realmente consume más.
--
-- `conductor_id` es el conductor asignado a la unidad ahora, que es distinto del
-- conductor de cada viaje. Por eso existe la columna aunque también lo
-- deduzcamos de los viajes.

CREATE TABLE camiones (
  id                   TEXT NOT NULL PRIMARY KEY,
  placa                TEXT NOT NULL UNIQUE,
  modelo               TEXT,
  anio                 INTEGER CHECK (anio BETWEEN 1990 AND 2100),
  tipo_id              TEXT NOT NULL REFERENCES tipos_camion (id),
  -- Carrocería del vehículo concreto, no la del tipo: un mismo tipo admite más de
  -- una carrocería según cómo esté equipado.
  tipo_carroceria      TEXT NOT NULL DEFAULT 'plataforma'
                         CHECK (tipo_carroceria IN
                           ('plataforma', 'refrigerado', 'cisterna', 'tolva', 'volquete')),
  capacidad_ton        REAL CHECK (capacidad_ton > 0),
  estado               TEXT NOT NULL DEFAULT 'disponible'
                         CHECK (estado IN
                           ('en_ruta', 'cargando', 'descargando', 'disponible',
                            'mantenimiento', 'fuera_de_servicio')),
  conductor_id         TEXT REFERENCES conductores (id),
  km_total             REAL NOT NULL DEFAULT 0 CHECK (km_total >= 0),
  km_ultimo_servicio   REAL,
  proximo_servicio_km  REAL,
  taller               TEXT,
  fecha_ingreso        TEXT,
  tanque_litros        REAL CHECK (tanque_litros > 0),
  consumo_gal_100km    REAL CHECK (consumo_gal_100km > 0),
  activo               INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_camiones_tipo      ON camiones (tipo_id);
CREATE INDEX idx_camiones_conductor ON camiones (conductor_id);


-- ── 6. Viajes ───────────────────────────────────────────────────────────────
-- No se permite borrar un camión que ya tiene viajes: la FOREIGN KEY lo impide.
-- En ese caso la interfaz ofrece darlo de baja con `activo = 0`, que conserva
-- el historial. Es la diferencia entre corregir una errata y perder un año de
-- operación.

CREATE TABLE viajes (
  id                   TEXT NOT NULL PRIMARY KEY,
  referencia           TEXT NOT NULL UNIQUE,
  camion_id            TEXT NOT NULL REFERENCES camiones (id),
  conductor_id         TEXT NOT NULL REFERENCES conductores (id),
  cliente_id           TEXT REFERENCES clientes (id),
  ruta_id              TEXT NOT NULL REFERENCES rutas (id),
  rubro_id             TEXT REFERENCES rubros (id),
  estado               TEXT NOT NULL DEFAULT 'programado'
                         CHECK (estado IN ('programado', 'en_curso', 'entregado', 'retrasado')),
  salida               TEXT NOT NULL,
  llegada_programada   TEXT,
  llegada_real         TEXT,
  km                   REAL NOT NULL DEFAULT 0 CHECK (km >= 0),
  toneladas            REAL CHECK (toneladas >= 0),
  flete                REAL NOT NULL DEFAULT 0 CHECK (flete >= 0),
  costo_peaje          REAL NOT NULL DEFAULT 0 CHECK (costo_peaje >= 0),
  costo_mantenimiento  REAL NOT NULL DEFAULT 0 CHECK (costo_mantenimiento >= 0),
  costo_otros          REAL NOT NULL DEFAULT 0 CHECK (costo_otros >= 0),
  temperatura_c        REAL,
  observaciones        TEXT,
  creado_en            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_viajes_camion    ON viajes (camion_id);
CREATE INDEX idx_viajes_conductor ON viajes (conductor_id);
CREATE INDEX idx_viajes_cliente   ON viajes (cliente_id);
CREATE INDEX idx_viajes_salida    ON viajes (salida);


-- ── 7. Abastecimientos ──────────────────────────────────────────────────────
-- El registro real de cada carga de combustible.
--
-- Si prefieres llevar solo el total del mes en vez de cada carga, registras UNA
-- sola fila con los galones sumados. Es la misma tabla, más o menos detalle.
--
-- `costo_total` es una columna calculada por la base: no se puede escribir a mano
-- y por eso nunca queda desfasado del producto de galones x precio.
--
-- `km` se anota al repostar y sirve para medir el consumo real de esa unidad,
-- comparando lo gastado contra los kilómetros recorridos.

CREATE TABLE abastecimientos (
  id              TEXT NOT NULL PRIMARY KEY,
  camion_id       TEXT NOT NULL REFERENCES camiones (id),
  conductor_id    TEXT REFERENCES conductores (id),
  fecha           TEXT NOT NULL,
  galones         REAL NOT NULL CHECK (galones > 0),
  precio_galon    REAL NOT NULL CHECK (precio_galon > 0),
  costo_total     REAL GENERATED ALWAYS AS (galones * precio_galon) VIRTUAL,
  tipo_combustible TEXT NOT NULL DEFAULT 'diesel',
  estacion        TEXT,
  km              REAL CHECK (km >= 0),
  notas           TEXT
);

CREATE INDEX idx_abastecimientos_camion ON abastecimientos (camion_id);
CREATE INDEX idx_abastecimientos_fecha  ON abastecimientos (fecha);


-- ── 8. Facturas ─────────────────────────────────────────────────────────────

CREATE TABLE facturas (
  id                 TEXT NOT NULL PRIMARY KEY,
  numero             TEXT NOT NULL UNIQUE,
  cliente_id         TEXT NOT NULL REFERENCES clientes (id),
  viaje_id           TEXT REFERENCES viajes (id),
  emitida            TEXT NOT NULL,
  vencimiento        TEXT NOT NULL,
  monto              REAL NOT NULL CHECK (monto >= 0),
  estado             TEXT NOT NULL DEFAULT 'pendiente'
                       CHECK (estado IN ('pendiente', 'pagada', 'vencida', 'anulada'))
);

CREATE INDEX idx_facturas_cliente ON facturas (cliente_id);
CREATE INDEX idx_facturas_viaje   ON facturas (viaje_id);


-- ── 9. Mantenimientos ───────────────────────────────────────────────────────

CREATE TABLE mantenimientos (
  id               TEXT NOT NULL PRIMARY KEY,
  camion_id        TEXT NOT NULL REFERENCES camiones (id),
  tipo             TEXT NOT NULL,
  fecha_programada TEXT NOT NULL,
  km_programado    REAL CHECK (km_programado >= 0),
  costo_estimado   REAL NOT NULL DEFAULT 0 CHECK (costo_estimado >= 0),
  estado           TEXT NOT NULL DEFAULT 'programado'
                     CHECK (estado IN ('programado', 'en_curso', 'completado'))
);

CREATE INDEX idx_mantenimientos_camion ON mantenimientos (camion_id);


-- ── 10. Incidentes ──────────────────────────────────────────────────────────

CREATE TABLE incidentes (
  id            TEXT NOT NULL PRIMARY KEY,
  viaje_id      TEXT REFERENCES viajes (id),
  conductor_id  TEXT REFERENCES conductores (id),
  tipo          TEXT NOT NULL
                  CHECK (tipo IN ('accidente', 'averia', 'retraso_critico', 'multa',
                                  'devolucion_carga')),
  fecha         TEXT NOT NULL,
  severidad     TEXT NOT NULL DEFAULT 'baja'
                  CHECK (severidad IN ('baja', 'media', 'alta')),
  descripcion   TEXT,
  costo         REAL NOT NULL DEFAULT 0 CHECK (costo >= 0),
  estado        TEXT NOT NULL DEFAULT 'abierto'
                  CHECK (estado IN ('abierto', 'en_proceso', 'cerrado'))
);

CREATE INDEX idx_incidentes_viaje     ON incidentes (viaje_id);
CREATE INDEX idx_incidentes_conductor ON incidentes (conductor_id);


-- ── 11. Gastos ──────────────────────────────────────────────────────────────
-- Lo que se gasta en la empresa y no pertenece a un viaje: planilla, permisos,
-- alquiler, seguros, impuestos.
--
-- La categoría 'combustible' NO está admitida a propósito. El gasto de
-- combustible sale de la tabla abastecimientos; permitirlo aquí también haría que
-- la página Financiero lo contara dos veces.

CREATE TABLE gastos (
  id           TEXT NOT NULL PRIMARY KEY,
  mes          TEXT NOT NULL CHECK (mes GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  categoria    TEXT NOT NULL
                 CHECK (categoria IN ('planilla', 'permisos', 'alquiler', 'seguro',
                                      'impuestos', 'administrativo', 'otro')),
  concepto     TEXT NOT NULL,
  monto        REAL NOT NULL CHECK (monto >= 0),
  camion_id    TEXT REFERENCES camiones (id),
  conductor_id TEXT REFERENCES conductores (id),
  notas        TEXT
);

CREATE INDEX idx_gastos_mes ON gastos (mes);


-- ── 12. Perfiles ────────────────────────────────────────────────────────────
-- Tres roles:
--   admin     — todo, incluido borrar
--   operador  — crea y edita, no borra
--   lectura   — solo consulta
--
-- El hash usa scrypt, un algoritmo de uso deliberado lento. Nunca se guarda la
-- contraseña en claro.

CREATE TABLE perfiles (
  id            TEXT NOT NULL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  nombre        TEXT NOT NULL,
  rol           TEXT NOT NULL DEFAULT 'operador'
                  CHECK (rol IN ('admin', 'operador', 'lectura')),
  password_hash TEXT NOT NULL,
  activo        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 13. Sesiones ────────────────────────────────────────────────────────────
-- Si se borra un perfil, sus sesiones abiertas se borran también.

CREATE TABLE sesiones (
  token      TEXT NOT NULL PRIMARY KEY,
  perfil_id  TEXT NOT NULL REFERENCES perfiles (id) ON DELETE CASCADE,
  expira     TEXT NOT NULL,
  creado_en  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sesiones_perfil ON sesiones (perfil_id);
CREATE INDEX idx_sesiones_expira ON sesiones (expira);


-- ── Campos derivados: lo que NO se guarda ───────────────────────────────────
-- Varios campos que el panel muestra no están en ninguna tabla porque se
-- calculan al vuelo al armar el dataset. Guardarlos haría que dejaran de
-- cuadrar solos al día siguiente:
--
--   camiones.viajes_ultimos_90d, camiones.tonnage_transportado
--   conductores.viajes_completados, conductores.dias_consecutivos,
--   conductores.horas_semana
--   clientes.envios_ultimos_90d, clientes.facturacion_ultimos_90d,
--   clientes.dias_promedio_pago
--   viajes.costo_combustible
--   camiones.tanque_restante, camiones.ultimo_abastecimiento
--
-- El nivel de tanque que queda en cada camión NO se escribe a mano a propósito.
-- Es lo único que se puede calcular con exactitud:
--
--   tanque_restante = tanque_litros
--                     - galones consumidos desde el último abastecimiento
--   consumo de un viaje = km x consumo_gal_100km / 100
--
-- Si admitieras un campo para anotarlo, se desincronizaría del resto en semanas
-- y nadie sabría cuál de los dos números es el bueno.

-- version: 1

