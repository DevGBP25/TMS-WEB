/* ============================================================
   GBP · TMS — esquema inicial
   Ejecutar sobre la base BD_Tms. Es idempotente: puede correrse
   varias veces sin duplicar objetos.
   ============================================================ */

-- sqlcmd abre la sesión con QUOTED_IDENTIFIER OFF y los índices filtrados lo exigen ON.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF DB_NAME() NOT LIKE '%Tms%'
BEGIN
    RAISERROR('Ejecute este script sobre la base del TMS (BD_Tms).', 16, 1);
    SET NOEXEC ON;
END
GO

/* ---------- Catálogos ---------- */

IF OBJECT_ID('dbo.TmsRuta') IS NULL
CREATE TABLE dbo.TmsRuta
(
    RutaId       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TmsRuta PRIMARY KEY,
    Codigo       VARCHAR(20)   NOT NULL,
    Nombre       NVARCHAR(120) NOT NULL,
    Departamento NVARCHAR(60)  NULL,
    Municipio    NVARCHAR(60)  NULL,
    DistanciaKm  DECIMAL(10,2) NOT NULL CONSTRAINT DF_TmsRuta_Km  DEFAULT (0),
    DuracionMin  INT           NOT NULL CONSTRAINT DF_TmsRuta_Min DEFAULT (0),
    Activo       BIT           NOT NULL CONSTRAINT DF_TmsRuta_Act DEFAULT (1),
    CONSTRAINT UQ_TmsRuta_Codigo UNIQUE (Codigo)
);
GO

IF OBJECT_ID('dbo.TmsPiloto') IS NULL
CREATE TABLE dbo.TmsPiloto
(
    PilotoId      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TmsPiloto PRIMARY KEY,
    Codigo        VARCHAR(20)   NOT NULL,
    Nombre        NVARCHAR(120) NOT NULL,
    Dpi           VARCHAR(20)   NULL,
    Licencia      VARCHAR(30)   NULL,
    TipoLicencia  VARCHAR(5)    NULL,
    LicenciaVence DATE          NULL,
    Telefono      VARCHAR(20)   NULL,
    Activo        BIT           NOT NULL CONSTRAINT DF_TmsPiloto_Act DEFAULT (1),
    CONSTRAINT UQ_TmsPiloto_Codigo UNIQUE (Codigo)
);
GO

IF OBJECT_ID('dbo.TmsUnidad') IS NULL
CREATE TABLE dbo.TmsUnidad
(
    UnidadId      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TmsUnidad PRIMARY KEY,
    Codigo        VARCHAR(20)   NOT NULL,
    Placa         VARCHAR(15)   NOT NULL,
    Marca         NVARCHAR(40)  NULL,
    Modelo        NVARCHAR(40)  NULL,
    Tipo          NVARCHAR(40)  NULL,
    CapacidadKg   DECIMAL(12,2) NOT NULL CONSTRAINT DF_TmsUnidad_Kg DEFAULT (0),
    CapacidadM3   DECIMAL(10,2) NOT NULL CONSTRAINT DF_TmsUnidad_M3 DEFAULT (0),
    -- 1 Disponible · 2 EnRuta · 3 Mantenimiento · 4 FueraServicio
    Estado        TINYINT       NOT NULL CONSTRAINT DF_TmsUnidad_Est DEFAULT (1),
    Transportista NVARCHAR(120) NULL,
    Activo        BIT           NOT NULL CONSTRAINT DF_TmsUnidad_Act DEFAULT (1),
    CONSTRAINT UQ_TmsUnidad_Codigo UNIQUE (Codigo),
    CONSTRAINT UQ_TmsUnidad_Placa  UNIQUE (Placa)
);
GO

/* ---------- Operación ---------- */

