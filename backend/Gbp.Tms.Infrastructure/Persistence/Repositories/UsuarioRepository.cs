using System.Data;
using Dapper;
using Gbp.Tms.Application.Abstractions;
using Gbp.Tms.Application.Common;
using Gbp.Tms.Application.Usuarios.Dtos;
using Microsoft.Data.SqlClient;

namespace Gbp.Tms.Infrastructure.Persistence.Repositories;

public class UsuarioRepository : IUsuarioRepository
{
    // Violación de UNIQUE / índice único: el motor los distingue por número.
    private const int ClaveDuplicada = 2627;
    private const int IndiceDuplicado = 2601;

    private readonly ISqlConnectionFactory _factory;

    public UsuarioRepository(ISqlConnectionFactory factory) => _factory = factory;

    public async Task<IReadOnlyList<UsuarioListaDto>> ListarAsync(
        string? buscar, bool soloActivos, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        var filas = await conn.QueryAsync<FilaUsuario>(new CommandDefinition(
            "dbo.usp_gbp_tms_usuario_listar",
            new { buscar, solo_activos = soloActivos },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return filas.Select(f => new UsuarioListaDto(
            f.id_usuario, f.usuario, f.nombre, f.telefono, f.dpi,
            f.licencia, f.tipo_licencia,
            f.licencia_vence is { } d ? DateOnly.FromDateTime(d) : null,
            f.activo, f.intentos_fallidos, f.ultimo_acceso, f.fecha_creacion,
            // El procedimiento devuelve los roles concatenados con coma.
            string.IsNullOrWhiteSpace(f.roles)
                ? Array.Empty<string>()
                : f.roles.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
        )).ToList();
    }

    public async Task<IReadOnlyList<RolDto>> RolesAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        var filas = await conn.QueryAsync<FilaRol>(new CommandDefinition(
            "dbo.usp_gbp_tms_rol_listar",
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return filas.Select(f => new RolDto(f.id_rol, f.nombre, f.descripcion)).ToList();
    }

    public async Task<int> CrearAsync(
        string usuario, string nombre, string passwordHash,
        string? telefono, string? dpi, string? licencia, string? tipoLicencia,
        DateOnly? licenciaVence, IReadOnlyList<string> roles, int? creadoPor,
        CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        try
        {
            return await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                "dbo.usp_gbp_tms_usuario_crear",
                new
                {
                    usuario,
                    nombre,
                    password_hash  = passwordHash,
                    telefono,
                    dpi,
                    licencia,
                    tipo_licencia  = tipoLicencia,
                    licencia_vence = licenciaVence?.ToDateTime(TimeOnly.MinValue),
                    roles          = string.Join(',', roles),
                    creado_por     = creadoPor
                },
                commandType: CommandType.StoredProcedure,
                cancellationToken: ct));
        }
        catch (SqlException ex) when (ex.Number is ClaveDuplicada or IndiceDuplicado)
        {
            // El índice violado dice qué campo chocó; el mensaje lo lleva en su texto.
            var campo = ex.Message.Contains("dpi", StringComparison.OrdinalIgnoreCase) ? "DPI" : "código";
            throw new AppException($"Ya existe un usuario con ese {campo}.", 409);
        }
    }

    public async Task<bool> ActualizarAsync(
        int idUsuario, string nombre, string? telefono, string? dpi,
        string? licencia, string? tipoLicencia, DateOnly? licenciaVence, bool activo,
        IReadOnlyList<string> roles, int? asignadoPor,
        CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        try
        {
            var filas = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                "dbo.usp_gbp_tms_usuario_actualizar",
                new
                {
                    id_usuario     = idUsuario,
                    nombre,
                    telefono,
                    dpi,
                    licencia,
                    tipo_licencia  = tipoLicencia,
                    licencia_vence = licenciaVence?.ToDateTime(TimeOnly.MinValue),
                    activo,
                    roles          = string.Join(',', roles),
                    asignado_por   = asignadoPor
                },
                commandType: CommandType.StoredProcedure,
                cancellationToken: ct));

            return filas > 0;
        }
        catch (SqlException ex) when (ex.Number is ClaveDuplicada or IndiceDuplicado)
        {
            throw new AppException("Ya existe otro usuario con ese DPI.", 409);
        }
    }

    public async Task<bool> RestablecerPasswordAsync(
        int idUsuario, string passwordHash, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        var filas = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "dbo.usp_gbp_tms_usuario_restablecer_password",
            new { id_usuario = idUsuario, password_hash = passwordHash },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return filas > 0;
    }

    /* Los procedimientos devuelven snake_case y Dapper no traduce nombres. */
    private sealed class FilaUsuario
    {
        public int       id_usuario        { get; init; }
        public string    usuario           { get; init; } = string.Empty;
        public string    nombre            { get; init; } = string.Empty;
        public string?   telefono          { get; init; }
        public string?   dpi               { get; init; }
        public string?   licencia          { get; init; }
        public string?   tipo_licencia     { get; init; }
        public DateTime? licencia_vence    { get; init; }
        public bool      activo            { get; init; }
        public byte      intentos_fallidos { get; init; }
        public DateTime? ultimo_acceso     { get; init; }
        public DateTime  fecha_creacion    { get; init; }
        public string?   roles             { get; init; }
    }

    private sealed class FilaRol
    {
        public int     id_rol      { get; init; }
        public string  nombre      { get; init; } = string.Empty;
        public string? descripcion { get; init; }
    }
}
