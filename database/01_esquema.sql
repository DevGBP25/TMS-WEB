/* ============================================================
   GBP · TMS — esquema completo sobre DataTMS
   Ejecutar CONECTADO A DataTMS.

   Convención: tbl_gbp_tms_<entidad>, columnas en snake_case,
   estados como texto con CHECK, fechas en UTC.

   Es idempotente: cada objeto se crea sólo si no existe.
   ============================================================ */

/* Los índices filtrados exigen estas opciones, tanto para crearlos
   como para cualquier INSERT/UPDATE/DELETE posterior sobre esas tablas.
   sqlcmd abre la sesión con QUOTED_IDENTIFIER OFF. */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO

-- RAISERROR sólo sustituye variables o literales, no llamadas a función.
DECLARE @bd sysname = DB_NAME();
IF @bd <> 'DataTMS'
BEGIN
    RAISERROR('Ejecute este script conectado a DataTMS. Base actual: %s', 16, 1, @bd);
    SET NOEXEC ON;
END
GO

/* ============================================================
   SEGURIDAD
   ============================================================ */

IF OBJECT_ID('dbo.tbl_gbp_tms_rol') IS NULL
CREATE TABLE dbo.tbl_gbp_tms_rol
(
    id_rol         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tms_rol PRIMARY KEY,
    nombre         VARCHAR(30)    NOT NULL CONSTRAINT UQ_tms_rol_nombre UNIQUE,
    descripcion    NVARCHAR(255)  NULL,
    -- El CHECK evita guardar texto que luego la API no puede deserializar.
    permisos_json  NVARCHAR(MAX)  NULL CONSTRAINT CK_tms_rol_json CHECK (permisos_json IS NULL OR ISJSON(permisos_json) = 1),
    activo         BIT            NOT NULL CONSTRAINT DF_tms_rol_activo DEFAULT (1),
    fecha_creacion DATETIME2(0)   NOT NULL CONSTRAINT DF_tms_rol_fecha  DEFAULT (SYSUTCDATETIME())
);
GO

IF OBJECT_ID('dbo.tbl_gbp_tms_usuario') IS NULL
CREATE TABLE dbo.tbl_gbp_tms_usuario
(
    id_usuario            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tms_usuario PRIMARY KEY,
    usuario               VARCHAR(30)   NOT NULL CONSTRAINT UQ_tms_usuario_login UNIQUE,
    nombre                NVARCHAR(120) NOT NULL,
    telefono              VARCHAR(20)   NULL,

    -- PBKDF2-HMACSHA512 de PasswordHasher: 84 caracteres en Base64.
    password_hash         NVARCHAR(256) NOT NULL,
    debe_cambiar_password BIT           NOT NULL CONSTRAINT DF_tms_usuario_cambiar DEFAULT (0),

    /* Datos de piloto. Nulos en usuarios administrativos: un piloto es un
       usuario con rol PILOTO, no una entidad aparte. */
    dpi                   VARCHAR(20)   NULL,
    licencia              VARCHAR(30)   NULL,
    tipo_licencia         VARCHAR(5)    NULL,
    licencia_vence        DATE          NULL,

    /* Freno a la fuerza bruta. Sin bloqueo temporal: al llegar al tope, la API
       pone activo = 0 y el administrador reactiva la cuenta a mano. */
    intentos_fallidos     TINYINT       NOT NULL CONSTRAINT DF_tms_usuario_intentos DEFAULT (0),

    ultimo_acceso         DATETIME2(0)  NULL,
    activo                BIT           NOT NULL CONSTRAINT DF_tms_usuario_activo DEFAULT (1),
    fecha_creacion        DATETIME2(0)  NOT NULL CONSTRAINT DF_tms_usuario_fecha  DEFAULT (SYSUTCDATETIME())
);
GO

