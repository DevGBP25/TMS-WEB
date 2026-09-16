/* ============================================================
   GBP · TMS — la boleta se asigna desde la orden de venta
   Ejecutar CONECTADO A DataTMS, después de 10.

   Cambio de modelo. Hasta ahora una fila nacía de la entrega de
   SAP y exigía factura, porque se asignaba el mismo día del
   despacho. La operación real arma los viajes uno o más días
   antes: cuando el supervisor reparte, la orden todavía no tiene
   entrega ni factura.

   Así que la identidad de la fila pasa a ser la orden de venta,
   y los datos de la entrega y de la factura se llenan cuando SAP
   los genera. La regla de "sin factura no sale mercadería" no
   desaparece: se mueve del momento de asignar al momento de
   despachar, que es cuando la mercadería de verdad sale.

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

IF OBJECT_ID('dbo.tbl_gbp_tms_entrega', 'U') IS NULL
BEGIN
    RAISERROR('Falta tbl_gbp_tms_entrega. Ejecute antes 05_entregas.sql.', 16, 1);
    SET NOEXEC ON;
END
GO

/* ------------------------------------------------------------
   1. Columnas nuevas

   La orden pasa a ser la identidad; la hora y la fecha de
   entrega vienen del documento y se muestran en el listado.
   ------------------------------------------------------------ */

IF COL_LENGTH('dbo.tbl_gbp_tms_entrega', 'sap_orden_doc_entry') IS NULL
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega ADD sap_orden_doc_entry INT NULL;
    PRINT '>> entrega.sap_orden_doc_entry agregada (clave interna de la orden).';
END
GO

/* DocDate trae sólo la fecha; la hora del documento viaja aparte en DocTime. */
IF COL_LENGTH('dbo.tbl_gbp_tms_entrega', 'hora_documento') IS NULL
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega ADD hora_documento TIME(0) NULL;
    PRINT '>> entrega.hora_documento agregada.';
END
GO

/* La fecha comprometida con el cliente: DocDueDate de la orden. */
IF COL_LENGTH('dbo.tbl_gbp_tms_entrega', 'fecha_entrega') IS NULL
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega ADD fecha_entrega DATE NULL;
    PRINT '>> entrega.fecha_entrega agregada.';
END
GO

/* ------------------------------------------------------------
   2. Lo que antes era obligatorio deja de serlo

   Los índices que mencionan estas columnas —aunque sea como
   columnas incluidas— impiden alterarlas, así que se retiran y
   se rehacen al final.
   ------------------------------------------------------------ */

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_tms_entrega_factura')
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega DROP CONSTRAINT CK_tms_entrega_factura;
    PRINT '>> CK_tms_entrega_factura retirada para rehacerla sobre el despacho.';
END
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_tms_entrega_docentry')
    DROP INDEX UX_tms_entrega_docentry ON dbo.tbl_gbp_tms_entrega;
GO
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_entrega_estado_fecha')
    DROP INDEX IX_tms_entrega_estado_fecha ON dbo.tbl_gbp_tms_entrega;
GO
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_entrega_piloto')
    DROP INDEX IX_tms_entrega_piloto ON dbo.tbl_gbp_tms_entrega;
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.tbl_gbp_tms_entrega')
             AND name = 'sap_doc_entry' AND is_nullable = 0)
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega ALTER COLUMN sap_doc_entry INT NULL;
    PRINT '>> sap_doc_entry ahora admite nulo: la entrega puede no existir todavía.';
END
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.tbl_gbp_tms_entrega')
             AND name = 'sap_doc_num' AND is_nullable = 0)
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega ALTER COLUMN sap_doc_num INT NULL;
    PRINT '>> sap_doc_num ahora admite nulo.';
END
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.tbl_gbp_tms_entrega')
             AND name = 'sap_factura_num' AND is_nullable = 0)
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega ALTER COLUMN sap_factura_num INT NULL;
    PRINT '>> sap_factura_num ahora admite nulo: la factura llega después.';
END
GO

