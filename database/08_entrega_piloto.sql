/* ============================================================
   GBP · TMS — el piloto se asigna por boleta de entrega
   Ejecutar CONECTADO A DataTMS, después de 07.

   Cambio de modelo: hasta ahora el piloto colgaba del viaje y
   una entrega heredaba el suyo por pertenecer a él. La operación
   real asigna el piloto documento por documento, así que la
   columna pasa a la entrega.

   El viaje no desaparece: sigue siendo la agrupación con la que
   se despacha y a la que se le pone camión. Lo que cambia es que
   una entrega puede tener piloto sin pertenecer todavía a ningún
   viaje, y que el estado ASIGNADA ahora depende del piloto.

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
   1. La columna
   ------------------------------------------------------------ */

IF COL_LENGTH('dbo.tbl_gbp_tms_entrega', 'id_usuario_piloto') IS NULL
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega ADD id_usuario_piloto INT NULL;
    PRINT '>> entrega.id_usuario_piloto agregada.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_tms_entrega_piloto')
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega
        ADD CONSTRAINT FK_tms_entrega_piloto FOREIGN KEY (id_usuario_piloto)
            REFERENCES dbo.tbl_gbp_tms_usuario(id_usuario);
    PRINT '>> FK_tms_entrega_piloto creada.';
END
GO

/* Fecha de la asignación: sirve para saber desde cuándo una boleta
   está en manos de alguien sin tener que mirar la bitácora. */
IF COL_LENGTH('dbo.tbl_gbp_tms_entrega', 'asignada_en') IS NULL
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega ADD asignada_en DATETIME2(0) NULL;
    PRINT '>> entrega.asignada_en agregada.';
END
GO

/* ------------------------------------------------------------
   2. Las reglas cambian de columna

   Antes: ASIGNADA exigía viaje. Ahora exige piloto, que es lo
   que de verdad determina que la boleta tiene dueño.
   ------------------------------------------------------------ */

-- Si alguna entrega quedó asignada por viaje, hereda el piloto de ese viaje
-- antes de que la nueva restricción la rechace.
UPDATE e
SET e.id_usuario_piloto = v.id_usuario_piloto,
    e.asignada_en       = ISNULL(e.asignada_en, SYSUTCDATETIME())
FROM dbo.tbl_gbp_tms_entrega e
JOIN dbo.tbl_gbp_tms_viaje v ON v.id_viaje = e.id_viaje
WHERE e.id_usuario_piloto IS NULL
  AND v.id_usuario_piloto IS NOT NULL;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_tms_entrega_viaje')
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega DROP CONSTRAINT CK_tms_entrega_viaje;
    PRINT '>> CK_tms_entrega_viaje retirada (el estado ya no depende del viaje).';
END
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_tms_entrega_factura')
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega DROP CONSTRAINT CK_tms_entrega_factura;
    PRINT '>> CK_tms_entrega_factura retirada para rehacerla sobre el piloto.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_tms_entrega_asignacion')
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega
        ADD CONSTRAINT CK_tms_entrega_asignacion CHECK (
               (estado IN ('SIN_FACTURA','PENDIENTE')                    AND id_usuario_piloto IS NULL)
            OR (estado IN ('ASIGNADA','EN_RUTA','ENTREGADA','RECHAZADA') AND id_usuario_piloto IS NOT NULL)
            OR (estado = 'ANULADA'));
    PRINT '>> CK_tms_entrega_asignacion creada (el estado sigue al piloto).';
END
GO

/* Sin factura no sale mercadería: ahora la regla se aplica al asignar el
   piloto, que es el momento en que la boleta queda comprometida. */
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_tms_entrega_factura')
BEGIN
    ALTER TABLE dbo.tbl_gbp_tms_entrega
        ADD CONSTRAINT CK_tms_entrega_factura CHECK (
            id_usuario_piloto IS NULL OR sap_factura_num IS NOT NULL);
    PRINT '>> CK_tms_entrega_factura recreada sobre el piloto.';
END
GO

/* ------------------------------------------------------------
   3. Índice

   La pregunta diaria del supervisor es "qué lleva fulano hoy".
   ------------------------------------------------------------ */

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_entrega_piloto')
CREATE INDEX IX_tms_entrega_piloto
    ON dbo.tbl_gbp_tms_entrega(id_usuario_piloto, fecha_documento DESC)
    WHERE id_usuario_piloto IS NOT NULL;
GO

/* ------------------------------------------------------------
   4. Comprobación
   ------------------------------------------------------------ */

DECLARE @faltan NVARCHAR(400) = '';

IF COL_LENGTH('dbo.tbl_gbp_tms_entrega', 'id_usuario_piloto') IS NULL
    SET @faltan += 'columna id_usuario_piloto; ';
IF COL_LENGTH('dbo.tbl_gbp_tms_entrega', 'asignada_en') IS NULL
    SET @faltan += 'columna asignada_en; ';
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_tms_entrega_asignacion')
    SET @faltan += 'CK_tms_entrega_asignacion; ';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tms_entrega_piloto')
    SET @faltan += 'IX_tms_entrega_piloto; ';

IF @faltan <> ''
    RAISERROR('Quedó incompleto. Falta: %s', 16, 1, @faltan);
ELSE
BEGIN
    PRINT '';
    PRINT '>> El piloto ya se asigna por boleta.';
    PRINT '   Siguiente: vuelva a ejecutar 06_procedimientos_entregas.sql';
END
GO