/* Filtrado y no UNIQUE a secas: un UNIQUE normal trata todos los NULL como
   iguales y sólo admitiría un usuario sin DPI. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_tms_usuario_dpi')
CREATE UNIQUE INDEX UX_tms_usuario_dpi ON dbo.tbl_gbp_tms_usuario(dpi) WHERE dpi IS NOT NULL;
GO

IF OBJECT_ID('dbo.tbl_gbp_tms_usuario_rol') IS NULL
CREATE TABLE dbo.tbl_gbp_tms_usuario_rol
(
    id_usuario_rol   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tms_usuario_rol PRIMARY KEY,
    id_usuario       INT          NOT NULL,
    id_rol           INT          NOT NULL,
    asignado_por     INT          NULL,
    fecha_asignacion DATETIME2(0) NOT NULL CONSTRAINT DF_tms_ur_fecha  DEFAULT (SYSUTCDATETIME()),
    activo           BIT          NOT NULL CONSTRAINT DF_tms_ur_activo DEFAULT (1),

    CONSTRAINT UQ_tms_usuario_rol UNIQUE (id_usuario, id_rol),
    CONSTRAINT FK_tms_ur_usuario  FOREIGN KEY (id_usuario)   REFERENCES dbo.tbl_gbp_tms_usuario(id_usuario) ON DELETE CASCADE,
    CONSTRAINT FK_tms_ur_rol      FOREIGN KEY (id_rol)       REFERENCES dbo.tbl_gbp_tms_rol(id_rol),
    CONSTRAINT FK_tms_ur_asignado FOREIGN KEY (asignado_por) REFERENCES dbo.tbl_gbp_tms_usuario(id_usuario)
);
GO

-- La FK hacia rol no genera índice; sin él, "usuarios por rol" recorre la tabla.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_ur_rol')
CREATE INDEX IX_tms_ur_rol ON dbo.tbl_gbp_tms_usuario_rol(id_rol) INCLUDE (id_usuario, activo);
GO

/* Registro de sesiones emitidas.

   ATENCIÓN — se escribe al iniciar sesión y NO se consulta en cada petición:
   el token se valida por firma y vencimiento, sin ir a la base. Sirve para
   auditar quién entró, desde qué dispositivo y hasta cuándo vale su token.
   Consecuencia: marcar activa = 0 no invalida un token ya emitido. Por eso
   el token de acceso debe durar poco. Para revocación real hará falta
   refresh tokens o validar el jti en cada request. */
