/* ============================================================
   Prueba de humo del módulo de entregas.
   SÓLO PARA UNA BASE LOCAL DE DESARROLLO. No ejecutar en producción.

   Recorre el flujo completo: sincronizar, asignar, despachar y
   comprobar que cada regla rechaza lo que debe rechazar.
   ============================================================ */

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO

/* Este script escribe y borra datos. Comparar el nombre del servidor no
   sirve de guardarraíl —siempre coincide consigo mismo—, así que se exige
   una confirmación explícita: cambie el 0 por 1 para ejecutarlo. */
DECLARE @confirmar BIT = 0;

IF @confirmar = 0
BEGIN
    RAISERROR('Script de prueba: inserta y borra datos. Ponga @confirmar = 1 y ejecútelo SÓLO en una base local.', 16, 1);
    SET NOEXEC ON;
END
GO

PRINT '=== 1. Datos mínimos ===';

-- Un piloto y una unidad para poder asignar.
DECLARE @id_piloto INT, @id_unidad INT, @id_rol INT;

SELECT @id_rol = id_rol FROM dbo.tbl_gbp_tms_rol WHERE nombre = 'PILOTO';

IF NOT EXISTS (SELECT 1 FROM dbo.tbl_gbp_tms_usuario WHERE usuario = 'piloto.prueba')
BEGIN
    INSERT INTO dbo.tbl_gbp_tms_usuario (usuario, nombre, password_hash, activo)
    VALUES ('piloto.prueba', N'Piloto de prueba', 'x', 1);
END

SELECT @id_piloto = id_usuario FROM dbo.tbl_gbp_tms_usuario WHERE usuario = 'piloto.prueba';

IF NOT EXISTS (SELECT 1 FROM dbo.tbl_gbp_tms_usuario_rol WHERE id_usuario = @id_piloto AND id_rol = @id_rol)
    INSERT INTO dbo.tbl_gbp_tms_usuario_rol (id_usuario, id_rol) VALUES (@id_piloto, @id_rol);

IF NOT EXISTS (SELECT 1 FROM dbo.tbl_gbp_tms_unidad WHERE codigo = 'PRB-01')
    INSERT INTO dbo.tbl_gbp_tms_unidad (codigo, placa, capacidad_kg, estado, activo)
    VALUES ('PRB-01', 'P-999PRB', 1000, 'DISPONIBLE', 1);

PRINT '   ok';
GO

PRINT '';
PRINT '=== 2. Sincronizar tres entregas (una sin factura) ===';

DECLARE @sap dbo.tp_gbp_tms_entrega_sap;

INSERT INTO @sap (sap_doc_entry, sap_doc_num, sap_orden_venta, sap_factura_num,
                  cliente_codigo, cliente_nombre, direccion, municipio,
                  peso_kg, monto, fecha_documento, anulada)
VALUES
    (9001, 153755, 125962, 202814, 'CL008', N'NUEVOS ALMACENES S.A.', N'Zona 4', N'Guatemala', 120.5, 104.20, '2026-09-10', 0),
    (9002, 153756, 125963, 202815, 'CL009', N'FERRETERIA EL SOL',      N'Zona 1', N'Mixco',     80.0,  560.00, '2026-09-10', 0),
    (9003, 153757, 125964, NULL,   'CL010', N'ILUMINACION TOTAL',      N'Zona 9', N'Villa Nueva', 45.0, 320.00, '2026-09-10', 0);

EXEC dbo.usp_gbp_tms_entrega_sincronizar @sap;

SELECT estado, total = COUNT(*) FROM dbo.tbl_gbp_tms_entrega GROUP BY estado;
GO

PRINT '';
PRINT '=== 3. Repetir la sincronización: debe actualizar, no duplicar ===';

DECLARE @sap2 dbo.tp_gbp_tms_entrega_sap;
INSERT INTO @sap2 (sap_doc_entry, sap_doc_num, sap_orden_venta, sap_factura_num,
                   cliente_codigo, cliente_nombre, direccion, municipio,
                   peso_kg, monto, fecha_documento, anulada)
VALUES (9003, 153757, 125964, 202816, 'CL010', N'ILUMINACION TOTAL', N'Zona 9', N'Villa Nueva', 45.0, 320.00, '2026-09-10', 0);

EXEC dbo.usp_gbp_tms_entrega_sincronizar @sap2;

PRINT '   filas totales (deben ser 3):';
SELECT filas = COUNT(*) FROM dbo.tbl_gbp_tms_entrega;
PRINT '   la 9003 ya con factura debe estar PENDIENTE:';
SELECT sap_doc_entry, sap_factura_num, estado FROM dbo.tbl_gbp_tms_entrega WHERE sap_doc_entry = 9003;
GO

PRINT '';
PRINT '=== 4. Crear viaje y asignarle dos entregas ===';

DECLARE @id_piloto INT, @id_unidad INT, @id_viaje INT;
SELECT @id_piloto = id_usuario FROM dbo.tbl_gbp_tms_usuario WHERE usuario = 'piloto.prueba';
SELECT @id_unidad = id_unidad  FROM dbo.tbl_gbp_tms_unidad  WHERE codigo  = 'PRB-01';

CREATE TABLE #creado (id_viaje INT, numero VARCHAR(20));
INSERT INTO #creado EXEC dbo.usp_gbp_tms_viaje_crear @fecha = '2026-09-10', @id_unidad = @id_unidad, @id_piloto = @id_piloto;
SELECT @id_viaje = id_viaje FROM #creado;
SELECT numero_generado = numero FROM #creado;

