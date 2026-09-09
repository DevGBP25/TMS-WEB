/* ============================================================
   GBP · TMS — procedimientos de la flota
   Ejecutar CONECTADO A DataTMS.

   Cubre camiones, paneles y cualquier otra unidad de reparto.
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
   usp_gbp_tms_unidad_listar

   Incluye el turno abierto, si lo hay: saber quién trae la unidad
   es lo primero que se pregunta al verla en la lista.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_unidad_listar
    @buscar       NVARCHAR(60) = NULL,
    @estado       VARCHAR(20)  = NULL,
    @solo_activas BIT          = 0
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.id_unidad,
        u.codigo,
        u.placa,
        u.marca,
        u.modelo,
        u.anio,
        u.tipo,
        u.capacidad_kg,
        u.capacidad_m3,
        u.odometro_km,
        u.transportista,
        u.estado,
        u.activo,
        u.fecha_creacion,
        piloto_actual = p.nombre,
        turno_desde   = t.fecha_inicio
    FROM dbo.tbl_gbp_tms_unidad u
    LEFT JOIN dbo.tbl_gbp_tms_piloto_unidad t
           ON t.id_unidad = u.id_unidad AND t.estado = 'ACTIVA'
    LEFT JOIN dbo.tbl_gbp_tms_usuario p
           ON p.id_usuario = t.id_usuario
    WHERE (@solo_activas = 0 OR u.activo = 1)
      AND (@estado IS NULL OR u.estado = @estado)
      AND (@buscar IS NULL
           OR u.codigo LIKE '%' + @buscar + '%'
           OR u.placa  LIKE '%' + @buscar + '%'
           OR u.marca  LIKE '%' + @buscar + '%'
           OR u.modelo LIKE '%' + @buscar + '%')
    ORDER BY u.codigo;
END
GO

/* ============================================================
   usp_gbp_tms_unidad_crear

   La unicidad de código y placa la garantizan los índices: si se
   repiten, el motor lanza 2627/2601 y la API lo traduce.
   La placa va por índice filtrado, así que admite varias sin placa.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_unidad_crear
    @codigo        VARCHAR(20),
    @placa         VARCHAR(20)   = NULL,
    @marca         NVARCHAR(60)  = NULL,
    @modelo        NVARCHAR(60)  = NULL,
    @anio          SMALLINT      = NULL,
    @tipo          VARCHAR(30)   = NULL,
    @capacidad_kg  DECIMAL(12,2) = 0,
    @capacidad_m3  DECIMAL(10,2) = 0,
    @odometro_km   DECIMAL(12,2) = 0,
    @transportista NVARCHAR(120) = NULL,
    @estado        VARCHAR(20)   = 'DISPONIBLE'
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.tbl_gbp_tms_unidad
        (codigo, placa, marca, modelo, anio, tipo,
         capacidad_kg, capacidad_m3, odometro_km, transportista, estado, activo)
    VALUES
        (@codigo, NULLIF(@placa, ''), NULLIF(@marca, ''), NULLIF(@modelo, ''), @anio,
         NULLIF(@tipo, ''), @capacidad_kg, @capacidad_m3, @odometro_km,
         NULLIF(@transportista, ''), @estado, 1);

    SELECT CONVERT(INT, SCOPE_IDENTITY()) AS id_unidad;
END
GO

/* ============================================================
   usp_gbp_tms_unidad_actualizar

   No deja mover a EN_RUTA a mano: ese estado lo pone el despacho
   al iniciar un turno, y ponerlo aquí desincronizaría la flota.
   Tampoco deja sacar de circulación una unidad con turno abierto.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_unidad_actualizar
    @id_unidad     INT,
    @placa         VARCHAR(20)   = NULL,
    @marca         NVARCHAR(60)  = NULL,
    @modelo        NVARCHAR(60)  = NULL,
    @anio          SMALLINT      = NULL,
    @tipo          VARCHAR(30)   = NULL,
    @capacidad_kg  DECIMAL(12,2) = 0,
    @capacidad_m3  DECIMAL(10,2) = 0,
    @odometro_km   DECIMAL(12,2) = 0,
    @transportista NVARCHAR(120) = NULL,
    @estado        VARCHAR(20),
    @activo        BIT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @en_turno BIT =
        CASE WHEN EXISTS (SELECT 1 FROM dbo.tbl_gbp_tms_piloto_unidad
                          WHERE id_unidad = @id_unidad AND estado = 'ACTIVA')
             THEN 1 ELSE 0 END;

    IF @en_turno = 1 AND (@activo = 0 OR @estado IN ('MANTENIMIENTO', 'FUERA_SERVICIO'))
    BEGIN
        RAISERROR('La unidad tiene un turno abierto. Ciérrelo antes de cambiar su estado.', 16, 1);
        RETURN;
    END

    UPDATE dbo.tbl_gbp_tms_unidad
       SET placa         = NULLIF(@placa, ''),
           marca         = NULLIF(@marca, ''),
           modelo        = NULLIF(@modelo, ''),
           anio          = @anio,
           tipo          = NULLIF(@tipo, ''),
           capacidad_kg  = @capacidad_kg,
           capacidad_m3  = @capacidad_m3,
           odometro_km   = @odometro_km,
           transportista = NULLIF(@transportista, ''),
           -- EN_RUTA lo gobierna el turno, no esta pantalla.
           estado        = CASE WHEN @en_turno = 1 THEN estado ELSE @estado END,
           activo        = @activo
     WHERE id_unidad = @id_unidad;

    SELECT @@ROWCOUNT AS filas;
END
GO

/* ============================================================
   RESULTADO
   ============================================================ */

SELECT Procedimiento = name, Modificado = modify_date
FROM sys.procedures
WHERE name LIKE 'usp_gbp_tms_unidad%'
ORDER BY name;
GO

SET NOEXEC OFF;
GO
