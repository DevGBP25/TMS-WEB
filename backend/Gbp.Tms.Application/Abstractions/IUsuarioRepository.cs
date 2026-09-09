using Gbp.Tms.Application.Usuarios.Dtos;

namespace Gbp.Tms.Application.Abstractions;

/// <summary>
/// Administración de cuentas. Cada método corresponde a un procedimiento
/// almacenado: no hay SQL en la aplicación.
/// </summary>
public interface IUsuarioRepository
{
    Task<IReadOnlyList<UsuarioListaDto>> ListarAsync(
        string? buscar, bool soloActivos, CancellationToken ct = default);

    Task<IReadOnlyList<RolDto>> RolesAsync(CancellationToken ct = default);

    /// <summary>Devuelve el id creado. Lanza <see cref="Common.AppException"/> si el código ya existe.</summary>
    Task<int> CrearAsync(
        string usuario, string nombre, string passwordHash,
        string? telefono, string? dpi, string? licencia, string? tipoLicencia,
        DateOnly? licenciaVence, IReadOnlyList<string> roles, int? creadoPor,
        CancellationToken ct = default);

    /// <summary>false si el usuario no existe.</summary>
    Task<bool> ActualizarAsync(
        int idUsuario, string nombre, string? telefono, string? dpi,
        string? licencia, string? tipoLicencia, DateOnly? licenciaVence, bool activo,
        IReadOnlyList<string> roles, int? asignadoPor,
        CancellationToken ct = default);

    Task<bool> RestablecerPasswordAsync(int idUsuario, string passwordHash, CancellationToken ct = default);
}