IF OBJECT_ID('dbo.TmsViaje') IS NULL
CREATE TABLE dbo.TmsViaje
(
    ViajeId           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TmsViaje PRIMARY KEY,
    Numero            VARCHAR(20)   NOT NULL,
    Fecha             DATE          NOT NULL,
    -- 1 Planificado · 2 Asignado · 3 EnRuta · 4 Entregado · 5 Liquidado · 99 Cancelado
    Estado            TINYINT       NOT NULL CONSTRAINT DF_TmsViaje_Est DEFAULT (1),
    RutaId            INT           NULL CONSTRAINT FK_TmsViaje_Ruta   REFERENCES dbo.TmsRuta(RutaId),
    UnidadId          INT           NULL CONSTRAINT FK_TmsViaje_Unidad REFERENCES dbo.TmsUnidad(UnidadId),
    PilotoId          INT           NULL CONSTRAINT FK_TmsViaje_Piloto REFERENCES dbo.TmsPiloto(PilotoId),
    SalidaProgramada  DATETIME2(0)  NULL,
    SalidaReal        DATETIME2(0)  NULL,
    RetornoReal       DATETIME2(0)  NULL,
    PesoKg            DECIMAL(12,2) NOT NULL CONSTRAINT DF_TmsViaje_Kg DEFAULT (0),
    VolumenM3         DECIMAL(10,2) NOT NULL CONSTRAINT DF_TmsViaje_M3 DEFAULT (0),
    TotalParadas      INT           NOT NULL CONSTRAINT DF_TmsViaje_Tot DEFAULT (0),
    ParadasEntregadas INT           NOT NULL CONSTRAINT DF_TmsViaje_Ent DEFAULT (0),
    Observaciones     NVARCHAR(500) NULL,
    CreadoPor         VARCHAR(60)   NOT NULL CONSTRAINT DF_TmsViaje_Por DEFAULT (SUSER_SNAME()),
    CreadoEn          DATETIME2(0)  NOT NULL CONSTRAINT DF_TmsViaje_En  DEFAULT (SYSDATETIME()),
    CONSTRAINT UQ_TmsViaje_Numero UNIQUE (Numero)
);
GO

-- El listado siempre filtra por rango de fechas y estado.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TmsViaje_Fecha_Estado')
CREATE INDEX IX_TmsViaje_Fecha_Estado ON dbo.TmsViaje (Fecha DESC, Estado)
    INCLUDE (Numero, UnidadId, PilotoId, RutaId);
GO

IF OBJECT_ID('dbo.TmsViajeParada') IS NULL
CREATE TABLE dbo.TmsViajeParada
(
    ParadaId      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TmsViajeParada PRIMARY KEY,
    ViajeId       INT           NOT NULL
        CONSTRAINT FK_TmsParada_Viaje REFERENCES dbo.TmsViaje(ViajeId) ON DELETE CASCADE,
    Secuencia     INT           NOT NULL,
    -- 1 Pendiente · 2 EnSitio · 3 Entregada · 4 Rechazada · 5 Parcial
    Estado        TINYINT       NOT NULL CONSTRAINT DF_TmsParada_Est DEFAULT (1),
    SapDocEntry   INT           NULL,
    SapDocNum     INT           NULL,
    SapObjType    VARCHAR(5)    NULL,
    ClienteCodigo VARCHAR(30)   NOT NULL,
    ClienteNombre NVARCHAR(150) NOT NULL,
    Direccion     NVARCHAR(300) NULL,
    Latitud       DECIMAL(9,6)  NULL,
    Longitud      DECIMAL(9,6)  NULL,
    PesoKg        DECIMAL(12,2) NOT NULL CONSTRAINT DF_TmsParada_Kg DEFAULT (0),
    VolumenM3     DECIMAL(10,2) NOT NULL CONSTRAINT DF_TmsParada_M3 DEFAULT (0),
    Monto         DECIMAL(14,2) NOT NULL CONSTRAINT DF_TmsParada_Mto DEFAULT (0),
    VentanaDesde  DATETIME2(0)  NULL,
    VentanaHasta  DATETIME2(0)  NULL,
    LlegadaReal   DATETIME2(0)  NULL,
    SalidaReal    DATETIME2(0)  NULL,
    MotivoRechazo NVARCHAR(200) NULL,
    Receptor      NVARCHAR(120) NULL,
    Observaciones NVARCHAR(500) NULL,
    CONSTRAINT UQ_TmsParada_Secuencia UNIQUE (ViajeId, Secuencia)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TmsParada_Viaje')
CREATE INDEX IX_TmsParada_Viaje ON dbo.TmsViajeParada (ViajeId, Secuencia);
GO

-- Una entrega de SAP no puede repetirse en dos viajes: el índice filtrado
-- ignora las paradas sin DocEntry (entregas manuales).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_TmsParada_SapDocEntry')
CREATE UNIQUE INDEX UX_TmsParada_SapDocEntry ON dbo.TmsViajeParada (SapDocEntry)
    WHERE SapDocEntry IS NOT NULL;
GO

SET NOEXEC OFF;
GO
