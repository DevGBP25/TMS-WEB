/* ============================================================
   GBP · TMS — módulo de entregas: esquema
   Ejecutar CONECTADO A DataTMS.

   Crea tbl_gbp_tms_entrega y retira tbl_gbp_tms_viaje_parada.

   Por qué se reemplaza la tabla anterior: viaje_parada exigía
   id_viaje NOT NULL, es decir que una entrega sólo podía existir
   dentro de un viaje. En la operación real una entrega recién
   traída de SAP existe sin viaje, esperando a que el supervisor
   la asigne. Esa es la corrección del análisis (cardinalidad
   0..1) y no se puede expresar sobre la tabla vieja.

   Es idempotente: puede correrse varias veces.
   ============================================================ */

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO

DECLARE @bd sysname = DB_NAME();
IF @bd <> 'DataTMS'
BEGIN
    RAISERROR('Ejecute este script conectado a DataTMS. Base actual: %s', 16, 1, @bd);
    SET NOEXEC ON;
END
GO

/* ============================================================
   1. Retiro de tbl_gbp_tms_viaje_parada

   Sólo se elimina si está vacía. Si tuviera filas, el script se
   detiene: esos datos habría que migrarlos a mano y nadie quiere
   descubrir que se perdieron después.
   ============================================================ */

IF OBJECT_ID('dbo.tbl_gbp_tms_viaje_parada') IS NOT NULL
BEGIN
    DECLARE @filas INT;
    SELECT @filas = COUNT(*) FROM dbo.tbl_gbp_tms_viaje_parada;

    IF @filas > 0
    BEGIN
        RAISERROR('tbl_gbp_tms_viaje_parada tiene %d fila(s). Revise y migre antes de continuar.', 16, 1, @filas);
        SET NOEXEC ON;
    END
    ELSE
    BEGIN
        DROP TABLE dbo.tbl_gbp_tms_viaje_parada;
        PRINT '>> tbl_gbp_tms_viaje_parada eliminada (estaba vacía).';
    END
END
GO

/* ============================================================
   2. Ajuste de tbl_gbp_tms_viaje

   Los contadores hablaban de "paradas"; ahora el módulo habla de
   entregas. Se renombran para que la columna diga lo que guarda.
   ============================================================ */

IF COL_LENGTH('dbo.tbl_gbp_tms_viaje', 'total_paradas') IS NOT NULL
   AND COL_LENGTH('dbo.tbl_gbp_tms_viaje', 'total_entregas') IS NULL
BEGIN
    EXEC sp_rename 'dbo.tbl_gbp_tms_viaje.total_paradas', 'total_entregas', 'COLUMN';
    PRINT '>> viaje.total_paradas renombrada a total_entregas.';
END
GO

IF COL_LENGTH('dbo.tbl_gbp_tms_viaje', 'paradas_entregadas') IS NOT NULL
   AND COL_LENGTH('dbo.tbl_gbp_tms_viaje', 'entregas_completadas') IS NULL
BEGIN
    EXEC sp_rename 'dbo.tbl_gbp_tms_viaje.paradas_entregadas', 'entregas_completadas', 'COLUMN';
    PRINT '>> viaje.paradas_entregadas renombrada a entregas_completadas.';
END
GO

/* ============================================================
   3. tbl_gbp_tms_entrega

   Una fila por documento de entrega de SAP (ODLN). No se baja el
   detalle de artículos: la unidad de decisión logística es el
   documento completo, no la línea.
   ============================================================ */

/* Puede haber quedado una tabla con este nombre y otra estructura de algún
   intento anterior. Se reconoce porque le falta fecha_documento. Si está
   vacía se reemplaza; si tiene datos, el script se detiene: decidir qué
   hacer con esas filas no es cosa de un script. */