DECLARE @ids dbo.tp_gbp_tms_id;
INSERT INTO @ids (id) SELECT id_entrega FROM dbo.tbl_gbp_tms_entrega WHERE sap_doc_entry IN (9001, 9002);

EXEC dbo.usp_gbp_tms_entrega_asignar @id_viaje, @ids;

PRINT '   totales del viaje (peso 200.5, 2 entregas):';
SELECT numero, estado, peso_kg, total_entregas FROM dbo.tbl_gbp_tms_viaje WHERE id_viaje = @id_viaje;

DROP TABLE #creado;
GO

PRINT '';
PRINT '=== 5. Reglas que deben rechazar ===';

DECLARE @id_viaje INT = (SELECT TOP 1 id_viaje FROM dbo.tbl_gbp_tms_viaje ORDER BY id_viaje DESC);

PRINT '   a) asignar una entrega ya asignada:';
BEGIN TRY
    DECLARE @ya dbo.tp_gbp_tms_id;
    INSERT INTO @ya (id) SELECT id_entrega FROM dbo.tbl_gbp_tms_entrega WHERE sap_doc_entry = 9001;
    EXEC dbo.usp_gbp_tms_entrega_asignar @id_viaje, @ya;
    PRINT '      FALLO: lo permitió';
END TRY
BEGIN CATCH
    PRINT '      ok, rechazado: ' + ERROR_MESSAGE();
END CATCH
GO

DECLARE @id_viaje INT = (SELECT TOP 1 id_viaje FROM dbo.tbl_gbp_tms_viaje ORDER BY id_viaje DESC);

PRINT '   b) despachar con las entregas correctas:';
BEGIN TRY
    EXEC dbo.usp_gbp_tms_viaje_cambiar_estado @id_viaje, 'EN_RUTA';
    PRINT '      ok, despachado';
END TRY
BEGIN CATCH
    PRINT '      FALLO: ' + ERROR_MESSAGE();
END CATCH

PRINT '   las entregas deben haber pasado a EN_RUTA:';
SELECT estado, n = COUNT(*) FROM dbo.tbl_gbp_tms_entrega WHERE id_viaje = @id_viaje GROUP BY estado;

PRINT '   c) quitar una entrega de un viaje que ya salió:';
BEGIN TRY
    DECLARE @q dbo.tp_gbp_tms_id;
    INSERT INTO @q (id) SELECT id_entrega FROM dbo.tbl_gbp_tms_entrega WHERE sap_doc_entry = 9001;
    EXEC dbo.usp_gbp_tms_entrega_quitar @q;
    PRINT '      FALLO: lo permitió';
END TRY
BEGIN CATCH
    PRINT '      ok, rechazado: ' + ERROR_MESSAGE();
END CATCH

PRINT '   d) transición inválida EN_RUTA -> PLANIFICADO:';
BEGIN TRY
    EXEC dbo.usp_gbp_tms_viaje_cambiar_estado @id_viaje, 'PLANIFICADO';
    PRINT '      FALLO: lo permitió';
END TRY
BEGIN CATCH
    PRINT '      ok, rechazado: ' + ERROR_MESSAGE();
END CATCH
GO

PRINT '';
PRINT '=== 6. Anulación en SAP de algo que ya va en ruta ===';

DECLARE @anul dbo.tp_gbp_tms_entrega_sap;
INSERT INTO @anul (sap_doc_entry, sap_doc_num, sap_orden_venta, sap_factura_num,
                   cliente_codigo, cliente_nombre, direccion, municipio,
                   peso_kg, monto, fecha_documento, anulada)
VALUES (9001, 153755, 125962, 202814, 'CL008', N'NUEVOS ALMACENES S.A.', N'Zona 4', N'Guatemala', 120.5, 104.20, '2026-09-10', 1);

EXEC dbo.usp_gbp_tms_entrega_sincronizar @anul;

PRINT '   la 9001 debe seguir EN_RUTA y salir como conflicto:';
SELECT sap_doc_entry, estado FROM dbo.tbl_gbp_tms_entrega WHERE sap_doc_entry = 9001;
GO

PRINT '';
PRINT '=== 7. Resumen y listados ===';
EXEC dbo.usp_gbp_tms_entrega_resumen;
EXEC dbo.usp_gbp_tms_entrega_listar @sin_viaje = 1;
EXEC dbo.usp_gbp_tms_piloto_listar @fecha = '2026-09-10';
GO

PRINT '';
PRINT '=== 8. Limpieza ===';
DELETE FROM dbo.tbl_gbp_tms_entrega WHERE sap_doc_entry IN (9001, 9002, 9003);
DELETE FROM dbo.tbl_gbp_tms_viaje   WHERE numero LIKE 'V260910%';
DELETE ur FROM dbo.tbl_gbp_tms_usuario_rol ur
    JOIN dbo.tbl_gbp_tms_usuario u ON u.id_usuario = ur.id_usuario WHERE u.usuario = 'piloto.prueba';
DELETE FROM dbo.tbl_gbp_tms_usuario WHERE usuario = 'piloto.prueba';
DELETE FROM dbo.tbl_gbp_tms_unidad  WHERE codigo  = 'PRB-01';
PRINT '   base devuelta a su estado anterior.';
GO
