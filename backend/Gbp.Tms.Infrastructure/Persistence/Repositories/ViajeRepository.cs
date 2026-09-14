using System.Data;
using Dapper;
using Gbp.Tms.Application.Abstractions;
using Gbp.Tms.Application.Common;
using Gbp.Tms.Application.Viajes.Dtos;
using Microsoft.Data.SqlClient;

namespace Gbp.Tms.Infrastructure.Persistence.Repositories;

public class ViajeRepository : IViajeRepository
{
    private const int ClaveDuplicada  = 2627;
    private const int IndiceDuplicado = 2601;
    private const int ErrorDeNegocio  = 50000;

    private readonly ISqlConnectionFactory _factory;

    public ViajeRepository(ISqlConnectionFactory factory) => _factory = factory;

    public async Task<IReadOnlyList<ViajeListaDto>> ListarAsync(
        ViajeFiltro filtro, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        var filas = await conn.QueryAsync<FilaLista>(new CommandDefinition(
            "dbo.usp_gbp_tms_viaje_listar",
            new { buscar = filtro.Buscar, estado = filtro.Estado, desde = filtro.Desde, hasta = filtro.Hasta },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return filas.Select(f => new ViajeListaDto(
            f.id_viaje, f.numero, f.fecha, f.estado, f.peso_kg,
            f.total_entregas, f.entregas_completadas,
            f.salida_real, f.retorno_real, f.observaciones, f.fecha_creacion,
            f.id_unidad, f.unidad_codigo, f.unidad_placa,
            f.id_piloto, f.piloto_nombre)).ToList();
    }

    public async Task<ViajeDetalleDto?> ObtenerAsync(int idViaje, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        using var multi = await conn.QueryMultipleAsync(new CommandDefinition(
            "dbo.usp_gbp_tms_viaje_obtener",
            new { id_viaje = idViaje },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        var c = await multi.ReadSingleOrDefaultAsync<FilaCabecera>();
        if (c is null) return null;

        var entregas = (await multi.ReadAsync<FilaEntrega>())
            .Select(e => new ViajeEntregaDto(
                e.id_entrega, e.sap_doc_num, e.sap_orden_venta, e.sap_factura_num,
                e.cliente_codigo, e.cliente_nombre, e.direccion, e.municipio,
                e.peso_kg, e.monto, e.fecha_documento, e.estado, e.secuencia,
                e.receptor, e.motivo_rechazo, e.entregada_en))
            .ToList();

        var cabecera = new ViajeCabeceraDto(
            c.id_viaje, c.numero, c.fecha, c.estado, c.peso_kg,
            c.total_entregas, c.entregas_completadas,
            c.salida_programada, c.salida_real, c.retorno_real,
            c.observaciones, c.fecha_creacion,
            c.id_unidad, c.unidad_codigo, c.unidad_placa, c.unidad_capacidad_kg,
            c.id_piloto, c.piloto_nombre, c.piloto_telefono);

        return new ViajeDetalleDto(cabecera, entregas);
    }

    public async Task<(int IdViaje, string Numero)> CrearAsync(
        CrearViajeRequest req, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        try
        {
            var r = await conn.QuerySingleAsync<FilaCreado>(new CommandDefinition(
                "dbo.usp_gbp_tms_viaje_crear",
                new
                {
                    fecha         = req.Fecha.Date,
                    id_unidad     = req.IdUnidad,
                    id_piloto     = req.IdPiloto,
                    observaciones = req.Observaciones
                },
                commandType: CommandType.StoredProcedure,
                cancellationToken: ct));

            return (r.id_viaje, r.numero);
        }
        catch (SqlException ex) when (ex.Number is ClaveDuplicada or IndiceDuplicado)
        {
            /* Dos supervisores creando en el mismo instante. El bloqueo del
               procedimiento lo evita casi siempre; si aun así ocurre, se pide
               reintentar en vez de mostrar el error del motor. */
            throw new AppException("Otro viaje se creó al mismo tiempo. Intente de nuevo.", 409);
        }
        catch (SqlException ex) when (ex.Number == ErrorDeNegocio)
        {
            throw new AppException(ex.Message, 409);
        }
    }

    public async Task AsignarRecursosAsync(
        int idViaje, AsignarRecursosRequest req, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        try
        {
            var filas = await conn.ExecuteScalarAsync<int?>(new CommandDefinition(
                "dbo.usp_gbp_tms_viaje_asignar_recursos",
                new { id_viaje = idViaje, id_unidad = req.IdUnidad, id_piloto = req.IdPiloto },
                commandType: CommandType.StoredProcedure,
                cancellationToken: ct));

            if (filas is null or 0)
                throw AppException.NoEncontrado($"El viaje {idViaje}");
        }
        catch (SqlException ex) when (ex.Number == ErrorDeNegocio)
        {
            throw new AppException(ex.Message, 409);
        }
    }

    public async Task CambiarEstadoAsync(
        int idViaje, string estado, string? observaciones, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        try
        {
            var r = await conn.ExecuteScalarAsync<string?>(new CommandDefinition(
                "dbo.usp_gbp_tms_viaje_cambiar_estado",
                new { id_viaje = idViaje, estado, observaciones },
                commandType: CommandType.StoredProcedure,
                cancellationToken: ct));

            if (r is null) throw AppException.NoEncontrado($"El viaje {idViaje}");
        }
        catch (SqlException ex) when (ex.Number == ErrorDeNegocio)
        {
            throw new AppException(ex.Message, 409);
        }
    }

    public async Task<IReadOnlyList<PilotoDto>> PilotosAsync(
        DateTime? fecha, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        var filas = await conn.QueryAsync<FilaPiloto>(new CommandDefinition(
            "dbo.usp_gbp_tms_piloto_listar",
            new { fecha = fecha?.Date },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return filas.Select(f => new PilotoDto(
            f.id_usuario, f.usuario, f.nombre, f.telefono, f.viaje_del_dia)).ToList();
    }

    private sealed class FilaLista
    {
        public int       id_viaje             { get; init; }
        public string    numero               { get; init; } = string.Empty;
        public DateTime  fecha                { get; init; }
        public string    estado               { get; init; } = string.Empty;
        public decimal   peso_kg              { get; init; }
        public int       total_entregas       { get; init; }
        public int       entregas_completadas { get; init; }
        public DateTime? salida_real          { get; init; }
        public DateTime? retorno_real         { get; init; }
        public string?   observaciones        { get; init; }
        public DateTime  fecha_creacion       { get; init; }
        public int?      id_unidad            { get; init; }
        public string?   unidad_codigo        { get; init; }
        public string?   unidad_placa         { get; init; }
        public int?      id_piloto            { get; init; }
        public string?   piloto_nombre        { get; init; }
    }

    private sealed class FilaCabecera
    {
        public int       id_viaje             { get; init; }
        public string    numero               { get; init; } = string.Empty;
        public DateTime  fecha                { get; init; }
        public string    estado               { get; init; } = string.Empty;
        public decimal   peso_kg              { get; init; }
        public int       total_entregas       { get; init; }
        public int       entregas_completadas { get; init; }
        public DateTime? salida_programada    { get; init; }
        public DateTime? salida_real          { get; init; }
        public DateTime? retorno_real         { get; init; }
        public string?   observaciones        { get; init; }
        public DateTime  fecha_creacion       { get; init; }
        public int?      id_unidad            { get; init; }
        public string?   unidad_codigo        { get; init; }
        public string?   unidad_placa         { get; init; }
        public decimal?  unidad_capacidad_kg  { get; init; }
        public int?      id_piloto            { get; init; }
        public string?   piloto_nombre        { get; init; }
        public string?   piloto_telefono      { get; init; }
    }

    private sealed class FilaEntrega
    {
        public int       id_entrega      { get; init; }
        public int       sap_doc_num     { get; init; }
        public int?      sap_orden_venta { get; init; }
        public int?      sap_factura_num { get; init; }
        public string    cliente_codigo  { get; init; } = string.Empty;
        public string    cliente_nombre  { get; init; } = string.Empty;
        public string?   direccion       { get; init; }
        public string?   municipio       { get; init; }
        public decimal   peso_kg         { get; init; }
        public decimal   monto           { get; init; }
        public DateTime  fecha_documento { get; init; }
        public string    estado          { get; init; } = string.Empty;
        public int?      secuencia       { get; init; }
        public string?   receptor        { get; init; }
        public string?   motivo_rechazo  { get; init; }
        public DateTime? entregada_en    { get; init; }
    }

    private sealed class FilaCreado
    {
        public int    id_viaje { get; init; }
        public string numero   { get; init; } = string.Empty;
    }

    private sealed class FilaPiloto
    {
        public int     id_usuario    { get; init; }
        public string  usuario       { get; init; } = string.Empty;
        public string  nombre        { get; init; } = string.Empty;
        public string? telefono      { get; init; }
        public string? viaje_del_dia { get; init; }
    }
}
