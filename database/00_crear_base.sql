/* ============================================================
   GBP · TMS — creación de la base DataTMS
   Ejecutar CONECTADO A master, con un login que tenga dbcreator.

   Es idempotente: si DataTMS ya existe, no la vuelve a crear.

   La intercalación va literal y no calculada: COLLATE exige un
   identificador desnudo, así que no admite SQL dinámico con QUOTENAME.
   SQL_Latin1_General_CP850_CI_AS es la que usa DataWMS, y debe coincidir
   para poder hacer JOIN con las bases de SAP sin conflictos de collation.
   ============================================================ */

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------- 1. Crear si no existe ---------- */

IF DB_ID('DataTMS') IS NULL
BEGIN
    PRINT '>> Creando DataTMS...';
    CREATE DATABASE DataTMS COLLATE SQL_Latin1_General_CP850_CI_AS;
END
ELSE
    PRINT '>> DataTMS ya existía. No se vuelve a crear.';
GO

/* ---------- 2. Verificar de verdad ----------
   Sin esta comprobación un fallo del CREATE pasa inadvertido y los
   ALTER siguientes producen errores confusos de "permisos".
--------------------------------------------------------------------- */

IF DB_ID('DataTMS') IS NULL
BEGIN
    RAISERROR('>> FALLO: DataTMS no existe. Revise los errores anteriores; no se aplicó ningún ajuste.', 16, 1);
    SET NOEXEC ON;
END
GO

/* ---------- 3. Ajustes ----------
   Cada uno va por separado para que, si el login no tiene ALTER DATABASE,
   se sepa exactamente cuál falló y la base quede creada de todos modos.
--------------------------------------------------------------------- */

BEGIN TRY
    ALTER DATABASE DataTMS SET RECOVERY FULL;
    PRINT '>> Recuperación: FULL';
END TRY
BEGIN CATCH
    PRINT '>> NO se pudo fijar RECOVERY FULL: ' + ERROR_MESSAGE();
END CATCH
GO

BEGIN TRY
    ALTER DATABASE DataTMS SET COMPATIBILITY_LEVEL = 150;
    PRINT '>> Compatibilidad: 150 (igual que DataWMS)';
END TRY
BEGIN CATCH
    PRINT '>> NO se pudo fijar COMPATIBILITY_LEVEL: ' + ERROR_MESSAGE();
END CATCH
GO

/* READ_COMMITTED_SNAPSHOT evita que los reportes bloqueen a la operación:
   los lectores ven una versión consistente en vez de esperar a los escritores.
   Si su DBA prefiere no activarlo en esta instancia, borre este bloque. */
BEGIN TRY
    ALTER DATABASE DataTMS SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
    PRINT '>> READ_COMMITTED_SNAPSHOT: activado';
END TRY
BEGIN CATCH
    PRINT '>> NO se pudo activar READ_COMMITTED_SNAPSHOT: ' + ERROR_MESSAGE();
END CATCH
GO

/* ---------- 4. Resultado ---------- */

SELECT
    Base          = d.name,
    Collation     = d.collation_name,
    CoincideConWMS = CASE
                        WHEN d.collation_name =
                             (SELECT collation_name FROM sys.databases WHERE name = 'DataWMS')
                        THEN 'SI' ELSE 'NO — revisar' END,
    Recuperacion  = d.recovery_model_desc,
    Compat        = d.compatibility_level,
    SnapshotRC    = d.is_read_committed_snapshot_on,
    Propietario   = SUSER_SNAME(d.owner_sid),
    Creada        = d.create_date
FROM sys.databases d
WHERE d.name = 'DataTMS';
GO

SET NOEXEC OFF;
GO
