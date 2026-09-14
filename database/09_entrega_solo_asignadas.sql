/* ============================================================
   GBP · TMS — la entrega se guarda al asignar, no al sincronizar
   Ejecutar CONECTADO A DataTMS, después de 08.

   Cambio de enfoque: hasta ahora se volcaban a la tabla todas
   las boletas de SAP, asignadas o no. Eso llenaba la base de
   documentos que quizá nunca se reparten y obligaba a insertar
   cientos de filas en cada sincronización.

   Ahora la lista de boletas disponibles es una VISTA en vivo
   sobre SAP: no se guarda nada. La fila en tbl_gbp_tms_entrega
   nace en el momento en que el supervisor le asigna un piloto,
   con los datos del documento y sus productos congelados en ese
   instante. Liberar una boleta borra la fila: vuelve a ser una
   línea de la vista de SAP.

   Consecuencias en la tabla:
   · id_usuario_piloto y sap_factura_num pasan a ser obligatorios.
   · Los estados SIN_FACTURA y PENDIENTE desaparecen: describían
     boletas que ahora ni siquiera se guardan.

   Es idempotente.
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
    RAISERROR('Falta tbl_gbp_tms_entrega. Ejecute antes 05 y 08.', 16, 1);
    SET NOEXEC ON;
END
GO

/* ------------------------------------------------------------
   1. Fuera las boletas que nunca se asignaron

   Son justo las que el nuevo enfoque ya no guarda. Las que sí
   tienen piloto se quedan: esas el TMS las administra.
   ------------------------------------------------------------ */

DECLARE @sobrantes INT;
SELECT @sobrantes = COUNT(*) FROM dbo.tbl_gbp_tms_entrega WHERE id_usuario_piloto IS NULL;

IF @sobrantes > 0
BEGIN
    DELETE FROM dbo.tbl_gbp_tms_entrega WHERE id_usuario_piloto IS NULL;
    PRINT CONCAT('>> ', @sobrantes, ' boleta(s) sin piloto eliminadas: ahora se leen de SAP.');
END
ELSE
    PRINT '>> No había boletas sin piloto que eliminar.';
GO

/* ------------------------------------------------------------
   2. Los productos de la boleta

   Se guardan al asignar, no se consultan a SAP cada vez: lo que
   el piloto lleva en el camión es lo que decía el documento en
   ese momento, y así la aplicación móvil no depende del Service
   Layer para mostrar la carga.
   ------------------------------------------------------------ */

IF OBJECT_ID('dbo.tbl_gbp_tms_entrega_linea', 'U') IS NULL
CREATE TABLE dbo.tbl_gbp_tms_entrega_linea
(
    id_linea        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tms_entrega_linea PRIMARY KEY,
    id_entrega      INT           NOT NULL,
    linea_num       INT           NOT NULL,

    codigo_articulo VARCHAR(50)   NOT NULL,
    /* SAP antepone el código de barras a la descripción separado por "|".
       Se guarda aparte en vez de descartarlo: al escanear en la app móvil
       va a hacer falta. */
    codigo_barras   VARCHAR(50)   NULL,
    descripcion     NVARCHAR(200) NOT NULL,

    cantidad        DECIMAL(18,4) NOT NULL CONSTRAINT DF_tms_linea_cant DEFAULT (0),
    unidad          NVARCHAR(30)  NULL,
    almacen         VARCHAR(20)   NULL,

    CONSTRAINT UQ_tms_entrega_linea UNIQUE (id_entrega, linea_num),
    CONSTRAINT FK_tms_entrega_linea FOREIGN KEY (id_entrega)
        REFERENCES dbo.tbl_gbp_tms_entrega(id_entrega) ON DELETE CASCADE
);
GO

/* ------------------------------------------------------------
   3. La tabla se ajusta al nuevo enfoque
   ------------------------------------------------------------ */

-- Las restricciones que mencionan las columnas se retiran antes de alterarlas.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_tms_entrega_asignacion')
    ALTER TABLE dbo.tbl_gbp_tms_entrega DROP CONSTRAINT CK_tms_entrega_asignacion;
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_tms_entrega_factura')
    ALTER TABLE dbo.tbl_gbp_tms_entrega DROP CONSTRAINT CK_tms_entrega_factura;
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_tms_entrega_estado')
    ALTER TABLE dbo.tbl_gbp_tms_entrega DROP CONSTRAINT CK_tms_entrega_estado;
GO

/* El índice sobre la columna impide alterarla, así que se retira y se
   rehace después. De paso pierde el filtro: con la columna obligatoria,
   "WHERE id_usuario_piloto IS NOT NULL" ya no excluye nada. */
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_entrega_piloto')
    DROP INDEX IX_tms_entrega_piloto ON dbo.tbl_gbp_tms_entrega;
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.tbl_gbp_tms_entrega')
             AND name = 'id_usuario_piloto' AND is_nullable = 1)
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega ALTER COLUMN id_usuario_piloto INT NOT NULL;
    PRINT '>> id_usuario_piloto ahora es obligatorio.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_entrega_piloto')
