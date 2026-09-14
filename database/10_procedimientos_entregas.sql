/* ============================================================
   GBP · TMS — procedimientos de entregas (versión definitiva)
   Ejecutar CONECTADO A DataTMS, después de 09.

   Reemplaza a los que traía 06. La diferencia de fondo: aquí no
   hay sincronización. La lista de boletas disponibles se lee en
   vivo de SAP y no toca la base; lo único que se guarda es la
   boleta que ya tiene piloto, con sus productos.
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
   usp_gbp_tms_entrega_tomadas

   De un conjunto de documentos de SAP, cuáles ya están en el TMS.
   Es lo que permite mostrar la vista de SAP sin ofrecer boletas
   que alguien ya asignó.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_entrega_tomadas
    @doc_entries dbo.tp_gbp_tms_id READONLY
AS
BEGIN
    SET NOCOUNT ON;

    SELECT e.sap_doc_entry
    FROM dbo.tbl_gbp_tms_entrega e
    JOIN @doc_entries d ON d.id = e.sap_doc_entry;
END
GO

/* ============================================================
   usp_gbp_tms_entrega_ordenes_tomadas

   Lo mismo pero del lado de la orden de venta, que es por donde
   lista la pantalla: de estas órdenes, cuáles ya tienen su
   entrega asignada a un piloto.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_entrega_ordenes_tomadas
    @ordenes dbo.tp_gbp_tms_id READONLY
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT e.sap_orden_venta
    FROM dbo.tbl_gbp_tms_entrega e
    JOIN @ordenes o ON o.id = e.sap_orden_venta
    WHERE e.sap_orden_venta IS NOT NULL;
END
GO

/* ============================================================
   usp_gbp_tms_entrega_asignar_piloto

   Aquí nace la fila. Recibe los datos del documento tal como los
   acaba de leer la API de SAP, más sus líneas, y las inserta con
   el piloto ya puesto.

   Todo o nada: si una boleta del grupo ya fue tomada por otro, no
   se asigna ninguna. Asignar la mitad sin avisar es peor, porque
   el supervisor no lo nota.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_entrega_asignar_piloto
    @id_piloto INT,
    @entregas  dbo.tp_gbp_tms_entrega_asignar READONLY,
    @lineas    dbo.tp_gbp_tms_entrega_linea   READONLY
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

    IF NOT EXISTS (SELECT 1 FROM @entregas)
    BEGIN
        RAISERROR('No se recibió ninguna boleta.', 16, 1);
        RETURN;
    END

    DECLARE @malas NVARCHAR(400);

    /* La API ya filtró por factura, pero la regla vive también aquí: es la
       única capa por la que pasan todos los caminos. */
    SELECT @malas = STRING_AGG(CONVERT(VARCHAR(12), sap_doc_num), ', ')
    FROM @entregas WHERE sap_factura_num IS NULL;

    IF @malas IS NOT NULL
    BEGIN
        RAISERROR('Estas boletas no tienen factura: %s', 16, 1, @malas);
        RETURN;
    END

    SELECT @malas = STRING_AGG(CONVERT(VARCHAR(12), n.sap_doc_num), ', ')
    FROM @entregas n
    JOIN dbo.tbl_gbp_tms_entrega e ON e.sap_doc_entry = n.sap_doc_entry;

    IF @malas IS NOT NULL
    BEGIN
        RAISERROR('Estas boletas ya fueron asignadas: %s', 16, 1, @malas);
        RETURN;
    END

    DECLARE @nuevas TABLE (id_entrega INT NOT NULL, sap_doc_entry INT NOT NULL);

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO dbo.tbl_gbp_tms_entrega
            (sap_doc_entry, sap_doc_num, sap_orden_venta, sap_factura_num,
             cliente_codigo, cliente_nombre, direccion, municipio,
             peso_kg, monto, fecha_documento,
             estado, id_usuario_piloto, asignada_en)
        OUTPUT inserted.id_entrega, inserted.sap_doc_entry INTO @nuevas
        SELECT
            n.sap_doc_entry, n.sap_doc_num, n.sap_orden_venta, n.sap_factura_num,
            n.cliente_codigo, n.cliente_nombre, n.direccion, n.municipio,
            n.peso_kg, n.monto, n.fecha_documento,
            'ASIGNADA', @id_piloto, SYSUTCDATETIME()
        FROM @entregas n;

        INSERT INTO dbo.tbl_gbp_tms_entrega_linea
            (id_entrega, linea_num, codigo_articulo, codigo_barras,
             descripcion, cantidad, unidad, almacen)
        SELECT
            v.id_entrega, l.linea_num, l.codigo_articulo, l.codigo_barras,
            l.descripcion, l.cantidad, l.unidad, l.almacen
        FROM @lineas l
        JOIN @nuevas v ON v.sap_doc_entry = l.sap_doc_entry;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH

    SELECT asignadas = (SELECT COUNT(*) FROM @nuevas);
END
GO

