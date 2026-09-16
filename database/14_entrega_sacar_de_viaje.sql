/* ============================================================
   GBP · TMS — sacar una boleta del viaje sin desasignarla
   Ejecutar CONECTADO A DataTMS, después de 13.

   Faltaba el paso intermedio. Hasta ahora la equis del detalle
   del viaje llamaba a _liberar, que borra la fila entera: la
   boleta perdía piloto y productos y volvía a la lista de SAP.
   Para reacomodar un viaje eso es demasiado.

   Y desde que cambiar de piloto exige que la boleta no esté en
   un viaje, sin esta operación no había forma de hacerlo sin
   perder la asignación.

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
   usp_gbp_tms_entrega_sacar_de_viaje

   La boleta se queda en el TMS con su piloto y sus productos;
   lo único que pierde es el viaje y su lugar en la secuencia.

   Un viaje que ya salió no se reacomoda: lo que va en el camión
   va, y lo que no se entregó lo registra el piloto como rechazo.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_entrega_sacar_de_viaje
    @ids dbo.tp_gbp_tms_id READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM @ids)
    BEGIN
        RAISERROR('No se recibió ninguna boleta.', 16, 1);
        RETURN;
    END

    DECLARE @malas NVARCHAR(400);

    SELECT @malas = STRING_AGG(CONVERT(VARCHAR(12), ISNULL(e.sap_doc_num, e.sap_orden_venta)), ', ')
    FROM dbo.tbl_gbp_tms_entrega e
    JOIN @ids i ON i.id = e.id_entrega
    WHERE e.estado <> 'ASIGNADA';

    IF @malas IS NOT NULL
    BEGIN
        RAISERROR('Estas boletas ya salieron; no se pueden sacar del viaje: %s', 16, 1, @malas);
        RETURN;
    END

    DECLARE @afectados TABLE (id_viaje INT NOT NULL PRIMARY KEY);
    DECLARE @sacadas INT = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO @afectados (id_viaje)
        SELECT DISTINCT e.id_viaje
        FROM dbo.tbl_gbp_tms_entrega e
        JOIN @ids i ON i.id = e.id_entrega
        WHERE e.id_viaje IS NOT NULL;

        UPDATE e
        SET e.id_viaje  = NULL,
            e.secuencia = NULL
        FROM dbo.tbl_gbp_tms_entrega e
        JOIN @ids i ON i.id = e.id_entrega
        WHERE e.id_viaje IS NOT NULL;

        SET @sacadas = @@ROWCOUNT;

        /* Los totales del viaje —bultos, peso, paradas— se recalculan sobre
           lo que quedó. */
        DECLARE @v INT;
        DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT id_viaje FROM @afectados;
        OPEN cur;
        FETCH NEXT FROM cur INTO @v;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            EXEC dbo.usp_gbp_tms_viaje_recalcular @v;
            FETCH NEXT FROM cur INTO @v;
        END
        CLOSE cur;
        DEALLOCATE cur;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH

    SELECT sacadas = @sacadas;
END
GO

DECLARE @faltan NVARCHAR(300) = '';

IF OBJECT_ID('dbo.usp_gbp_tms_entrega_sacar_de_viaje', 'P') IS NULL
    SET @faltan += 'usp_gbp_tms_entrega_sacar_de_viaje; ';

IF @faltan <> ''
    RAISERROR('Quedó incompleto. Falta: %s', 16, 1, @faltan);
ELSE
BEGIN
    PRINT '';
    PRINT '>> Una boleta ya puede salir de un viaje sin perder su piloto.';
END
GO
