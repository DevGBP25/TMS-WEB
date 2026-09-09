/* ============================================================
   GBP · TMS — datos de prueba para desarrollo.
   NO ejecutar en producción.
   ============================================================ */

-- El índice filtrado UX_TmsParada_SapDocEntry exige estas opciones para cualquier DML.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;

MERGE dbo.TmsRuta AS d
USING (VALUES
    ('R01', N'Ciudad Capital - Zona 1 a 10', N'Guatemala', N'Guatemala',  45.0, 240),
    ('R02', N'Ciudad Capital - Zona 11 a 21', N'Guatemala', N'Guatemala', 60.0, 300),
    ('R03', N'Mixco / San Lucas',             N'Guatemala', N'Mixco',     55.0, 270),
    ('R04', N'Escuintla',                     N'Escuintla', N'Escuintla',120.0, 420),
    ('R05', N'Quetzaltenango',                N'Quetzaltenango', N'Quetzaltenango', 205.0, 600)
) AS o (Codigo, Nombre, Departamento, Municipio, DistanciaKm, DuracionMin)
ON d.Codigo = o.Codigo
WHEN NOT MATCHED THEN
    INSERT (Codigo, Nombre, Departamento, Municipio, DistanciaKm, DuracionMin)
    VALUES (o.Codigo, o.Nombre, o.Departamento, o.Municipio, o.DistanciaKm, o.DuracionMin);

MERGE dbo.TmsPiloto AS d
USING (VALUES
    ('P001', N'Carlos Morales',  'A', DATEADD(MONTH,  14, CAST(GETDATE() AS DATE)), '5512-3344'),
    ('P002', N'Luis Hernández',  'B', DATEADD(MONTH,   8, CAST(GETDATE() AS DATE)), '5522-7788'),
    ('P003', N'Mario Xitumul',   'A', DATEADD(MONTH,  22, CAST(GETDATE() AS DATE)), '4477-1122'),
    ('P004', N'Byron Aguilar',   'C', DATEADD(DAY,    20, CAST(GETDATE() AS DATE)), '3366-9900')
) AS o (Codigo, Nombre, TipoLicencia, LicenciaVence, Telefono)
ON d.Codigo = o.Codigo
WHEN NOT MATCHED THEN
    INSERT (Codigo, Nombre, TipoLicencia, LicenciaVence, Telefono)
    VALUES (o.Codigo, o.Nombre, o.TipoLicencia, o.LicenciaVence, o.Telefono);

MERGE dbo.TmsUnidad AS d
USING (VALUES
    ('U001', 'P-123ABC', N'Isuzu',      N'NPR',    N'Camión 5 ton',  5000,  22.0, N'Propia'),
    ('U002', 'P-456DEF', N'Hino',       N'300',    N'Camión 3.5 ton',3500,  16.0, N'Propia'),
    ('U003', 'P-789GHI', N'Toyota',     N'Hiace',  N'Panel',         1200,   7.5, N'Propia'),
    ('U004', 'C-321JKL', N'Freightliner', N'M2',   N'Camión 8 ton',  8000,  34.0, N'Transportes El Quetzal')
) AS o (Codigo, Placa, Marca, Modelo, Tipo, CapacidadKg, CapacidadM3, Transportista)
ON d.Codigo = o.Codigo
WHEN NOT MATCHED THEN
    INSERT (Codigo, Placa, Marca, Modelo, Tipo, CapacidadKg, CapacidadM3, Transportista)
    VALUES (o.Codigo, o.Placa, o.Marca, o.Modelo, o.Tipo, o.CapacidadKg, o.CapacidadM3, o.Transportista);

/* Un viaje de ejemplo con dos paradas, para ver el frontend con datos. */
IF NOT EXISTS (SELECT 1 FROM dbo.TmsViaje)
BEGIN
    DECLARE @hoy DATE = CAST(GETDATE() AS DATE);
    DECLARE @viajeId INT;

    INSERT INTO dbo.TmsViaje
        (Numero, Fecha, Estado, RutaId, SalidaProgramada, PesoKg, VolumenM3, TotalParadas, CreadoPor)
    SELECT
        CONCAT('V-', FORMAT(@hoy, 'yyyyMMdd'), '-0001'), @hoy, 1,
        (SELECT RutaId FROM dbo.TmsRuta WHERE Codigo = 'R01'),
        DATEADD(HOUR, 7, CAST(@hoy AS DATETIME2(0))),
        850.00, 4.20, 2, 'seed';

    SET @viajeId = SCOPE_IDENTITY();

    INSERT INTO dbo.TmsViajeParada
        (ViajeId, Secuencia, Estado, ClienteCodigo, ClienteNombre, Direccion, PesoKg, Monto)
    VALUES
        (@viajeId, 1, 1, 'C-0001', N'Ferretería El Progreso', N'8a Av. 5-20 Zona 1, Guatemala', 400.00, 12500.00),
        (@viajeId, 2, 1, 'C-0002', N'Electro Center',         N'6a Calle 12-45 Zona 9, Guatemala', 450.00, 18300.00);
END

SELECT
    Rutas   = (SELECT COUNT(*) FROM dbo.TmsRuta),
    Pilotos = (SELECT COUNT(*) FROM dbo.TmsPiloto),
    Unidades= (SELECT COUNT(*) FROM dbo.TmsUnidad),
    Viajes  = (SELECT COUNT(*) FROM dbo.TmsViaje);