/* ============================================================
   usp_gbp_tms_entrega_liberar

   Devuelve la boleta a SAP: se borra la fila y vuelve a aparecer
   en la lista de disponibles. Sólo mientras no haya salido; una
   vez en ruta, lo que corresponde es un rechazo del piloto.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_entrega_liberar
    @ids dbo.tp_gbp_tms_id READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @malas NVARCHAR(400);

    SELECT @malas = STRING_AGG(CONVERT(VARCHAR(12), e.sap_doc_num), ', ')
    FROM dbo.tbl_gbp_tms_entrega e
    JOIN @ids i ON i.id = e.id_entrega
    WHERE e.estado <> 'ASIGNADA';

    IF @malas IS NOT NULL
    BEGIN
        RAISERROR('Sólo se pueden liberar boletas asignadas. Estas ya salieron: %s', 16, 1, @malas);
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

/* ============================================================
   usp_gbp_tms_entrega_listar

   Sólo lo que el TMS administra: boletas ya asignadas. Lo
   disponible no está aquí, se lee de SAP.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_entrega_listar
    @buscar    NVARCHAR(80) = NULL,
    @estado    VARCHAR(20)  = NULL,
    @municipio NVARCHAR(80) = NULL,
    @desde     DATE         = NULL,
    @hasta     DATE         = NULL,
    @id_viaje  INT          = NULL,
    @id_piloto INT          = NULL,
    @sin_viaje BIT          = 0,
    @pagina    INT          = 1,
    @tamano    INT          = 50
AS
BEGIN
    SET NOCOUNT ON;

    IF @pagina < 1 SET @pagina = 1;
    IF @tamano < 1 OR @tamano > 500 SET @tamano = 50;

    /* COUNT(*) OVER() se calcula antes del OFFSET, así que devuelve el total
       real de la consulta y no el de la página. Evita una segunda pasada. */
    SELECT
        total = COUNT(*) OVER(),
        e.id_entrega,
        e.sap_doc_entry,
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
        e.id_viaje,
        e.secuencia,
        e.id_usuario_piloto,
        e.asignada_en,
        e.receptor,
        e.motivo_rechazo,
        e.entregada_en,
        e.fecha_sincronizacion,
        piloto_nombre = pil.nombre,
        viaje_numero  = v.numero,
        viaje_fecha   = v.fecha,
        unidad_codigo = u.codigo,
        articulos     = (SELECT COUNT(*) FROM dbo.tbl_gbp_tms_entrega_linea l
                         WHERE l.id_entrega = e.id_entrega)
    FROM dbo.tbl_gbp_tms_entrega e
    JOIN      dbo.tbl_gbp_tms_usuario pil ON pil.id_usuario = e.id_usuario_piloto
    LEFT JOIN dbo.tbl_gbp_tms_viaje   v   ON v.id_viaje     = e.id_viaje
    LEFT JOIN dbo.tbl_gbp_tms_unidad  u   ON u.id_unidad    = v.id_unidad
    WHERE (@estado    IS NULL OR e.estado    = @estado)
      AND (@municipio IS NULL OR e.municipio = @municipio)
      AND (@desde     IS NULL OR e.fecha_documento >= @desde)
      AND (@hasta     IS NULL OR e.fecha_documento <= @hasta)
      AND (@id_viaje  IS NULL OR e.id_viaje  = @id_viaje)
      AND (@id_piloto IS NULL OR e.id_usuario_piloto = @id_piloto)
      AND (@sin_viaje = 0      OR e.id_viaje IS NULL)
      AND (@buscar IS NULL
           OR e.cliente_nombre LIKE '%' + @buscar + '%'
           OR e.cliente_codigo LIKE '%' + @buscar + '%'
           OR e.direccion      LIKE '%' + @buscar + '%'
           OR pil.nombre       LIKE '%' + @buscar + '%'
           OR CONVERT(VARCHAR(12), e.sap_doc_num)     = @buscar
           OR CONVERT(VARCHAR(12), e.sap_orden_venta) = @buscar
           OR CONVERT(VARCHAR(12), e.sap_factura_num) = @buscar)
    ORDER BY e.asignada_en DESC, e.id_entrega DESC
    OFFSET (@pagina - 1) * @tamano ROWS FETCH NEXT @tamano ROWS ONLY;
END
GO