/* Las filas que ya existían nacieron de una entrega, cuando la fecha
   comprometida no se guardaba. Se rellena con la del documento para que
   la columna no salga vacía en el listado. */
UPDATE dbo.tbl_gbp_tms_entrega
SET fecha_entrega = fecha_documento
WHERE fecha_entrega IS NULL;
GO

/* ------------------------------------------------------------
   3. Índices

   Los únicos pasan a ser filtrados: en una columna que admite
   nulo, dos nulos cuentan como duplicado.
   ------------------------------------------------------------ */

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_tms_entrega_docentry')
CREATE UNIQUE INDEX UX_tms_entrega_docentry
    ON dbo.tbl_gbp_tms_entrega(sap_doc_entry)
    WHERE sap_doc_entry IS NOT NULL;
GO

/* Una orden se reparte una sola vez. Es la regla que sustituye a la
   anterior sobre la entrega. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_tms_entrega_orden')
CREATE UNIQUE INDEX UX_tms_entrega_orden
    ON dbo.tbl_gbp_tms_entrega(sap_orden_doc_entry)
    WHERE sap_orden_doc_entry IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_entrega_estado_fecha')
CREATE INDEX IX_tms_entrega_estado_fecha
    ON dbo.tbl_gbp_tms_entrega(estado, fecha_documento DESC)
    INCLUDE (sap_doc_num, sap_orden_venta, cliente_nombre, municipio, id_viaje);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_entrega_piloto')
CREATE INDEX IX_tms_entrega_piloto
    ON dbo.tbl_gbp_tms_entrega(id_usuario_piloto, fecha_documento DESC)
    INCLUDE (sap_doc_num, sap_orden_venta, cliente_nombre, estado, id_viaje);
GO

/* Las boletas que esperan que SAP genere su entrega: es exactamente la
   consulta del procedimiento que las vincula. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_entrega_sin_boleta')
CREATE INDEX IX_tms_entrega_sin_boleta
    ON dbo.tbl_gbp_tms_entrega(cliente_codigo, fecha_documento)
    INCLUDE (sap_orden_doc_entry, sap_orden_venta)
    WHERE sap_doc_entry IS NULL;
GO

/* ------------------------------------------------------------
   4. Las reglas

   La factura ya no condiciona la asignación, sino la salida.
   ------------------------------------------------------------ */

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_tms_entrega_factura')
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega
        ADD CONSTRAINT CK_tms_entrega_factura CHECK (
            estado NOT IN ('EN_RUTA','ENTREGADA') OR sap_factura_num IS NOT NULL);
    PRINT '>> CK_tms_entrega_factura recreada: sin factura no sale, pero sí se planifica.';
END
GO

/* Una fila tiene que apuntar a algo en SAP: a la orden, a la entrega, o a
   ambas una vez vinculadas. */
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_tms_entrega_documento')
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega
        ADD CONSTRAINT CK_tms_entrega_documento CHECK (
            sap_orden_doc_entry IS NOT NULL OR sap_doc_entry IS NOT NULL);
    PRINT '>> CK_tms_entrega_documento creada.';
END
GO

/* ------------------------------------------------------------
   5. Tipos de tabla

   Cambian de forma, y un tipo no se altera: hay que soltar los
   procedimientos que lo usan antes de rehacerlo.
   ------------------------------------------------------------ */

