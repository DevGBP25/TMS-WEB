/* ============================================================
   GBP · TMS — procedimientos de viajes
   Ejecutar CONECTADO A DataTMS, después de 06_procedimientos_entregas.sql.

   El viaje es el contenedor: un piloto, un camión y el grupo de
   entregas que sale junto. usp_gbp_tms_viaje_recalcular vive en
   el script 06 porque los procedimientos de entregas lo llaman.
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
   usp_gbp_tms_viaje_listar
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_viaje_listar
    @buscar NVARCHAR(60) = NULL,
    @estado VARCHAR(20)  = NULL,
    @desde  DATE         = NULL,
    @hasta  DATE         = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        v.id_viaje,
        v.numero,
        v.fecha,
        v.estado,
        v.peso_kg,
        v.total_entregas,
        v.entregas_completadas,
        v.salida_real,
        v.retorno_real,
        v.observaciones,
        v.fecha_creacion,
        id_unidad     = v.id_unidad,
        unidad_codigo = u.codigo,
        unidad_placa  = u.placa,
        id_piloto     = v.id_usuario_piloto,
        piloto_nombre = p.nombre
    FROM dbo.tbl_gbp_tms_viaje v
    LEFT JOIN dbo.tbl_gbp_tms_unidad  u ON u.id_unidad  = v.id_unidad
    LEFT JOIN dbo.tbl_gbp_tms_usuario p ON p.id_usuario = v.id_usuario_piloto
    WHERE (@estado IS NULL OR v.estado = @estado)
      AND (@desde  IS NULL OR v.fecha >= @desde)
      AND (@hasta  IS NULL OR v.fecha <= @hasta)
      AND (@buscar IS NULL
           OR v.numero    LIKE '%' + @buscar + '%'
           OR p.nombre    LIKE '%' + @buscar + '%'
           OR u.codigo    LIKE '%' + @buscar + '%'
           OR u.placa     LIKE '%' + @buscar + '%')
    ORDER BY v.fecha DESC, v.numero DESC;
END
GO

/* ============================================================
   usp_gbp_tms_viaje_obtener

   Devuelve dos conjuntos: el encabezado y sus entregas. Se hace
   en una sola llamada porque la pantalla de detalle no sirve de
   nada con una mitad sin la otra.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_viaje_obtener
    @id_viaje INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        v.id_viaje,
        v.numero,
        v.fecha,
        v.estado,
        v.peso_kg,
        v.total_entregas,
        v.entregas_completadas,
        v.salida_programada,
        v.salida_real,
        v.retorno_real,
        v.observaciones,
        v.fecha_creacion,
        id_unidad      = v.id_unidad,
        unidad_codigo  = u.codigo,
        unidad_placa   = u.placa,
        unidad_capacidad_kg = u.capacidad_kg,
        id_piloto      = v.id_usuario_piloto,
        piloto_nombre  = p.nombre,
        piloto_telefono = p.telefono
    FROM dbo.tbl_gbp_tms_viaje v
    LEFT JOIN dbo.tbl_gbp_tms_unidad  u ON u.id_unidad  = v.id_unidad
    LEFT JOIN dbo.tbl_gbp_tms_usuario p ON p.id_usuario = v.id_usuario_piloto
    WHERE v.id_viaje = @id_viaje;

    SELECT
        e.id_entrega,
        e.sap_doc_num,
        e.sap_orden_venta,
        e.sap_factura_num,
        e.cliente_codigo,
        e.cliente_nombre,
        e.direccion,
        e.municipio,
        e.peso_kg,
        e.monto,
        e.fecha_documento,
        e.estado,
        e.secuencia,
        e.receptor,
        e.motivo_rechazo,
        e.entregada_en
    FROM dbo.tbl_gbp_tms_entrega e
    WHERE e.id_viaje = @id_viaje
    ORDER BY e.secuencia;
END
GO

/* ============================================================
   usp_gbp_tms_viaje_crear

   El número se arma dentro de la transacción con UPDLOCK sobre
   los viajes del día: sin ese bloqueo, dos supervisores creando
   a la vez calcularían el mismo correlativo. Si aun así hubiera
   empate, el índice único lo rechaza y la API devuelve conflicto.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_viaje_crear
    @fecha         DATE,
    @id_unidad     INT           = NULL,
    @id_piloto     INT           = NULL,
    @observaciones NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    /* Un error no atrapable (una tabla ausente, por ejemplo) aborta el
       lote sin pasar por el CATCH. Sin esto la transacción quedaría
       abierta y el cliente vería un error de BEGIN/COMMIT desparejos
       en lugar de la causa real. */
    SET XACT_ABORT ON;

    IF @id_piloto IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM dbo.tbl_gbp_tms_usuario_rol ur
        JOIN dbo.tbl_gbp_tms_rol r ON r.id_rol = ur.id_rol
        WHERE ur.id_usuario = @id_piloto AND ur.activo = 1 AND r.nombre = 'PILOTO')
    BEGIN
        RAISERROR('El usuario indicado no tiene el rol PILOTO.', 16, 1);
        RETURN;
    END

    DECLARE @id INT, @numero VARCHAR(20);

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @correlativo INT;

        SELECT @correlativo = ISNULL(MAX(TRY_CAST(RIGHT(numero, 3) AS INT)), 0) + 1
        FROM dbo.tbl_gbp_tms_viaje WITH (UPDLOCK, HOLDLOCK)
        WHERE fecha = @fecha;

        SET @numero = 'V' + FORMAT(@fecha, 'yyMMdd') + '-'
                    + RIGHT('000' + CAST(@correlativo AS VARCHAR(3)), 3);

        INSERT INTO dbo.tbl_gbp_tms_viaje
            (numero, fecha, estado, id_unidad, id_usuario_piloto, observaciones)
        VALUES
            (@numero, @fecha,
             CASE WHEN @id_unidad IS NOT NULL AND @id_piloto IS NOT NULL
                  THEN 'ASIGNADO' ELSE 'PLANIFICADO' END,
             @id_unidad, @id_piloto, @observaciones);

        SET @id = SCOPE_IDENTITY();

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH

    SELECT id_viaje = @id, numero = @numero;