CREATE INDEX IX_tms_entrega_piloto
    ON dbo.tbl_gbp_tms_entrega(id_usuario_piloto, fecha_documento DESC)
    INCLUDE (sap_doc_num, cliente_nombre, estado, id_viaje);
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.tbl_gbp_tms_entrega')
             AND name = 'sap_factura_num' AND is_nullable = 1)
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega ALTER COLUMN sap_factura_num INT NOT NULL;
    PRINT '>> sap_factura_num ahora es obligatorio: sin factura no se asigna.';
END
GO

/* Estados que quedan. SIN_FACTURA y PENDIENTE describían boletas que el TMS
   ya no guarda; si aparecieran serían un error de programación. */
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_tms_entrega_estado')
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega
        ADD CONSTRAINT CK_tms_entrega_estado CHECK (estado IN
            ('ASIGNADA','EN_RUTA','ENTREGADA','RECHAZADA','ANULADA'));
    PRINT '>> Estados reducidos a los que el TMS administra.';
END
GO

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_tms_entrega_estado')
    ALTER TABLE dbo.tbl_gbp_tms_entrega DROP CONSTRAINT DF_tms_entrega_estado;
GO
ALTER TABLE dbo.tbl_gbp_tms_entrega
    ADD CONSTRAINT DF_tms_entrega_estado DEFAULT ('ASIGNADA') FOR estado;
GO

/* ------------------------------------------------------------
   4. Tipos de tabla

   El de sincronización ya no tiene uso. En su lugar van dos:
   la cabecera de cada boleta que se asigna y sus líneas.
   ------------------------------------------------------------ */

IF OBJECT_ID('dbo.usp_gbp_tms_entrega_sincronizar', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE dbo.usp_gbp_tms_entrega_sincronizar;
    PRINT '>> usp_gbp_tms_entrega_sincronizar eliminado: ya no se vuelca SAP a la tabla.';
END
GO

IF TYPE_ID('dbo.tp_gbp_tms_entrega_sap') IS NOT NULL
BEGIN
    DROP TYPE dbo.tp_gbp_tms_entrega_sap;
    PRINT '>> tp_gbp_tms_entrega_sap eliminado.';
END
GO

IF TYPE_ID('dbo.tp_gbp_tms_entrega_asignar') IS NULL
CREATE TYPE dbo.tp_gbp_tms_entrega_asignar AS TABLE
(
    sap_doc_entry   INT           NOT NULL PRIMARY KEY,
    sap_doc_num     INT           NOT NULL,
    sap_orden_venta INT           NULL,
    sap_factura_num INT           NOT NULL,
    cliente_codigo  VARCHAR(30)   NOT NULL,
    cliente_nombre  NVARCHAR(150) NOT NULL,
    direccion       NVARCHAR(300) NULL,
    municipio       NVARCHAR(80)  NULL,
    peso_kg         DECIMAL(12,3) NOT NULL,
    monto           DECIMAL(18,2) NOT NULL,
    fecha_documento DATE          NOT NULL
);
GO

IF TYPE_ID('dbo.tp_gbp_tms_entrega_linea') IS NULL
CREATE TYPE dbo.tp_gbp_tms_entrega_linea AS TABLE
(
    sap_doc_entry   INT           NOT NULL,
    linea_num       INT           NOT NULL,
    codigo_articulo VARCHAR(50)   NOT NULL,
    codigo_barras   VARCHAR(50)   NULL,
    descripcion     NVARCHAR(200) NOT NULL,
    cantidad        DECIMAL(18,4) NOT NULL,
    unidad          NVARCHAR(30)  NULL,
    almacen         VARCHAR(20)   NULL,
    PRIMARY KEY (sap_doc_entry, linea_num)
);
GO

/* ------------------------------------------------------------
   5. Comprobación
   ------------------------------------------------------------ */

DECLARE @faltan NVARCHAR(500) = '';

IF OBJECT_ID('dbo.tbl_gbp_tms_entrega_linea', 'U') IS NULL
    SET @faltan += 'tabla tbl_gbp_tms_entrega_linea; ';
IF TYPE_ID('dbo.tp_gbp_tms_entrega_asignar') IS NULL
    SET @faltan += 'tipo tp_gbp_tms_entrega_asignar; ';
IF TYPE_ID('dbo.tp_gbp_tms_entrega_linea') IS NULL
    SET @faltan += 'tipo tp_gbp_tms_entrega_linea; ';
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.tbl_gbp_tms_entrega')
             AND name IN ('id_usuario_piloto','sap_factura_num') AND is_nullable = 1)
    SET @faltan += 'columnas obligatorias sin aplicar; ';
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_tms_entrega_estado')
    SET @faltan += 'CK_tms_entrega_estado; ';

IF @faltan <> ''
    RAISERROR('Quedó incompleto. Falta: %s', 16, 1, @faltan);
ELSE
BEGIN
    PRINT '';
    PRINT '>> La entrega ahora se guarda sólo al asignar piloto.';
    PRINT '   Siguiente: 10_procedimientos_entregas.sql';
END
GO