IF OBJECT_ID('dbo.tbl_gbp_tms_entrega', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.tbl_gbp_tms_entrega', 'fecha_documento') IS NULL
BEGIN
    DECLARE @previas INT;
    SELECT @previas = COUNT(*) FROM dbo.tbl_gbp_tms_entrega;

    PRINT '>> Se encontró una tbl_gbp_tms_entrega anterior con estas columnas:';
    DECLARE @cols NVARCHAR(MAX);
    SELECT @cols = STRING_AGG(name, ', ') WITHIN GROUP (ORDER BY column_id)
    FROM sys.columns WHERE object_id = OBJECT_ID('dbo.tbl_gbp_tms_entrega');
    PRINT '   ' + ISNULL(@cols, '(ninguna)');

    IF @previas > 0
    BEGIN
        RAISERROR('Esa tabla tiene %d fila(s). Revísela y elimínela a mano antes de continuar.', 16, 1, @previas);
        SET NOEXEC ON;
    END
    ELSE
    BEGIN
        DROP TABLE dbo.tbl_gbp_tms_entrega;
        PRINT '>> Estaba vacía: se elimina y se crea con la estructura correcta.';
    END
END
GO

/* Un nombre ocupado por una vista o un sinónimo no lo resuelve un DROP TABLE. */
IF OBJECT_ID('dbo.tbl_gbp_tms_entrega') IS NOT NULL
   AND OBJECT_ID('dbo.tbl_gbp_tms_entrega', 'U') IS NULL
BEGIN
    RAISERROR('El nombre tbl_gbp_tms_entrega está ocupado por un objeto que no es una tabla.', 16, 1);
    SET NOEXEC ON;
END
GO

IF OBJECT_ID('dbo.tbl_gbp_tms_entrega') IS NULL
CREATE TABLE dbo.tbl_gbp_tms_entrega
(
    id_entrega           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tms_entrega PRIMARY KEY,

    /* --- identidad en SAP --- */
    sap_doc_entry        INT           NOT NULL,   -- clave interna: por aquí se sincroniza
    sap_doc_num          INT           NOT NULL,   -- número de boleta que lleva el piloto
    sap_orden_venta      INT           NULL,       -- ORDR.DocNum, lo que el cliente pregunta
    sap_factura_num      INT           NULL,       -- OINV.DocNum, nulo hasta que facturen

    /* --- destino --- */
    cliente_codigo       VARCHAR(30)   NOT NULL,
    cliente_nombre       NVARCHAR(150) NOT NULL,
    direccion            NVARCHAR(300) NULL,
    municipio            NVARCHAR(80)  NULL,

    /* --- carga --- */
    peso_kg              DECIMAL(12,3) NOT NULL CONSTRAINT DF_tms_entrega_kg    DEFAULT (0),
    monto                DECIMAL(18,2) NOT NULL CONSTRAINT DF_tms_entrega_monto DEFAULT (0),
    fecha_documento      DATE          NOT NULL,

    /* --- situación dentro del TMS --- */
    estado               VARCHAR(20)   NOT NULL CONSTRAINT DF_tms_entrega_estado DEFAULT ('SIN_FACTURA'),
    id_viaje             INT           NULL,
    secuencia            INT           NULL,       -- orden de visita dentro del viaje

    /* --- resultado, lo escribirá el TMS Móvil --- */
    receptor             NVARCHAR(120) NULL,
    motivo_rechazo       NVARCHAR(200) NULL,
    entregada_en         DATETIME2(0)  NULL,

    observaciones        NVARCHAR(500) NULL,
    fecha_sincronizacion DATETIME2(0)  NOT NULL CONSTRAINT DF_tms_entrega_sync  DEFAULT (SYSUTCDATETIME()),
    fecha_creacion       DATETIME2(0)  NOT NULL CONSTRAINT DF_tms_entrega_fecha DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT CK_tms_entrega_estado CHECK (estado IN
        ('SIN_FACTURA','PENDIENTE','ASIGNADA','EN_RUTA','ENTREGADA','RECHAZADA','ANULADA')),

    /* Sin factura no sale mercadería. La regla vive en el motor y no
       sólo en la pantalla, para que ningún camino la esquive. */
    CONSTRAINT CK_tms_entrega_factura CHECK (id_viaje IS NULL OR sap_factura_num IS NOT NULL),

    /* El estado y la pertenencia a un viaje no pueden contradecirse. */
    CONSTRAINT CK_tms_entrega_viaje CHECK (
           (estado IN ('SIN_FACTURA','PENDIENTE')                        AND id_viaje IS NULL)
        OR (estado IN ('ASIGNADA','EN_RUTA','ENTREGADA','RECHAZADA')     AND id_viaje IS NOT NULL)
        OR (estado = 'ANULADA')
    ),

    CONSTRAINT FK_tms_entrega_viaje FOREIGN KEY (id_viaje)
        REFERENCES dbo.tbl_gbp_tms_viaje(id_viaje)
);
GO

/* Lo que convierte una sincronización repetida en actualización en vez
   de duplicado. Es la regla más importante de la tabla. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_tms_entrega_docentry')
CREATE UNIQUE INDEX UX_tms_entrega_docentry
    ON dbo.tbl_gbp_tms_entrega(sap_doc_entry);
GO

/* La pantalla del supervisor pide siempre lo mismo: lo que está
   pendiente, ordenado por fecha. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_entrega_estado_fecha')
CREATE INDEX IX_tms_entrega_estado_fecha
    ON dbo.tbl_gbp_tms_entrega(estado, fecha_documento DESC)
    INCLUDE (sap_doc_num, cliente_nombre, municipio, peso_kg, monto, id_viaje);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_entrega_viaje')
CREATE INDEX IX_tms_entrega_viaje
    ON dbo.tbl_gbp_tms_entrega(id_viaje, secuencia)
    WHERE id_viaje IS NOT NULL;
GO

/* ============================================================
   4. Tipos de tabla para las operaciones en lote

   Sincronizar y asignar trabajan sobre conjuntos. Pasarlos como
   un parámetro de tabla evita mandar una llamada por fila y deja
   toda la operación dentro de una sola transacción.
   ============================================================ */

IF TYPE_ID('dbo.tp_gbp_tms_entrega_sap') IS NULL
CREATE TYPE dbo.tp_gbp_tms_entrega_sap AS TABLE
(
    sap_doc_entry   INT           NOT NULL PRIMARY KEY,
    sap_doc_num     INT           NOT NULL,
    sap_orden_venta INT           NULL,
    sap_factura_num INT           NULL,
    cliente_codigo  VARCHAR(30)   NOT NULL,
    cliente_nombre  NVARCHAR(150) NOT NULL,
    direccion       NVARCHAR(300) NULL,
    municipio       NVARCHAR(80)  NULL,
    peso_kg         DECIMAL(12,3) NOT NULL,
    monto           DECIMAL(18,2) NOT NULL,
    fecha_documento DATE          NOT NULL,
    anulada         BIT           NOT NULL
);
GO

IF TYPE_ID('dbo.tp_gbp_tms_id') IS NULL
CREATE TYPE dbo.tp_gbp_tms_id AS TABLE
(
    id INT NOT NULL PRIMARY KEY
);
GO

/* ============================================================
   5. Comprobación final

   Sin esto el script imprime "listo" aunque un paso intermedio
   haya fallado, que fue justo lo que pasó la primera vez.
   ============================================================ */

DECLARE @faltan NVARCHAR(500) = '';

IF OBJECT_ID('dbo.tbl_gbp_tms_entrega', 'U') IS NULL
    SET @faltan += 'tabla tbl_gbp_tms_entrega; ';

IF COL_LENGTH('dbo.tbl_gbp_tms_entrega', 'fecha_documento') IS NULL
    SET @faltan += 'columna fecha_documento; ';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_tms_entrega_docentry')
    SET @faltan += 'índice UX_tms_entrega_docentry; ';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_entrega_estado_fecha')
    SET @faltan += 'índice IX_tms_entrega_estado_fecha; ';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_entrega_viaje')
    SET @faltan += 'índice IX_tms_entrega_viaje; ';

IF TYPE_ID('dbo.tp_gbp_tms_entrega_sap') IS NULL
    SET @faltan += 'tipo tp_gbp_tms_entrega_sap; ';

IF TYPE_ID('dbo.tp_gbp_tms_id') IS NULL
    SET @faltan += 'tipo tp_gbp_tms_id; ';

IF OBJECT_ID('dbo.tbl_gbp_tms_viaje_parada') IS NOT NULL
    SET @faltan += 'tbl_gbp_tms_viaje_parada sigue existiendo; ';

IF COL_LENGTH('dbo.tbl_gbp_tms_viaje', 'total_entregas') IS NULL
    SET @faltan += 'columna viaje.total_entregas; ';

IF @faltan <> ''
BEGIN
    RAISERROR('El esquema quedó incompleto. Falta: %s', 16, 1, @faltan);
END
ELSE
BEGIN
    PRINT '';
    PRINT '>> Esquema del módulo de entregas listo y verificado.';
    PRINT '   Siguiente: 06_procedimientos_entregas.sql';
END
GO
