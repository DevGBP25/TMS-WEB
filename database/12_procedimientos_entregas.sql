/* ============================================================
   GBP · TMS — procedimientos de entregas sobre la orden de venta
   Ejecutar CONECTADO A DataTMS, después de 11.

   Lo que cambia respecto de 10:

     · asignar_piloto recibe órdenes, no entregas. La boleta y la
       factura son opcionales porque puede que SAP todavía no las
       haya generado.
     · vincular es nuevo: completa una boleta planificada con la
       entrega y la factura cuando SAP las emite.
     · listar y obtener devuelven la orden, la hora del documento
       y la fecha comprometida.
     · el viaje no despacha boletas sin factura, y cancelarlo las
       devuelve a ASIGNADA (antes las dejaba en un estado que ya
       no existe y el motor rechazaba la operación).
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

IF TYPE_ID('dbo.tp_gbp_tms_entrega_asignar') IS NULL
BEGIN
    RAISERROR('Faltan los tipos de tabla. Ejecute antes 11_entrega_desde_orden.sql.', 16, 1);
    SET NOEXEC ON;
END
GO

/* ============================================================
   usp_gbp_tms_entrega_asignar_piloto

   Aquí nace la fila. Recibe la orden de venta tal como la acaba
   de leer la API, sus productos, y —si SAP ya las generó— la
   entrega y la factura.

   Todo o nada: si una orden del grupo ya fue tomada por otro, no
   se asigna ninguna. Asignar la mitad sin avisar es peor, porque
   el supervisor no lo nota.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_entrega_asignar_piloto
    @id_piloto INT,
    @ordenes   dbo.tp_gbp_tms_entrega_asignar READONLY,
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

    IF NOT EXISTS (SELECT 1 FROM @ordenes)
    BEGIN
        RAISERROR('No se recibió ninguna orden.', 16, 1);
        RETURN;
    END

    DECLARE @malas NVARCHAR(400);

    /* Ya repartida, mirando por los dos lados: por la orden —lo normal— y
       por la entrega, que puede haber entrado por una fila antigua. */
    SELECT @malas = STRING_AGG(CONVERT(VARCHAR(12), n.sap_orden_venta), ', ')
    FROM @ordenes n
    JOIN dbo.tbl_gbp_tms_entrega e
      ON  e.sap_orden_doc_entry = n.sap_orden_doc_entry
      OR  e.sap_orden_venta     = n.sap_orden_venta
      OR (e.sap_doc_entry IS NOT NULL AND e.sap_doc_entry = n.sap_doc_entry);

    IF @malas IS NOT NULL
    BEGIN
        RAISERROR('Estas órdenes ya fueron repartidas: %s', 16, 1, @malas);
        RETURN;
    END

    DECLARE @nuevas TABLE (id_entrega INT NOT NULL, sap_orden_doc_entry INT NOT NULL);

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO dbo.tbl_gbp_tms_entrega
            (sap_orden_doc_entry, sap_orden_venta, sap_doc_entry, sap_doc_num, sap_factura_num,
             cliente_codigo, cliente_nombre, direccion, municipio,
             peso_kg, monto, fecha_documento, hora_documento, fecha_entrega,
             estado, id_usuario_piloto, asignada_en)
        OUTPUT inserted.id_entrega, inserted.sap_orden_doc_entry INTO @nuevas
        SELECT
            n.sap_orden_doc_entry, n.sap_orden_venta, n.sap_doc_entry, n.sap_doc_num, n.sap_factura_num,
            n.cliente_codigo, n.cliente_nombre, n.direccion, n.municipio,
            n.peso_kg, n.monto, n.fecha_documento, n.hora_documento, n.fecha_entrega,
            'ASIGNADA', @id_piloto, SYSUTCDATETIME()
        FROM @ordenes n;

        INSERT INTO dbo.tbl_gbp_tms_entrega_linea
            (id_entrega, linea_num, codigo_articulo, codigo_barras,
             descripcion, cantidad, unidad, almacen)
        SELECT
            v.id_entrega, l.linea_num, l.codigo_articulo, l.codigo_barras,
            l.descripcion, l.cantidad, l.unidad, l.almacen
        FROM @lineas l
        JOIN @nuevas v ON v.sap_orden_doc_entry = l.sap_orden_doc_entry;

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
   usp_gbp_tms_entrega_vincular

   Completa lo que al asignar no existía: la entrega que SAP
   terminó generando y su factura. Es lo que cierra el círculo
   de planificar con días de anticipación.

   No toca las que ya están vinculadas ni las que apuntan a una
   entrega que otra fila ya tiene.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_entrega_vincular
    @vinculos dbo.tp_gbp_tms_entrega_vinculo READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @cambios TABLE (id_entrega INT NOT NULL);

    BEGIN TRY
        BEGIN TRANSACTION;

        UPDATE e
        SET e.sap_doc_entry        = v.sap_doc_entry,
            e.sap_doc_num          = v.sap_doc_num,
            e.sap_factura_num      = ISNULL(v.sap_factura_num, e.sap_factura_num),
            /* SAP anuló el documento después de repartirlo: la boleta deja de
               ser despachable, pero se conserva para que quede el rastro. */
            e.estado               = CASE WHEN v.anulada = 1 THEN 'ANULADA' ELSE e.estado END,
            e.id_viaje             = CASE WHEN v.anulada = 1 THEN NULL ELSE e.id_viaje END,
            e.secuencia            = CASE WHEN v.anulada = 1 THEN NULL ELSE e.secuencia END,
            e.fecha_sincronizacion = SYSUTCDATETIME()
        OUTPUT inserted.id_entrega INTO @cambios
        FROM dbo.tbl_gbp_tms_entrega e
        JOIN @vinculos v ON v.sap_orden_doc_entry = e.sap_orden_doc_entry
        WHERE (e.sap_doc_entry IS NULL OR e.sap_factura_num IS NULL OR v.anulada = 1)
          AND NOT EXISTS (SELECT 1 FROM dbo.tbl_gbp_tms_entrega o
                          WHERE o.sap_doc_entry = v.sap_doc_entry
                            AND o.id_entrega   <> e.id_entrega);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH

    SELECT vinculadas = (SELECT COUNT(*) FROM @cambios);