IF OBJECT_ID('dbo.usp_gbp_tms_entrega_asignar_piloto', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_gbp_tms_entrega_asignar_piloto;
GO
IF OBJECT_ID('dbo.usp_gbp_tms_entrega_vincular', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_gbp_tms_entrega_vincular;
GO

IF TYPE_ID('dbo.tp_gbp_tms_entrega_asignar') IS NOT NULL
    DROP TYPE dbo.tp_gbp_tms_entrega_asignar;
GO

CREATE TYPE dbo.tp_gbp_tms_entrega_asignar AS TABLE
(
    /* La orden manda: es lo único que existe con seguridad al asignar. */
    sap_orden_doc_entry INT           NOT NULL PRIMARY KEY,
    sap_orden_venta     INT           NOT NULL,

    /* De la entrega, si SAP ya la generó. */
    sap_doc_entry       INT           NULL,
    sap_doc_num         INT           NULL,
    sap_factura_num     INT           NULL,

    cliente_codigo      VARCHAR(30)   NOT NULL,
    cliente_nombre      NVARCHAR(150) NOT NULL,
    direccion           NVARCHAR(300) NULL,
    municipio           NVARCHAR(80)  NULL,
    peso_kg             DECIMAL(12,3) NOT NULL,
    monto               DECIMAL(18,2) NOT NULL,
    fecha_documento     DATE          NOT NULL,
    hora_documento      TIME(0)       NULL,
    fecha_entrega       DATE          NULL
);
GO

/* Las líneas ahora llegan de la orden, así que cuelgan de ella. */
IF TYPE_ID('dbo.tp_gbp_tms_entrega_linea') IS NOT NULL
    DROP TYPE dbo.tp_gbp_tms_entrega_linea;
GO

CREATE TYPE dbo.tp_gbp_tms_entrega_linea AS TABLE
(
    sap_orden_doc_entry INT           NOT NULL,
    linea_num           INT           NOT NULL,
    codigo_articulo     VARCHAR(50)   NOT NULL,
    codigo_barras       VARCHAR(50)   NULL,
    descripcion         NVARCHAR(200) NOT NULL,
    cantidad            DECIMAL(18,4) NOT NULL,
    unidad              NVARCHAR(30)  NULL,
    almacen             VARCHAR(20)   NULL,
    PRIMARY KEY (sap_orden_doc_entry, linea_num)
);
GO

/* Lo que se vincula después: la entrega que SAP terminó generando y su
   factura, para un lote de boletas. */
IF TYPE_ID('dbo.tp_gbp_tms_entrega_vinculo') IS NOT NULL
    DROP TYPE dbo.tp_gbp_tms_entrega_vinculo;
GO

CREATE TYPE dbo.tp_gbp_tms_entrega_vinculo AS TABLE
(
    sap_orden_doc_entry INT NOT NULL PRIMARY KEY,
    sap_doc_entry       INT NOT NULL,
    sap_doc_num         INT NOT NULL,
    sap_factura_num     INT NULL,
    anulada             BIT NOT NULL
);
GO

/* ------------------------------------------------------------
   6. Comprobación
   ------------------------------------------------------------ */

DECLARE @faltan NVARCHAR(600) = '';

IF COL_LENGTH('dbo.tbl_gbp_tms_entrega', 'sap_orden_doc_entry') IS NULL
    SET @faltan += 'columna sap_orden_doc_entry; ';
IF COL_LENGTH('dbo.tbl_gbp_tms_entrega', 'hora_documento') IS NULL
    SET @faltan += 'columna hora_documento; ';
IF COL_LENGTH('dbo.tbl_gbp_tms_entrega', 'fecha_entrega') IS NULL
    SET @faltan += 'columna fecha_entrega; ';
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.tbl_gbp_tms_entrega')
             AND name IN ('sap_doc_entry','sap_doc_num','sap_factura_num')
             AND is_nullable = 0)
    SET @faltan += 'columnas de la entrega todavía obligatorias; ';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_tms_entrega_orden')
    SET @faltan += 'UX_tms_entrega_orden; ';
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_tms_entrega_factura')
    SET @faltan += 'CK_tms_entrega_factura; ';
IF TYPE_ID('dbo.tp_gbp_tms_entrega_asignar') IS NULL
    SET @faltan += 'tipo tp_gbp_tms_entrega_asignar; ';
IF TYPE_ID('dbo.tp_gbp_tms_entrega_vinculo') IS NULL
    SET @faltan += 'tipo tp_gbp_tms_entrega_vinculo; ';

IF @faltan <> ''
    RAISERROR('Quedó incompleto. Falta: %s', 16, 1, @faltan);
ELSE
BEGIN
    PRINT '';
    PRINT '>> La boleta ya se asigna desde la orden de venta.';
    PRINT '   Siguiente: 12_procedimientos_entregas.sql';
END
GO