/* ============================================================
   usp_gbp_tms_entrega_obtener

   Dos conjuntos: la boleta y sus productos. La pantalla de
   detalle no sirve de nada con una mitad sin la otra.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_entrega_obtener
    @id_entrega INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        e.id_entrega,
        e.sap_doc_entry,
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
        e.id_viaje,
        e.secuencia,
        e.id_usuario_piloto,
        e.asignada_en,
        e.receptor,
        e.motivo_rechazo,
        e.entregada_en,
        e.observaciones,
        e.fecha_sincronizacion,
        e.fecha_creacion,
        piloto_nombre   = pil.nombre,
        piloto_usuario  = pil.usuario,
        piloto_telefono = pil.telefono,
        viaje_numero    = v.numero,
        viaje_fecha     = v.fecha,
        viaje_estado    = v.estado,
        unidad_codigo   = u.codigo,
        unidad_placa    = u.placa
    FROM dbo.tbl_gbp_tms_entrega e
    JOIN      dbo.tbl_gbp_tms_usuario pil ON pil.id_usuario = e.id_usuario_piloto
    LEFT JOIN dbo.tbl_gbp_tms_viaje   v   ON v.id_viaje     = e.id_viaje
    LEFT JOIN dbo.tbl_gbp_tms_unidad  u   ON u.id_unidad    = v.id_unidad
    WHERE e.id_entrega = @id_entrega;

    SELECT
        l.linea_num,
        l.codigo_articulo,
        l.codigo_barras,
        l.descripcion,
        l.cantidad,
        l.unidad,
        l.almacen
    FROM dbo.tbl_gbp_tms_entrega_linea l
    WHERE l.id_entrega = @id_entrega
    ORDER BY l.linea_num;
END
GO

/* ============================================================
   usp_gbp_tms_entrega_resumen

   Contadores de lo que el TMS administra. Lo pendiente de
   asignar ya no se cuenta aquí: vive en SAP.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_entrega_resumen
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        asignadas  = SUM(CASE WHEN estado = 'ASIGNADA'  THEN 1 ELSE 0 END),
        en_ruta    = SUM(CASE WHEN estado = 'EN_RUTA'   THEN 1 ELSE 0 END),
        entregadas = SUM(CASE WHEN estado = 'ENTREGADA' THEN 1 ELSE 0 END),
        rechazadas = SUM(CASE WHEN estado = 'RECHAZADA' THEN 1 ELSE 0 END),
        anuladas   = SUM(CASE WHEN estado = 'ANULADA'   THEN 1 ELSE 0 END),
        sin_viaje  = SUM(CASE WHEN id_viaje IS NULL AND estado = 'ASIGNADA' THEN 1 ELSE 0 END)
    FROM dbo.tbl_gbp_tms_entrega;
END
GO

/* ============================================================
   usp_gbp_tms_entrega_asignar

   Agrupa boletas ya asignadas en un viaje, para darles camión y
   despacharlas juntas. No cambia de quién son: el piloto se puso
   al asignar la boleta.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_entrega_asignar
    @id_viaje INT,
    @ids      dbo.tp_gbp_tms_id READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @estado_viaje VARCHAR(20);
    SELECT @estado_viaje = estado FROM dbo.tbl_gbp_tms_viaje WHERE id_viaje = @id_viaje;

    IF @estado_viaje IS NULL
    BEGIN
        RAISERROR('El viaje indicado no existe.', 16, 1);
        RETURN;
    END

    IF @estado_viaje NOT IN ('PLANIFICADO','ASIGNADO')
    BEGIN
        RAISERROR('El viaje ya salió (%s); no admite cambios en su carga.', 16, 1, @estado_viaje);
        RETURN;
    END

    IF NOT EXISTS (SELECT 1 FROM @ids)
    BEGIN
        RAISERROR('No se recibió ninguna boleta.', 16, 1);
        RETURN;
    END

    DECLARE @malas NVARCHAR(400);

    SELECT @malas = STRING_AGG(CONVERT(VARCHAR(12), e.sap_doc_num), ', ')
    FROM dbo.tbl_gbp_tms_entrega e
    JOIN @ids i ON i.id = e.id_entrega
    WHERE e.estado <> 'ASIGNADA' OR e.id_viaje IS NOT NULL;

    IF @malas IS NOT NULL
    BEGIN
        RAISERROR('Estas boletas ya salieron o ya están en otro viaje: %s', 16, 1, @malas);
        RETURN;
    END

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @desde INT = ISNULL(
            (SELECT MAX(secuencia) FROM dbo.tbl_gbp_tms_entrega WHERE id_viaje = @id_viaje), 0);

        /* La secuencia inicial agrupa por municipio: es el orden que el
           supervisor reordena después, no una optimización de ruta. */
        ;WITH orden AS (
            SELECT e.id_entrega,
                   n = ROW_NUMBER() OVER (ORDER BY e.municipio, e.cliente_nombre)
            FROM dbo.tbl_gbp_tms_entrega e
            JOIN @ids i ON i.id = e.id_entrega
        )
        UPDATE e
        SET e.id_viaje  = @id_viaje,
            e.secuencia = @desde + o.n
        FROM dbo.tbl_gbp_tms_entrega e
        JOIN orden o ON o.id_entrega = e.id_entrega;

        EXEC dbo.usp_gbp_tms_viaje_recalcular @id_viaje;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH

    SELECT asignadas = (SELECT COUNT(*) FROM @ids);
END
GO

/* Los que quedaron sin uso al cambiar el enfoque. */
IF OBJECT_ID('dbo.usp_gbp_tms_entrega_quitar', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE dbo.usp_gbp_tms_entrega_quitar;
    PRINT '>> usp_gbp_tms_entrega_quitar eliminado: lo reemplaza _liberar.';
END
GO

PRINT '';
PRINT '>> Procedimientos de entregas listos.';
PRINT '   La lista de disponibles ya no consulta la base: viene de SAP.';
GO