END
GO

/* ============================================================
   usp_gbp_tms_viaje_asignar_recursos

   Camión y piloto. Se comprueba que ninguno de los dos ya esté
   comprometido en otro viaje del mismo día que todavía no haya
   terminado: es el error que más caro sale, porque se descubre
   con el camión cargado.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_viaje_asignar_recursos
    @id_viaje  INT,
    @id_unidad INT,
    @id_piloto INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @fecha DATE, @estado VARCHAR(20);
    SELECT @fecha = fecha, @estado = estado
    FROM dbo.tbl_gbp_tms_viaje WHERE id_viaje = @id_viaje;

    IF @fecha IS NULL
    BEGIN
        RAISERROR('El viaje indicado no existe.', 16, 1);
        RETURN;
    END

    IF @estado NOT IN ('PLANIFICADO','ASIGNADO')
    BEGIN
        RAISERROR('El viaje está en estado %s; ya no admite cambio de recursos.', 16, 1, @estado);
        RETURN;
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.tbl_gbp_tms_unidad
                   WHERE id_unidad = @id_unidad AND activo = 1)
    BEGIN
        RAISERROR('La unidad no existe o está inactiva.', 16, 1);
        RETURN;
    END

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.tbl_gbp_tms_usuario u
        JOIN dbo.tbl_gbp_tms_usuario_rol ur ON ur.id_usuario = u.id_usuario AND ur.activo = 1
        JOIN dbo.tbl_gbp_tms_rol r ON r.id_rol = ur.id_rol
        WHERE u.id_usuario = @id_piloto AND u.activo = 1 AND r.nombre = 'PILOTO')
    BEGIN
        RAISERROR('El piloto no existe, está inactivo o no tiene el rol PILOTO.', 16, 1);
        RETURN;
    END

    DECLARE @ocupado VARCHAR(20);

    SELECT TOP 1 @ocupado = numero
    FROM dbo.tbl_gbp_tms_viaje
    WHERE id_viaje <> @id_viaje
      AND fecha = @fecha
      AND estado IN ('PLANIFICADO','ASIGNADO','EN_RUTA')
      AND id_unidad = @id_unidad;

    IF @ocupado IS NOT NULL
    BEGIN
        RAISERROR('Esa unidad ya está asignada al viaje %s del mismo día.', 16, 1, @ocupado);
        RETURN;
    END

    SELECT TOP 1 @ocupado = numero
    FROM dbo.tbl_gbp_tms_viaje
    WHERE id_viaje <> @id_viaje
      AND fecha = @fecha
      AND estado IN ('PLANIFICADO','ASIGNADO','EN_RUTA')
      AND id_usuario_piloto = @id_piloto;

    IF @ocupado IS NOT NULL
    BEGIN
        RAISERROR('Ese piloto ya está asignado al viaje %s del mismo día.', 16, 1, @ocupado);
        RETURN;
    END

    UPDATE dbo.tbl_gbp_tms_viaje
    SET id_unidad         = @id_unidad,
        id_usuario_piloto = @id_piloto,
        estado            = 'ASIGNADO'
    WHERE id_viaje = @id_viaje;

    SELECT filas = @@ROWCOUNT;
END
GO

/* ============================================================
   usp_gbp_tms_viaje_cambiar_estado

   Las entregas del viaje siguen al viaje: despachar pone todo
   EN_RUTA de una vez. Que el piloto tuviera que marcar entrega
   por entrega al salir sería trabajo inventado.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_viaje_cambiar_estado
    @id_viaje      INT,
    @estado        VARCHAR(20),
    @observaciones NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    /* Un error no atrapable (una tabla ausente, por ejemplo) aborta el
       lote sin pasar por el CATCH. Sin esto la transacción quedaría
       abierta y el cliente vería un error de BEGIN/COMMIT desparejos
       en lugar de la causa real. */
    SET XACT_ABORT ON;

    DECLARE @actual VARCHAR(20), @entregas INT;

    SELECT @actual = estado FROM dbo.tbl_gbp_tms_viaje WHERE id_viaje = @id_viaje;

    IF @actual IS NULL
    BEGIN
        RAISERROR('El viaje indicado no existe.', 16, 1);
        RETURN;
    END

    /* Transiciones permitidas. Se declaran aquí y no en el código para
       que ningún cliente pueda saltárselas. */
    IF NOT (   (@actual = 'PLANIFICADO' AND @estado IN ('ASIGNADO','CANCELADO'))
            OR (@actual = 'ASIGNADO'    AND @estado IN ('EN_RUTA','PLANIFICADO','CANCELADO'))
            OR (@actual = 'EN_RUTA'     AND @estado IN ('ENTREGADO'))
            OR (@actual = 'ENTREGADO'   AND @estado IN ('LIQUIDADO')))
    BEGIN
        RAISERROR('No se puede pasar de %s a %s.', 16, 1, @actual, @estado);
        RETURN;
    END

    IF @estado = 'EN_RUTA'
    BEGIN
        SELECT @entregas = COUNT(*) FROM dbo.tbl_gbp_tms_entrega WHERE id_viaje = @id_viaje;

        IF @entregas = 0
        BEGIN
            RAISERROR('El viaje no lleva ninguna entrega.', 16, 1);
            RETURN;
        END

        IF EXISTS (SELECT 1 FROM dbo.tbl_gbp_tms_viaje
                   WHERE id_viaje = @id_viaje
                     AND (id_unidad IS NULL OR id_usuario_piloto IS NULL))
        BEGIN
            RAISERROR('Asigne unidad y piloto antes de despachar el viaje.', 16, 1);
            RETURN;
        END
    END

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.tbl_gbp_tms_viaje
        SET estado        = @estado,
            salida_real   = CASE WHEN @estado = 'EN_RUTA'   THEN SYSUTCDATETIME() ELSE salida_real   END,
            retorno_real  = CASE WHEN @estado = 'ENTREGADO' THEN SYSUTCDATETIME() ELSE retorno_real  END,
            observaciones = ISNULL(@observaciones, observaciones)
        WHERE id_viaje = @id_viaje;

        IF @estado = 'EN_RUTA'
            UPDATE dbo.tbl_gbp_tms_entrega
            SET estado = 'EN_RUTA'
            WHERE id_viaje = @id_viaje AND estado = 'ASIGNADA';

        /* Cancelar libera la carga: esas entregas vuelven a estar
           disponibles para armar otro viaje. */
        IF @estado = 'CANCELADO'
            UPDATE dbo.tbl_gbp_tms_entrega
            SET estado = 'PENDIENTE', id_viaje = NULL, secuencia = NULL
            WHERE id_viaje = @id_viaje AND estado = 'ASIGNADA';

        EXEC dbo.usp_gbp_tms_viaje_recalcular @id_viaje;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH

    SELECT estado = @estado;