END
GO

/* ============================================================
   usp_gbp_tms_entrega_pendientes_de_boleta

   Las que se repartieron antes de que existiera la entrega. La
   API las usa para saber a qué clientes y fechas preguntarle a
   SAP, que es lo que hace barata la consulta.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_entrega_pendientes_de_boleta
    @dias INT = 30
AS
BEGIN
    SET NOCOUNT ON;

    IF @dias IS NULL OR @dias < 1 SET @dias = 30;

    SELECT
        e.id_entrega,
        e.sap_orden_doc_entry,
        e.sap_orden_venta,
        e.cliente_codigo,
        e.fecha_documento,
        e.sap_doc_entry,
        e.sap_factura_num
    FROM dbo.tbl_gbp_tms_entrega e
    WHERE e.estado IN ('ASIGNADA','EN_RUTA')
      AND e.sap_orden_doc_entry IS NOT NULL
      AND (e.sap_doc_entry IS NULL OR e.sap_factura_num IS NULL)
      AND e.fecha_documento >= DATEADD(DAY, -@dias, CAST(SYSDATETIME() AS DATE))
    ORDER BY e.fecha_documento;
END
GO

/* ============================================================
   usp_gbp_tms_entrega_listar
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
        e.sap_orden_doc_entry,
        e.sap_orden_venta,
        e.sap_factura_num,
        e.cliente_codigo,
        e.cliente_nombre,
        e.direccion,
        e.municipio,
        e.peso_kg,
        e.monto,
        e.fecha_documento,
        e.hora_documento,
        e.fecha_entrega,
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
        e.sap_orden_doc_entry,
        e.sap_orden_venta,
        e.sap_factura_num,
        e.cliente_codigo,
        e.cliente_nombre,
        e.direccion,
        e.municipio,
        e.peso_kg,
        e.monto,
        e.fecha_documento,
        e.hora_documento,
        e.fecha_entrega,
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
   usp_gbp_tms_viaje_cambiar_estado

   Se rehace por dos motivos que sólo aparecen con la nueva
   forma de trabajar:

     · Despachar exige factura. Antes lo garantizaba la fila
       misma —no se guardaba sin factura—; ahora la boleta se
       planifica antes de que exista, así que la regla se
       comprueba aquí, con un mensaje que nombra las boletas.
     · Cancelar dejaba las boletas en 'PENDIENTE', un estado que
       el CHECK ya no admite: la cancelación fallaba. Vuelven a
       ASIGNADA, que es lo que son: con piloto y sin viaje.
   ============================================================ */

CREATE OR ALTER PROCEDURE dbo.usp_gbp_tms_viaje_cambiar_estado
    @id_viaje      INT,
    @estado        VARCHAR(20),
    @observaciones NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @actual VARCHAR(20);
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

    DECLARE @malas NVARCHAR(400);

    IF @estado = 'EN_RUTA'
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM dbo.tbl_gbp_tms_entrega WHERE id_viaje = @id_viaje)
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

        /* Sin factura no sale mercadería. Se planifica con días de
           anticipación, pero al momento de salir la factura tiene que estar. */
        SELECT @malas = STRING_AGG(CONVERT(VARCHAR(12), ISNULL(sap_doc_num, sap_orden_venta)), ', ')
        FROM dbo.tbl_gbp_tms_entrega
        WHERE id_viaje = @id_viaje AND estado = 'ASIGNADA' AND sap_factura_num IS NULL;

        IF @malas IS NOT NULL
        BEGIN
            RAISERROR('Estas boletas todavía no tienen factura en SAP: %s', 16, 1, @malas);
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

        /* Cancelar libera la carga: esas boletas siguen siendo de su piloto
           y vuelven a estar disponibles para armar otro viaje. */
        IF @estado = 'CANCELADO'
            UPDATE dbo.tbl_gbp_tms_entrega
            SET estado = 'ASIGNADA', id_viaje = NULL, secuencia = NULL
            WHERE id_viaje = @id_viaje AND estado IN ('ASIGNADA','EN_RUTA');

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

PRINT '';
PRINT '>> Procedimientos de entregas actualizados.';
PRINT '   Se reparte desde la orden; la boleta y la factura se vinculan después.';
GO
