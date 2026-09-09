/* ============================================================
   GBP · TMS — procedimientos de administración de usuarios
   Ejecutar CONECTADO A DataTMS.

   Las altas y los restablecimientos de contraseña los hace el
   administrador: no hay autoservicio.

   El hash siempre llega calculado desde la API.
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
   usp_gbp_tms_rol_listar
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_rol_listar
AS
BEGIN
    SET NOCOUNT ON;

    SELECT id_rol, nombre, descripcion, activo
    FROM dbo.tbl_gbp_tms_rol
    WHERE activo = 1
    ORDER BY nombre;
END
GO

/* ============================================================
   usp_gbp_tms_usuario_listar

   Los roles se devuelven concatenados en una columna: la pantalla
   sólo los muestra, y traerlos en un segundo conjunto obligaría a
   recorrer y agrupar en la aplicación.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_usuario_listar
    @buscar       NVARCHAR(60) = NULL,
    @solo_activos BIT          = 0
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.id_usuario,
        u.usuario,
        u.nombre,
        u.telefono,
        u.dpi,
        u.licencia,
        u.tipo_licencia,
        u.licencia_vence,
        u.activo,
        u.intentos_fallidos,
        u.ultimo_acceso,
        u.fecha_creacion,
        roles = STUFF((
            SELECT ', ' + r.nombre
            FROM dbo.tbl_gbp_tms_usuario_rol ur
            JOIN dbo.tbl_gbp_tms_rol r ON r.id_rol = ur.id_rol
            WHERE ur.id_usuario = u.id_usuario AND ur.activo = 1 AND r.activo = 1
            ORDER BY r.nombre
            FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 2, '')
    FROM dbo.tbl_gbp_tms_usuario u
    WHERE (@solo_activos = 0 OR u.activo = 1)
      AND (@buscar IS NULL
           OR u.usuario LIKE '%' + @buscar + '%'
           OR u.nombre  LIKE '%' + @buscar + '%')
    ORDER BY u.nombre;
END
GO

/* ============================================================
   usp_gbp_tms_usuario_crear

   Los roles llegan como lista separada por comas. La unicidad del
   código la garantiza el índice UNIQUE: si se duplica, el motor
   lanza 2627 y la API lo traduce a un mensaje legible.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_usuario_crear
    @usuario        VARCHAR(30),
    @nombre         NVARCHAR(120),
    @password_hash  NVARCHAR(256),
    @telefono       VARCHAR(20)  = NULL,
    @dpi            VARCHAR(20)  = NULL,
    @licencia       VARCHAR(30)  = NULL,
    @tipo_licencia  VARCHAR(5)   = NULL,
    @licencia_vence DATE         = NULL,
    @roles          VARCHAR(500) = NULL,
    @creado_por     INT          = NULL
AS
BEGIN
    SET NOCOUNT ON;

    /* La transacción se maneja aquí y no con XACT_ABORT a secas: si el
       llamador envuelve la llamada en un TRY, un error deja la transacción
       condenada en vez de revertida, y la siguiente operación falla con 3930. */
    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO dbo.tbl_gbp_tms_usuario
            (usuario, nombre, password_hash, telefono, dpi,
             licencia, tipo_licencia, licencia_vence, debe_cambiar_password, activo)
        VALUES
            (@usuario, @nombre, @password_hash, NULLIF(@telefono, ''), NULLIF(@dpi, ''),
             NULLIF(@licencia, ''), NULLIF(@tipo_licencia, ''), @licencia_vence, 0, 1);

        DECLARE @id INT = SCOPE_IDENTITY();

        IF @roles IS NOT NULL AND LTRIM(RTRIM(@roles)) <> ''
        BEGIN
            INSERT INTO dbo.tbl_gbp_tms_usuario_rol (id_usuario, id_rol, asignado_por)
            SELECT @id, r.id_rol, @creado_por
            FROM STRING_SPLIT(@roles, ',') s
            JOIN dbo.tbl_gbp_tms_rol r ON r.nombre = LTRIM(RTRIM(s.value))
            WHERE r.activo = 1;
        END

        COMMIT TRANSACTION;

        SELECT @id AS id_usuario;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;   -- conserva el número original (2627 en duplicados)
    END CATCH
END
GO

/* ============================================================
   usp_gbp_tms_usuario_actualizar

   Reemplaza los roles por el conjunto recibido: la pantalla envía
   la selección completa, no un delta.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_usuario_actualizar
    @id_usuario     INT,
    @nombre         NVARCHAR(120),
    @telefono       VARCHAR(20)  = NULL,
    @dpi            VARCHAR(20)  = NULL,
    @licencia       VARCHAR(30)  = NULL,
    @tipo_licencia  VARCHAR(5)   = NULL,
    @licencia_vence DATE         = NULL,
    @activo         BIT,
    @roles          VARCHAR(500) = NULL,
    @asignado_por   INT          = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @filas INT = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE dbo.tbl_gbp_tms_usuario
           SET nombre         = @nombre,
               telefono       = NULLIF(@telefono, ''),
               dpi            = NULLIF(@dpi, ''),
               licencia       = NULLIF(@licencia, ''),
               tipo_licencia  = NULLIF(@tipo_licencia, ''),
               licencia_vence = @licencia_vence,
               activo         = @activo,
               -- Reactivar una cuenta bloqueada debe limpiar el contador.
               intentos_fallidos = CASE WHEN @activo = 1 THEN 0 ELSE intentos_fallidos END
         WHERE id_usuario = @id_usuario;

        SET @filas = @@ROWCOUNT;

        IF @filas > 0 AND @roles IS NOT NULL
        BEGIN
            DELETE FROM dbo.tbl_gbp_tms_usuario_rol WHERE id_usuario = @id_usuario;

            IF LTRIM(RTRIM(@roles)) <> ''
                INSERT INTO dbo.tbl_gbp_tms_usuario_rol (id_usuario, id_rol, asignado_por)
                SELECT @id_usuario, r.id_rol, @asignado_por
                FROM STRING_SPLIT(@roles, ',') s
                JOIN dbo.tbl_gbp_tms_rol r ON r.nombre = LTRIM(RTRIM(s.value))
                WHERE r.activo = 1;
        END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH

    SELECT @filas AS filas;
END
GO

/* ============================================================
   usp_gbp_tms_usuario_restablecer_password

   El administrador define la contraseña. Se limpian los intentos
   fallidos porque suele usarse justo después de un bloqueo.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_usuario_restablecer_password
    @id_usuario    INT,
    @password_hash NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.tbl_gbp_tms_usuario
       SET password_hash         = @password_hash,
           intentos_fallidos     = 0,
           debe_cambiar_password = 0
     WHERE id_usuario = @id_usuario;

    SELECT @@ROWCOUNT AS filas;
END
GO

/* ============================================================
   RESULTADO
   ============================================================ */

SELECT Procedimiento = name, Modificado = modify_date
FROM sys.procedures
WHERE name LIKE 'usp_gbp_tms_%'
ORDER BY name;
GO

SET NOEXEC OFF;
GO
