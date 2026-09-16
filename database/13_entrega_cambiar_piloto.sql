/* ============================================================
   GBP · TMS — cambiar de piloto una boleta ya repartida
   Ejecutar CONECTADO A DataTMS, después de 12.

   Faltaba el caso más común de la operación diaria: el piloto
   asignado se enferma, se le llena el camión o la ruta cambia.
   Hasta ahora había que liberar la boleta y volver a repartirla,
   lo que la devolvía a SAP y perdía la asignación original.

   También se rehace _liberar por un detalle heredado del cambio
   anterior: nombraba las boletas por su número de entrega, que
   ahora puede no existir todavía, y el mensaje salía vacío.

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
   usp_gbp_tms_entrega_cambiar_piloto

   Pasa las boletas de un piloto a otro sin tocar nada más: la
   boleta sigue siendo la misma, con sus productos y su historia.

   Una boleta que ya está en un viaje no cambia de piloto aquí.
   El viaje se despacha con un piloto y una unidad, y cambiarle
   el dueño a una sola de sus boletas dejaría al camión saliendo
   con carga de otro. Primero se saca del viaje.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_entrega_cambiar_piloto
    @id_piloto INT,
    @ids       dbo.tp_gbp_tms_id READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.tbl_gbp_tms_usuario u
        JOIN dbo.tbl_gbp_tms_usuario_rol ur ON ur.id_usuario = u.id_usuario AND ur.activo = 1
        JOIN dbo.tbl_gbp_tms_rol r          ON r.id_rol = ur.id_rol
        WHERE u.id_usuario = @id_piloto AND u.activo = 1 AND r.nombre = 'PILOTO')
    BEGIN
        RAISERROR('El usuario no existe, está inactivo o no tiene el rol PILOTO.', 16, 1);
        RETURN;
    END

    IF NOT EXISTS (SELECT 1 FROM @ids)
    BEGIN
        RAISERROR('No se recibió ninguna boleta.', 16, 1);
        RETURN;
    END

    DECLARE @malas NVARCHAR(400);

    /* El número que ve el supervisor: la boleta si ya existe y, si no, la
       orden, que es lo único que la identifica mientras tanto. */
    SELECT @malas = STRING_AGG(CONVERT(VARCHAR(12), ISNULL(e.sap_doc_num, e.sap_orden_venta)), ', ')
    FROM dbo.tbl_gbp_tms_entrega e
    JOIN @ids i ON i.id = e.id_entrega
    WHERE e.estado <> 'ASIGNADA';

    IF @malas IS NOT NULL
    BEGIN
        RAISERROR('Estas boletas ya salieron o no están asignadas: %s', 16, 1, @malas);
        RETURN;
    END

    SELECT @malas = STRING_AGG(CONVERT(VARCHAR(12), ISNULL(e.sap_doc_num, e.sap_orden_venta)), ', ')
    FROM dbo.tbl_gbp_tms_entrega e
    JOIN @ids i ON i.id = e.id_entrega
    WHERE e.id_viaje IS NOT NULL;

    IF @malas IS NOT NULL
    BEGIN
        RAISERROR('Estas boletas están en un viaje; sáquelas del viaje antes de cambiarles el piloto: %s',
                  16, 1, @malas);
        RETURN;
    END

    DECLARE @cambiadas INT = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE e
        SET e.id_usuario_piloto = @id_piloto,
            /* La fecha dice desde cuándo la boleta está en manos de alguien,
               así que sigue al piloto y no a la primera asignación. */
            e.asignada_en       = SYSUTCDATETIME()
        FROM dbo.tbl_gbp_tms_entrega e
        JOIN @ids i ON i.id = e.id_entrega
        WHERE e.id_usuario_piloto <> @id_piloto;

        SET @cambiadas = @@ROWCOUNT;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH

    SELECT cambiadas = @cambiadas;
END
GO

/* ============================================================
   usp_gbp_tms_entrega_liberar

   Igual que antes —borra la fila y la boleta vuelve a la lista
   de SAP— con el mensaje corregido para las que todavía no
   tienen número de entrega.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_entrega_liberar
    @ids dbo.tp_gbp_tms_id READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @malas NVARCHAR(400);

    SELECT @malas = STRING_AGG(CONVERT(VARCHAR(12), ISNULL(e.sap_doc_num, e.sap_orden_venta)), ', ')
    FROM dbo.tbl_gbp_tms_entrega e
    JOIN @ids i ON i.id = e.id_entrega
    WHERE e.estado <> 'ASIGNADA';

    IF @malas IS NOT NULL
    BEGIN
        RAISERROR('Sólo se pueden desasignar boletas asignadas. Estas ya salieron: %s', 16, 1, @malas);
        RETURN;
    END

    DECLARE @afectados TABLE (id_viaje INT NOT NULL PRIMARY KEY);
    DECLARE @liberadas INT = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO @afectados (id_viaje)
        SELECT DISTINCT e.id_viaje
        FROM dbo.tbl_gbp_tms_entrega e
        JOIN @ids i ON i.id = e.id_entrega
        WHERE e.id_viaje IS NOT NULL;

        -- Las líneas se van solas: la clave foránea está en cascada.
        DELETE e
        FROM dbo.tbl_gbp_tms_entrega e
        JOIN @ids i ON i.id = e.id_entrega;

        SET @liberadas = @@ROWCOUNT;

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

    SELECT liberadas = @liberadas;
END
GO

DECLARE @faltan NVARCHAR(300) = '';

IF OBJECT_ID('dbo.usp_gbp_tms_entrega_cambiar_piloto', 'P') IS NULL
    SET @faltan += 'usp_gbp_tms_entrega_cambiar_piloto; ';

IF @faltan <> ''
    RAISERROR('Quedó incompleto. Falta: %s', 16, 1, @faltan);
ELSE
BEGIN
    PRINT '';
    PRINT '>> Las boletas asignadas ya pueden cambiar de piloto.';
END
GO