IF OBJECT_ID('dbo.tbl_gbp_tms_sesion') IS NULL
CREATE TABLE dbo.tbl_gbp_tms_sesion
(
    id_sesion        BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tms_sesion PRIMARY KEY,
    id_usuario       INT          NOT NULL,
    token_jti        VARCHAR(64)  NOT NULL CONSTRAINT UQ_tms_sesion_jti UNIQUE,
    plataforma       VARCHAR(10)  NOT NULL CONSTRAINT DF_tms_sesion_plat DEFAULT ('WEB'),
    dispositivo      VARCHAR(100) NULL,
    ip_address       VARCHAR(45)  NULL,        -- 45 admite IPv6
    fecha_creacion   DATETIME2(0) NOT NULL CONSTRAINT DF_tms_sesion_fecha DEFAULT (SYSUTCDATETIME()),
    fecha_expiracion DATETIME2(0) NOT NULL,
    activa           BIT          NOT NULL CONSTRAINT DF_tms_sesion_activa DEFAULT (1),

    CONSTRAINT CK_tms_sesion_plataforma CHECK (plataforma IN ('WEB', 'MOVIL')),
    CONSTRAINT FK_tms_sesion_usuario FOREIGN KEY (id_usuario) REFERENCES dbo.tbl_gbp_tms_usuario(id_usuario) ON DELETE CASCADE
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_sesion_usuario')
CREATE INDEX IX_tms_sesion_usuario ON dbo.tbl_gbp_tms_sesion(id_usuario, activa) INCLUDE (fecha_expiracion);
GO

/* Bitácora de intentos de acceso. Sin FK a usuario a propósito: debe
   conservar los intentos con usuario inexistente y sobrevivir a una baja. */
IF OBJECT_ID('dbo.tbl_gbp_tms_log_acceso') IS NULL
CREATE TABLE dbo.tbl_gbp_tms_log_acceso
(
    id_log          BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tms_log_acceso PRIMARY KEY,
    id_usuario      INT          NULL,
    usuario_intento VARCHAR(30)  NULL,
    exitoso         BIT          NOT NULL,
    motivo          VARCHAR(40)  NULL,        -- CLAVE_INCORRECTA, INACTIVO, BLOQUEADO, NO_EXISTE
    plataforma      VARCHAR(10)  NULL,
    ip_address      VARCHAR(45)  NULL,
    fecha           DATETIME2(0) NOT NULL CONSTRAINT DF_tms_log_fecha DEFAULT (SYSUTCDATETIME())
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_log_fecha')
CREATE INDEX IX_tms_log_fecha ON dbo.tbl_gbp_tms_log_acceso(fecha DESC) INCLUDE (usuario_intento, exitoso);
GO

/* ============================================================
   FLOTA
   ============================================================ */

IF OBJECT_ID('dbo.tbl_gbp_tms_unidad') IS NULL
CREATE TABLE dbo.tbl_gbp_tms_unidad
(
    id_unidad      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tms_unidad PRIMARY KEY,
    codigo         VARCHAR(20)   NOT NULL CONSTRAINT UQ_tms_unidad_codigo UNIQUE,
    placa          VARCHAR(20)   NULL,
    marca          NVARCHAR(60)  NULL,
    modelo         NVARCHAR(60)  NULL,
    anio           SMALLINT      NULL,
    tipo           VARCHAR(30)   NULL,
    capacidad_kg   DECIMAL(12,2) NOT NULL CONSTRAINT DF_tms_unidad_kg DEFAULT (0),
    capacidad_m3   DECIMAL(10,2) NOT NULL CONSTRAINT DF_tms_unidad_m3 DEFAULT (0),
    odometro_km    DECIMAL(12,2) NOT NULL CONSTRAINT DF_tms_unidad_odo DEFAULT (0),
    transportista  NVARCHAR(120) NULL,
    estado         VARCHAR(20)   NOT NULL CONSTRAINT DF_tms_unidad_estado DEFAULT ('DISPONIBLE'),
    activo         BIT           NOT NULL CONSTRAINT DF_tms_unidad_activo DEFAULT (1),
    fecha_creacion DATETIME2(0)  NOT NULL CONSTRAINT DF_tms_unidad_fecha  DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT CK_tms_unidad_estado CHECK (estado IN ('DISPONIBLE','EN_RUTA','MANTENIMIENTO','FUERA_SERVICIO'))
);
GO

/* Filtrado y no UNIQUE a secas: hay remolques y unidades sin registrar,
   y un UNIQUE normal sólo admitiría una fila con placa nula. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_tms_unidad_placa')
CREATE UNIQUE INDEX UX_tms_unidad_placa ON dbo.tbl_gbp_tms_unidad(placa) WHERE placa IS NOT NULL;
GO

/* Turno: qué piloto opera qué unidad y desde cuándo. */
IF OBJECT_ID('dbo.tbl_gbp_tms_piloto_unidad') IS NULL
CREATE TABLE dbo.tbl_gbp_tms_piloto_unidad
(
    id_piloto_unidad INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tms_piloto_unidad PRIMARY KEY,
    id_usuario       INT           NOT NULL,
    id_unidad        INT           NOT NULL,

    fecha_inicio     DATETIME2(0)  NOT NULL CONSTRAINT DF_tms_pu_inicio DEFAULT (SYSUTCDATETIME()),
    latitud_inicio   DECIMAL(10,8) NULL,
    longitud_inicio  DECIMAL(11,8) NULL,
    fecha_fin        DATETIME2(0)  NULL,
    latitud_fin      DECIMAL(10,8) NULL,
    longitud_fin     DECIMAL(11,8) NULL,

    tipo_inicio      VARCHAR(20)   NOT NULL CONSTRAINT DF_tms_pu_tipo_ini DEFAULT ('PILOTO'),
    iniciado_por     INT           NULL,
    tipo_cierre      VARCHAR(20)   NULL,
    cerrado_por      INT           NULL,

    odometro_inicio  DECIMAL(12,2) NULL,
    odometro_fin     DECIMAL(12,2) NULL,

    estado           VARCHAR(20)   NOT NULL CONSTRAINT DF_tms_pu_estado DEFAULT ('ACTIVA'),

    CONSTRAINT CK_tms_pu_estado      CHECK (estado      IN ('ACTIVA','CERRADA')),
    CONSTRAINT CK_tms_pu_tipo_inicio CHECK (tipo_inicio IN ('PILOTO','SUPERVISOR')),
    CONSTRAINT CK_tms_pu_tipo_cierre CHECK (tipo_cierre IS NULL OR tipo_cierre IN ('PILOTO','SUPERVISOR','AUTOMATICO')),
    -- Un turno no puede cerrarse antes de abrirse ni retroceder el odómetro.
    CONSTRAINT CK_tms_pu_fechas      CHECK (fecha_fin    IS NULL OR fecha_fin    >= fecha_inicio),
    CONSTRAINT CK_tms_pu_odometro    CHECK (odometro_fin IS NULL OR odometro_inicio IS NULL OR odometro_fin >= odometro_inicio),

    CONSTRAINT FK_tms_pu_usuario  FOREIGN KEY (id_usuario)   REFERENCES dbo.tbl_gbp_tms_usuario(id_usuario),
    CONSTRAINT FK_tms_pu_unidad   FOREIGN KEY (id_unidad)    REFERENCES dbo.tbl_gbp_tms_unidad(id_unidad),
    CONSTRAINT FK_tms_pu_iniciado FOREIGN KEY (iniciado_por) REFERENCES dbo.tbl_gbp_tms_usuario(id_usuario),
    CONSTRAINT FK_tms_pu_cerrado  FOREIGN KEY (cerrado_por)  REFERENCES dbo.tbl_gbp_tms_usuario(id_usuario)
);
GO

/* Las dos reglas duras del turno viven en el motor, no en la API: así ni una
   condición de carrera ni un bug de la aplicación pueden violarlas. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_tms_pu_piloto_activo')
CREATE UNIQUE INDEX UX_tms_pu_piloto_activo ON dbo.tbl_gbp_tms_piloto_unidad(id_usuario) WHERE estado = 'ACTIVA';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_tms_pu_unidad_activa')
CREATE UNIQUE INDEX UX_tms_pu_unidad_activa ON dbo.tbl_gbp_tms_piloto_unidad(id_unidad) WHERE estado = 'ACTIVA';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_pu_unidad_estado')
CREATE INDEX IX_tms_pu_unidad_estado ON dbo.tbl_gbp_tms_piloto_unidad(id_unidad, estado) INCLUDE (id_usuario, fecha_inicio);
GO

/* ============================================================
   OPERACIÓN
   ============================================================ */

IF OBJECT_ID('dbo.tbl_gbp_tms_ruta') IS NULL
CREATE TABLE dbo.tbl_gbp_tms_ruta
(
    id_ruta        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tms_ruta PRIMARY KEY,
    codigo         VARCHAR(20)   NOT NULL CONSTRAINT UQ_tms_ruta_codigo UNIQUE,
    nombre         NVARCHAR(120) NOT NULL,
    departamento   NVARCHAR(60)  NULL,
    municipio      NVARCHAR(60)  NULL,
    distancia_km   DECIMAL(10,2) NOT NULL CONSTRAINT DF_tms_ruta_km  DEFAULT (0),
    duracion_min   INT           NOT NULL CONSTRAINT DF_tms_ruta_min DEFAULT (0),
    activo         BIT           NOT NULL CONSTRAINT DF_tms_ruta_activo DEFAULT (1),
    fecha_creacion DATETIME2(0)  NOT NULL CONSTRAINT DF_tms_ruta_fecha  DEFAULT (SYSUTCDATETIME())
);
GO

IF OBJECT_ID('dbo.tbl_gbp_tms_viaje') IS NULL
CREATE TABLE dbo.tbl_gbp_tms_viaje
(
    id_viaje           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tms_viaje PRIMARY KEY,
    numero             VARCHAR(20)   NOT NULL CONSTRAINT UQ_tms_viaje_numero UNIQUE,
    fecha              DATE          NOT NULL,
    estado             VARCHAR(20)   NOT NULL CONSTRAINT DF_tms_viaje_estado DEFAULT ('PLANIFICADO'),

    id_ruta            INT           NULL,
    id_unidad          INT           NULL,
    id_usuario_piloto  INT           NULL,

    salida_programada  DATETIME2(0)  NULL,
    salida_real        DATETIME2(0)  NULL,
    retorno_real       DATETIME2(0)  NULL,

    peso_kg            DECIMAL(12,2) NOT NULL CONSTRAINT DF_tms_viaje_kg  DEFAULT (0),
    volumen_m3         DECIMAL(10,2) NOT NULL CONSTRAINT DF_tms_viaje_m3  DEFAULT (0),
    total_paradas      INT           NOT NULL CONSTRAINT DF_tms_viaje_tot DEFAULT (0),
    paradas_entregadas INT           NOT NULL CONSTRAINT DF_tms_viaje_ent DEFAULT (0),

    observaciones      NVARCHAR(500) NULL,
    creado_por         VARCHAR(60)   NOT NULL CONSTRAINT DF_tms_viaje_por   DEFAULT (SUSER_SNAME()),
    fecha_creacion     DATETIME2(0)  NOT NULL CONSTRAINT DF_tms_viaje_fecha DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT CK_tms_viaje_estado CHECK (estado IN ('PLANIFICADO','ASIGNADO','EN_RUTA','ENTREGADO','LIQUIDADO','CANCELADO')),
    CONSTRAINT FK_tms_viaje_ruta   FOREIGN KEY (id_ruta)           REFERENCES dbo.tbl_gbp_tms_ruta(id_ruta),
    CONSTRAINT FK_tms_viaje_unidad FOREIGN KEY (id_unidad)         REFERENCES dbo.tbl_gbp_tms_unidad(id_unidad),
    CONSTRAINT FK_tms_viaje_piloto FOREIGN KEY (id_usuario_piloto) REFERENCES dbo.tbl_gbp_tms_usuario(id_usuario)
);
GO

-- El listado siempre filtra por rango de fechas y estado.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_viaje_fecha_estado')
CREATE INDEX IX_tms_viaje_fecha_estado ON dbo.tbl_gbp_tms_viaje(fecha DESC, estado)
    INCLUDE (numero, id_unidad, id_usuario_piloto, id_ruta, peso_kg);
GO

IF OBJECT_ID('dbo.tbl_gbp_tms_viaje_parada') IS NULL
CREATE TABLE dbo.tbl_gbp_tms_viaje_parada
(
    id_parada      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tms_viaje_parada PRIMARY KEY,
    id_viaje       INT           NOT NULL,
    secuencia      INT           NOT NULL,
    estado         VARCHAR(20)   NOT NULL CONSTRAINT DF_tms_parada_estado DEFAULT ('PENDIENTE'),

    sap_doc_entry  INT           NULL,
    sap_doc_num    INT           NULL,
    sap_obj_type   VARCHAR(5)    NULL,

    cliente_codigo VARCHAR(30)   NOT NULL,
    cliente_nombre NVARCHAR(150) NOT NULL,
    direccion      NVARCHAR(300) NULL,
    latitud        DECIMAL(10,8) NULL,
    longitud       DECIMAL(11,8) NULL,

    peso_kg        DECIMAL(12,2) NOT NULL CONSTRAINT DF_tms_parada_kg  DEFAULT (0),
    volumen_m3     DECIMAL(10,2) NOT NULL CONSTRAINT DF_tms_parada_m3  DEFAULT (0),
    monto          DECIMAL(14,2) NOT NULL CONSTRAINT DF_tms_parada_mto DEFAULT (0),

    ventana_desde  DATETIME2(0)  NULL,
    ventana_hasta  DATETIME2(0)  NULL,
    llegada_real   DATETIME2(0)  NULL,
    salida_real    DATETIME2(0)  NULL,

    motivo_rechazo NVARCHAR(200) NULL,
    receptor       NVARCHAR(120) NULL,
    observaciones  NVARCHAR(500) NULL,

    CONSTRAINT CK_tms_parada_estado CHECK (estado IN ('PENDIENTE','EN_SITIO','ENTREGADA','RECHAZADA','PARCIAL')),
    CONSTRAINT UQ_tms_parada_secuencia UNIQUE (id_viaje, secuencia),
    CONSTRAINT FK_tms_parada_viaje FOREIGN KEY (id_viaje) REFERENCES dbo.tbl_gbp_tms_viaje(id_viaje) ON DELETE CASCADE
);
GO

/* Una entrega de SAP no puede repetirse en dos viajes. Filtrado para no
   estorbar a las paradas creadas a mano, que no traen DocEntry. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_tms_parada_sap')
CREATE UNIQUE INDEX UX_tms_parada_sap ON dbo.tbl_gbp_tms_viaje_parada(sap_doc_entry) WHERE sap_doc_entry IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_parada_viaje')
CREATE INDEX IX_tms_parada_viaje ON dbo.tbl_gbp_tms_viaje_parada(id_viaje, secuencia);
GO

/* ============================================================
   DATOS INICIALES
   ============================================================ */

MERGE dbo.tbl_gbp_tms_rol AS d
USING (VALUES
    ('ADMIN',      N'Administrador del sistema', N'{"web":["*"],"mobile":["*"]}'),
    ('SUPERVISOR', N'Supervisor de flota',       N'{"web":["dashboard","reportes","usuarios_read"],"mobile":["tracking"]}'),
    ('PILOTO',     N'Transportista',             N'{"web":[],"mobile":["iniciar_turno","tracking","entregas","pod"]}'),
    ('DESPACHO',   N'Operador de despacho',      N'{"web":["rutas","asignaciones","unidades"],"mobile":[]}')
) AS o (nombre, descripcion, permisos_json)
ON d.nombre = o.nombre
WHEN NOT MATCHED THEN
    INSERT (nombre, descripcion, permisos_json) VALUES (o.nombre, o.descripcion, o.permisos_json);
GO

/* Usuario administrador inicial.
   Contraseña: 2388  (provisional)
   Hash PBKDF2-HMACSHA512 / 100 000 iteraciones, verificado contra
   Microsoft.AspNetCore.Identity.PasswordHasher antes de sembrarlo.
   debe_cambiar_password = 1: la API debe exigir el cambio al primer ingreso. */
IF NOT EXISTS (SELECT 1 FROM dbo.tbl_gbp_tms_usuario WHERE usuario = 'admin')
BEGIN
    INSERT INTO dbo.tbl_gbp_tms_usuario (usuario, nombre, password_hash, debe_cambiar_password)
    VALUES ('admin', N'Administrador',
            'AQAAAAIAAYagAAAAEBN4mAOcFY87XEKsZSkf1yDa+N2WBFlhLMj4IVi6hthV+yc9Ma2h9WFD4CLmN5yXzA==', 1);
END
GO

-- El admin se asigna su propio rol: es el único usuario que existe al arrancar.
IF NOT EXISTS (
    SELECT 1 FROM dbo.tbl_gbp_tms_usuario_rol ur
    JOIN dbo.tbl_gbp_tms_usuario u ON u.id_usuario = ur.id_usuario
    WHERE u.usuario = 'admin')
BEGIN
    DECLARE @id_admin INT = (SELECT id_usuario FROM dbo.tbl_gbp_tms_usuario WHERE usuario = 'admin');
    DECLARE @id_rol   INT = (SELECT id_rol     FROM dbo.tbl_gbp_tms_rol     WHERE nombre  = 'ADMIN');

    INSERT INTO dbo.tbl_gbp_tms_usuario_rol (id_usuario, id_rol, asignado_por)
    VALUES (@id_admin, @id_rol, @id_admin);
END
GO

/* ============================================================
   RESULTADO
   ============================================================ */

SELECT Tabla = t.name,
       Filas = SUM(p.rows)
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
WHERE t.name LIKE 'tbl_gbp_tms_%'
GROUP BY t.name
ORDER BY t.name;
GO

SET NOEXEC OFF;
GO
