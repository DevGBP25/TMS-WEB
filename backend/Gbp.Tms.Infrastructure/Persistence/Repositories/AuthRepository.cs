using System.Data;
using Dapper;
using Gbp.Tms.Application.Abstractions;
using Gbp.Tms.Domain.Entities;

namespace Gbp.Tms.Infrastructure.Persistence.Repositories;

/// <summary>
/// Toda consulta pasa por un procedimiento almacenado. No hay SQL literal:
/// si cambia el esquema, se ajusta el procedimiento y no hay que recompilar.
/// </summary>
public class AuthRepository : IAuthRepository
{
    private readonly ISqlConnectionFactory _factory;

    public AuthRepository(ISqlConnectionFactory factory) => _factory = factory;

    public async Task<Usuario?> ObtenerPorLoginAsync(string usuario, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        using var multi = await conn.QueryMultipleAsync(new CommandDefinition(
            "dbo.usp_gbp_tms_auth_obtener_usuario",
            new { usuario },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return await LeerUsuarioAsync(multi);
    }

    public async Task<Usuario?> ObtenerPorIdAsync(int idUsuario, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        using var multi = await conn.QueryMultipleAsync(new CommandDefinition(
            "dbo.usp_gbp_tms_usuario_obtener",
            new { id_usuario = idUsuario },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return await LeerUsuarioAsync(multi);
    }

    public async Task<bool> RegistrarIntentoAsync(
        int? idUsuario, string? usuarioIntento, bool exitoso, string? motivo,
        string? plataforma, string? ip, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        var p = new DynamicParameters();
        p.Add("@id_usuario",      idUsuario);
        p.Add("@usuario_intento", usuarioIntento);
        p.Add("@exitoso",         exitoso);
        p.Add("@motivo",          motivo);
        p.Add("@plataforma",      plataforma);
        p.Add("@ip_address",      ip);
        p.Add("@desactivado",     dbType: DbType.Boolean, direction: ParameterDirection.Output);

        await conn.ExecuteAsync(new CommandDefinition(
            "dbo.usp_gbp_tms_auth_registrar_intento", p,
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return p.Get<bool?>("@desactivado") ?? false;
    }

    public async Task CrearSesionAsync(
        int idUsuario, string tokenJti, string plataforma, string? dispositivo,
        string? ip, DateTime expiraUtc, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        await conn.ExecuteAsync(new CommandDefinition(
            "dbo.usp_gbp_tms_sesion_crear",
            new
            {
                id_usuario       = idUsuario,
                token_jti        = tokenJti,
                plataforma,
                dispositivo,
                ip_address       = ip,
                fecha_expiracion = expiraUtc
            },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));
    }

    public async Task CerrarSesionAsync(string tokenJti, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        await conn.ExecuteAsync(new CommandDefinition(
            "dbo.usp_gbp_tms_sesion_cerrar",
            new { token_jti = tokenJti },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));
    }

    public async Task<bool> CambiarPasswordAsync(
        int idUsuario, string passwordHash, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        var filas = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "dbo.usp_gbp_tms_usuario_cambiar_password",
            new { id_usuario = idUsuario, password_hash = passwordHash },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return filas > 0;
    }

    /* Los dos procedimientos que devuelven usuario comparten forma: primero la
       fila y después sus roles. Se lee igual en ambos casos. */
    private static async Task<Usuario?> LeerUsuarioAsync(SqlMapper.GridReader multi)
    {
        var fila = await multi.ReadSingleOrDefaultAsync<FilaUsuario>();
        if (fila is null) return null;

        var usuario = new Usuario
        {
            IdUsuario           = fila.id_usuario,
            NombreUsuario       = fila.usuario,
            Nombre              = fila.nombre,
            Telefono            = fila.telefono,
            PasswordHash        = fila.password_hash ?? string.Empty,
            IntentosFallidos    = fila.intentos_fallidos,
            Activo              = fila.activo,
            UltimoAcceso        = fila.ultimo_acceso,
            Licencia            = fila.licencia,
            TipoLicencia        = fila.tipo_licencia,
            LicenciaVence       = fila.licencia_vence is { } d ? DateOnly.FromDateTime(d) : null
        };

        usuario.Roles = (await multi.ReadAsync<FilaRol>())
            .Select(r => new Rol { Nombre = r.nombre, PermisosJson = r.permisos_json })
            .ToList();

        return usuario;
    }

    /* Tipos de mapeo: los procedimientos devuelven snake_case y Dapper no
       traduce nombres. Se mapean aquí y no en el dominio. */
    private sealed class FilaUsuario
    {
        public int       id_usuario            { get; init; }
        public string    usuario               { get; init; } = string.Empty;
        public string    nombre                { get; init; } = string.Empty;
        public string?   telefono              { get; init; }
        public string?   password_hash         { get; init; }
        public byte      intentos_fallidos     { get; init; }
        public bool      activo                { get; init; }
        public DateTime? ultimo_acceso         { get; init; }
        public string?   licencia              { get; init; }
        public string?   tipo_licencia         { get; init; }
        public DateTime? licencia_vence        { get; init; }
    }

    private sealed class FilaRol
    {
        public string  nombre        { get; init; } = string.Empty;
        public string? permisos_json { get; init; }
    }
}
