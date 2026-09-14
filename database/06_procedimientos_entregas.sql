/* ============================================================
   GBP · TMS — pieza compartida entre entregas y viajes
   Ejecutar CONECTADO A DataTMS, después de 05_entregas.sql.

   Este archivo quedó reducido a un solo procedimiento. Los de
   entregas están en 10_procedimientos_entregas.sql, que los
   rehízo cuando el módulo dejó de volcar SAP a la base.

   usp_gbp_tms_viaje_recalcular vive aquí, y no en el script de
   viajes, porque lo invocan los procedimientos de entregas: si
   estuviera después, ejecutar sólo aquel dejaría llamadas rotas.
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
   usp_gbp_tms_viaje_recalcular

   Deja el encabezado del viaje de acuerdo con las entregas que
   lleva.

   Los totales se guardan en lugar de calcularse en cada consulta
   porque el listado de viajes los muestra siempre y la suma es
   sobre una tabla que crece todos los días.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_viaje_recalcular
    @id_viaje INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE v
    SET v.peso_kg              = ISNULL(t.peso, 0),
        v.total_entregas       = ISNULL(t.total, 0),
        v.entregas_completadas = ISNULL(t.completadas, 0)
    FROM dbo.tbl_gbp_tms_viaje v
    OUTER APPLY (
        SELECT peso        = SUM(e.peso_kg),
               total       = COUNT(*),
               completadas = SUM(CASE WHEN e.estado IN ('ENTREGADA','RECHAZADA') THEN 1 ELSE 0 END)
        FROM dbo.tbl_gbp_tms_entrega e
        WHERE e.id_viaje = v.id_viaje
    ) t
    WHERE v.id_viaje = @id_viaje;
END
GO

PRINT '';
PRINT '>> usp_gbp_tms_viaje_recalcular listo.';
PRINT '   Siguiente: 07_procedimientos_viajes.sql';
GO
