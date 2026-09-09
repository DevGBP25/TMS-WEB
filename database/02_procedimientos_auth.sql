/* ============================================================
   GBP · TMS — procedimientos de autenticación
   Ejecutar CONECTADO A DataTMS.

   Toda consulta a las tablas pasa por aquí: la API no lleva SQL.
   CREATE OR ALTER permite reejecutar el script sin borrar nada.
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
   usp_gbp_tms_auth_obtener_usuario

   Datos necesarios para validar un intento de acceso. Devuelve
   DOS conjuntos: la fila del usuario y sus roles activos.

   Deliberadamente NO decide si el acceso procede: la comparación
   del hash ocurre en la API, que es donde vive el algoritmo.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_auth_obtener_usuario
    @usuario VARCHAR(30)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.id_usuario,
        u.usuario,
        u.nombre,
        u.telefono,
        u.password_hash,
        u.debe_cambiar_password,
        u.intentos_fallidos,
        u.activo,
        u.ultimo_acceso,
        u.licencia_vence
    FROM dbo.tbl_gbp_tms_usuario u
    WHERE u.usuario = @usuario;

    SELECT r.nombre, r.permisos_json
    FROM dbo.tbl_gbp_tms_usuario_rol ur
    JOIN dbo.tbl_gbp_tms_usuario     u ON u.id_usuario = ur.id_usuario
    JOIN dbo.tbl_gbp_tms_rol         r ON r.id_rol     = ur.id_rol
    WHERE u.usuario = @usuario
      AND ur.activo = 1
      AND r.activo  = 1
    ORDER BY r.nombre;
END
GO

/* ============================================================
   usp_gbp_tms_auth_registrar_intento

   Deja constancia del intento y actualiza el estado del usuario
   en una sola transacción: si se hiciera desde la API en dos
   llamadas, un fallo entre ambas dejaría el contador desalineado.

   Al alcanzar @max_intentos la cuenta se desactiva. No hay bloqueo
   temporal: la reactiva el administrador.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_auth_registrar_intento
    @id_usuario      INT           = NULL,
    @usuario_intento VARCHAR(30)   = NULL,
    @exitoso         BIT,
    @motivo          VARCHAR(40)   = NULL,
    @plataforma      VARCHAR(10)   = NULL,
    @ip_address      VARCHAR(45)   = NULL,
    @max_intentos    TINYINT       = 5,
    @desactivado     BIT           = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @desactivado = 0;

    /* La transacción se revierte aquí y no se delega a XACT_ABORT: bajo un TRY
       del llamador, el error la dejaría condenada en vez de deshecha. */
    BEGIN TRY
        BEGIN TRANSACTION;

    INSERT INTO dbo.tbl_gbp_tms_log_acceso
        (id_usuario, usuario_intento, exitoso, motivo, plataforma, ip_address)
    VALUES
        (@id_usuario, @usuario_intento, @exitoso, @motivo, @plataforma, @ip_address);

    IF @id_usuario IS NOT NULL
    BEGIN
        IF @exitoso = 1
        BEGIN
            UPDATE dbo.tbl_gbp_tms_usuario
               SET intentos_fallidos = 0,
                   ultimo_acceso     = SYSUTCDATETIME()
             WHERE id_usuario = @id_usuario;
        END
        ELSE
        BEGIN
            UPDATE dbo.tbl_gbp_tms_usuario
               SET intentos_fallidos = CASE WHEN intentos_fallidos >= 255
                                            THEN 255 ELSE intentos_fallidos + 1 END
             WHERE id_usuario = @id_usuario;

            -- Sólo desactiva cuentas que aún estaban activas.
            UPDATE dbo.tbl_gbp_tms_usuario
               SET activo = 0
             WHERE id_usuario        = @id_usuario
               AND activo            = 1
               AND intentos_fallidos >= @max_intentos;

            IF @@ROWCOUNT > 0
            BEGIN
                SET @desactivado = 1;

                INSERT INTO dbo.tbl_gbp_tms_log_acceso
                    (id_usuario, usuario_intento, exitoso, motivo, plataforma, ip_address)
                VALUES
                    (@id_usuario, @usuario_intento, 0, 'CUENTA_DESACTIVADA', @plataforma, @ip_address);
            END
        END
    END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ============================================================
   usp_gbp_tms_sesion_crear

   Registra el token emitido. Se consulta para auditoría, no en
   cada petición: el token se valida por firma y vencimiento.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_sesion_crear
    @id_usuario       INT,
    @token_jti        VARCHAR(64),
    @plataforma       VARCHAR(10),
    @dispositivo      VARCHAR(100) = NULL,
    @ip_address       VARCHAR(45)  = NULL,
    @fecha_expiracion DATETIME2(0)
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.tbl_gbp_tms_sesion
        (id_usuario, token_jti, plataforma, dispositivo, ip_address, fecha_expiracion)
    VALUES
        (@id_usuario, @token_jti, @plataforma, @dispositivo, @ip_address, @fecha_expiracion);

    SELECT CONVERT(BIGINT, SCOPE_IDENTITY()) AS id_sesion;
END
GO

/* ============================================================
   usp_gbp_tms_sesion_cerrar

   Marca la sesión como inactiva. El token sigue siendo válido
   hasta que expire: esto es para la bitácora, no revocación.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_sesion_cerrar
    @token_jti VARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.tbl_gbp_tms_sesion
       SET activa = 0
     WHERE token_jti = @token_jti
       AND activa    = 1;

    SELECT @@ROWCOUNT AS filas;
END
GO

/* ============================================================
   usp_gbp_tms_usuario_cambiar_password

   El hash llega ya calculado desde la API, que es donde vive el
   algoritmo. La verificación de la contraseña actual también ocurre
   allí: este procedimiento sólo persiste el cambio.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_usuario_cambiar_password
    @id_usuario    INT,
    @password_hash NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.tbl_gbp_tms_usuario
       SET password_hash         = @password_hash,
           debe_cambiar_password = 0,
           intentos_fallidos     = 0
     WHERE id_usuario = @id_usuario
       AND activo     = 1;

    SELECT @@ROWCOUNT AS filas;
END
GO

/* ============================================================
   usp_gbp_tms_usuario_obtener

   Datos del usuario autenticado, para /api/auth/yo. Devuelve
   la fila y sus roles, igual que el de login pero sin el hash.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_usuario_obtener
    @id_usuario INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.id_usuario,
        u.usuario,
        u.nombre,
        u.telefono,
        u.debe_cambiar_password,
        u.activo,
        u.ultimo_acceso,
        u.licencia,
        u.tipo_licencia,
        u.licencia_vence
    FROM dbo.tbl_gbp_tms_usuario u
    WHERE u.id_usuario = @id_usuario;

    SELECT r.nombre, r.permisos_json
    FROM dbo.tbl_gbp_tms_usuario_rol ur
    JOIN dbo.tbl_gbp_tms_rol r ON r.id_rol = ur.id_rol
    WHERE ur.id_usuario = @id_usuario
      AND ur.activo = 1
      AND r.activo  = 1
    ORDER BY r.nombre;
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