END
GO

/* ============================================================
   usp_gbp_tms_piloto_listar

   Los pilotos para el desplegable de asignación, con el viaje
   que ya tengan ese día: es lo que el supervisor necesita ver
   para no asignar dos veces a la misma persona.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_piloto_listar
    @fecha DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        id_usuario = u.id_usuario,
        u.usuario,
        u.nombre,
        u.telefono,
        viaje_del_dia = (
            SELECT TOP 1 v.numero
            FROM dbo.tbl_gbp_tms_viaje v
            WHERE v.id_usuario_piloto = u.id_usuario
              AND v.fecha = ISNULL(@fecha, CAST(SYSDATETIME() AS DATE))
              AND v.estado IN ('PLANIFICADO','ASIGNADO','EN_RUTA'))
    FROM dbo.tbl_gbp_tms_usuario u
    JOIN dbo.tbl_gbp_tms_usuario_rol ur ON ur.id_usuario = u.id_usuario AND ur.activo = 1
    JOIN dbo.tbl_gbp_tms_rol r          ON r.id_rol = ur.id_rol AND r.nombre = 'PILOTO'
    WHERE u.activo = 1
    ORDER BY u.nombre;
END
GO

PRINT '';
PRINT '>> Procedimientos de viajes listos.';
PRINT '   El módulo de entregas ya tiene su capa de datos completa.';
GO
