/* ============================================================
   GBP · TMS — BORRADO DE TODAS LAS TABLAS

   *** DESTRUCTIVO. ELIMINA DATOS DE FORMA IRREVERSIBLE. ***

   Sirve para rehacer el esquema desde cero durante la puesta en marcha.
   NO ejecutar una vez que el sistema tenga datos reales.

   El script muestra cuántas filas va a destruir antes de hacerlo, y sólo
   continúa si @confirmar = 1. Está así a propósito: obliga a leer el
   conteo antes de borrar.

   Después de este script, ejecute 01_esquema.sql.
   ============================================================ */

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

DECLARE @bd sysname = DB_NAME();
IF @bd <> 'DataTMS'
BEGIN
    RAISERROR('Ejecute este script conectado a DataTMS. Base actual: %s', 16, 1, @bd);
    SET NOEXEC ON;
END
GO

/* ---------- Qué se va a borrar ---------- */

PRINT '=== FILAS QUE SE ELIMINARAN ===';
SELECT Tabla = t.name, Filas = SUM(p.rows)
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
WHERE t.name LIKE 'tbl_gbp_tms_%'
GROUP BY t.name
ORDER BY t.name;
GO

/* ---------- Interruptor de seguridad ----------
   Cambie a 1 para autorizar el borrado. En 0 el script no toca nada. */

DECLARE @confirmar BIT = 1;

IF @confirmar <> 1
BEGIN
    PRINT '>> @confirmar = 0. No se eliminó nada. Ponga 1 para autorizar.';
    SET NOEXEC ON;
END
GO

/* ---------- Borrado ----------
   Orden inverso al de las dependencias: primero las tablas que apuntan
   a otras. DROP TABLE elimina también sus índices y restricciones. */

DROP TABLE IF EXISTS dbo.tbl_gbp_tms_viaje_parada;
DROP TABLE IF EXISTS dbo.tbl_gbp_tms_viaje;
DROP TABLE IF EXISTS dbo.tbl_gbp_tms_ruta;

DROP TABLE IF EXISTS dbo.tbl_gbp_tms_piloto_unidad;
DROP TABLE IF EXISTS dbo.tbl_gbp_tms_unidad;

DROP TABLE IF EXISTS dbo.tbl_gbp_tms_log_acceso;
DROP TABLE IF EXISTS dbo.tbl_gbp_tms_sesion;
DROP TABLE IF EXISTS dbo.tbl_gbp_tms_usuario_rol;
DROP TABLE IF EXISTS dbo.tbl_gbp_tms_usuario;
DROP TABLE IF EXISTS dbo.tbl_gbp_tms_rol;
GO

/* ---------- Verificación ---------- */

DECLARE @quedan INT =
    (SELECT COUNT(*) FROM sys.tables WHERE name LIKE 'tbl_gbp_tms_%');

IF @quedan = 0
    PRINT '>> Todas las tablas tbl_gbp_tms_* fueron eliminadas. Ejecute ahora 01_esquema.sql.';
ELSE
BEGIN
    PRINT '>> QUEDARON TABLAS SIN ELIMINAR:';
    SELECT Tabla = name FROM sys.tables WHERE name LIKE 'tbl_gbp_tms_%' ORDER BY name;
END
GO

SET NOEXEC OFF;
GO
