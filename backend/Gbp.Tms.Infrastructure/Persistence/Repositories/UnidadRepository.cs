using System.Data;
using Dapper;
using Gbp.Tms.Application.Abstractions;
using Gbp.Tms.Application.Common;
using Gbp.Tms.Application.Unidades.Dtos;
using Microsoft.Data.SqlClient;

namespace Gbp.Tms.Infrastructure.Persistence.Repositories;

public class UnidadRepository : IUnidadRepository
{
    private const int ClaveDuplicada  = 2627;
    private const int IndiceDuplicado = 2601;
    // RAISERROR de nivel 16 desde el procedimiento (turno abierto).
    private const int ErrorDeNegocio  = 50000;

    private readonly ISqlConnectionFactory _factory;

    public UnidadRepository(ISqlConnectionFactory factory) => _factory = factory;

    public async Task<IReadOnlyList<UnidadListaDto>> ListarAsync(
        string? buscar, string? estado, bool soloActivas, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        var filas = await conn.QueryAsync<Fila>(new CommandDefinition(
            "dbo.usp_gbp_tms_unidad_listar",
            new { buscar, estado, solo_activas = soloActivas },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return filas.Select(f => new UnidadListaDto(
            f.id_unidad, f.codigo, f.placa, f.marca, f.modelo, f.anio, f.tipo,
            f.capacidad_kg, f.capacidad_m3, f.odometro_km, f.transportista,
            f.estado, f.activo, f.fecha_creacion, f.piloto_actual, f.turno_desde)).ToList();
    }

    public async Task<int> CrearAsync(GuardarUnidadRequest req, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        try
        {
            var p = new DynamicParameters(Comunes(req));
            p.Add("@codigo", req.Codigo);

            return await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                "dbo.usp_gbp_tms_unidad_crear", p,
                commandType: CommandType.StoredProcedure,
                cancellationToken: ct));
        }
        catch (SqlException ex) when (ex.Number is ClaveDuplicada or IndiceDuplicado)
        {
            throw Duplicado(ex);
        }
    }

    public async Task<bool> ActualizarAsync(
        int idUnidad, GuardarUnidadRequest req, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        var p = new DynamicParameters(Comunes(req));
        p.Add("@id_unidad", idUnidad);
        p.Add("@activo", req.Activo);

        try
        {
            var filas = await conn.ExecuteScalarAsync<int?>(new CommandDefinition(
                "dbo.usp_gbp_tms_unidad_actualizar", p,
                commandType: CommandType.StoredProcedure,
                cancellationToken: ct));

            return filas > 0;
        }
        catch (SqlException ex) when (ex.Number is ClaveDuplicada or IndiceDuplicado)
        {
            throw Duplicado(ex);
        }
        catch (SqlException ex) when (ex.Number == ErrorDeNegocio)
        {
            // El procedimiento ya redactó el motivo; se pasa tal cual.
            throw new AppException(ex.Message, 409);
        }
    }

    /* Campos que comparten alta y edición. El código queda fuera a propósito:
       cambiarlo rompería la trazabilidad de viajes y turnos, así que el
       procedimiento de actualización ni siquiera lo declara. */
    private static object Comunes(GuardarUnidadRequest r) => new
    {
        placa         = r.Placa,
        marca         = r.Marca,
        modelo        = r.Modelo,
        anio          = r.Anio,
        tipo          = r.Tipo,
        capacidad_kg  = r.CapacidadKg,
        capacidad_m3  = r.CapacidadM3,
        odometro_km   = r.OdometroKm,
        transportista = r.Transportista,
        estado        = r.Estado
    };

    private static AppException Duplicado(SqlException ex)
    {
        // El artículo va con el campo: "esa placa" pero "ese código".
        var campo = ex.Message.Contains("placa", StringComparison.OrdinalIgnoreCase)
            ? "esa placa"
            : "ese código";

        return new AppException($"Ya existe una unidad con {campo}.", 409);
    }

    private sealed class Fila
    {
        public int       id_unidad      { get; init; }
        public string    codigo         { get; init; } = string.Empty;
        public string?   placa          { get; init; }
        public string?   marca          { get; init; }
        public string?   modelo         { get; init; }
        public short?    anio           { get; init; }
        public string?   tipo           { get; init; }
        public decimal   capacidad_kg   { get; init; }
        public decimal   capacidad_m3   { get; init; }
        public decimal   odometro_km    { get; init; }
        public string?   transportista  { get; init; }
        public string    estado         { get; init; } = string.Empty;
        public bool      activo         { get; init; }
        public DateTime  fecha_creacion { get; init; }
        public string?   piloto_actual  { get; init; }
        public DateTime? turno_desde    { get; init; }
    }
}
