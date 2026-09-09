using Gbp.Tms.Application.Abstractions;
using Gbp.Tms.Application.Common;
using Gbp.Tms.Application.Usuarios.Dtos;

namespace Gbp.Tms.Application.Usuarios;

/// <summary>
/// Administración de cuentas. Las altas y las contraseñas las define el
/// administrador: no hay autoservicio ni recuperación por correo.
/// </summary>
public class UsuarioService
{
    private readonly IUsuarioRepository _repo;
    private readonly IPasswordHasher    _hasher;

    public UsuarioService(IUsuarioRepository repo, IPasswordHasher hasher)
    {
        _repo   = repo;
        _hasher = hasher;
    }

    public Task<IReadOnlyList<UsuarioListaDto>> ListarAsync(
        string? buscar, bool soloActivos, CancellationToken ct = default)
        => _repo.ListarAsync(string.IsNullOrWhiteSpace(buscar) ? null : buscar.Trim(), soloActivos, ct);

    public Task<IReadOnlyList<RolDto>> RolesAsync(CancellationToken ct = default)
        => _repo.RolesAsync(ct);

    public async Task<int> CrearAsync(
        CrearUsuarioRequest req, int? creadoPor, CancellationToken ct = default)
    {
        var codigo = req.Usuario.Trim();
        var roles  = NormalizarRoles(req.Roles);

        if (roles.Count == 0)
            throw new AppException("Asigne al menos un rol al usuario.");

        return await _repo.CrearAsync(
            codigo, req.Nombre.Trim(), _hasher.Hash(req.Password),
            req.Telefono, req.Dpi, req.Licencia, req.TipoLicencia, req.LicenciaVence,
            roles, creadoPor, ct);
    }

    public async Task ActualizarAsync(
        int idUsuario, ActualizarUsuarioRequest req, int? asignadoPor, CancellationToken ct = default)
    {
        var roles = NormalizarRoles(req.Roles);

        if (roles.Count == 0)
            throw new AppException("El usuario debe conservar al menos un rol.");

        var ok = await _repo.ActualizarAsync(
            idUsuario, req.Nombre.Trim(), req.Telefono, req.Dpi,
            req.Licencia, req.TipoLicencia, req.LicenciaVence, req.Activo,
            roles, asignadoPor, ct);

        if (!ok) throw AppException.NoEncontrado($"El usuario {idUsuario}");
    }

    public async Task RestablecerPasswordAsync(
        int idUsuario, RestablecerPasswordRequest req, CancellationToken ct = default)
    {
        var ok = await _repo.RestablecerPasswordAsync(idUsuario, _hasher.Hash(req.Password), ct);

        if (!ok) throw AppException.NoEncontrado($"El usuario {idUsuario}");
    }

    /* Los roles viajan al procedimiento como lista separada por comas, así que
       una coma dentro de un nombre partiría la lista. Se descartan duplicados
       y se normaliza a mayúsculas, que es como están en el catálogo. */
    private static List<string> NormalizarRoles(IEnumerable<string> roles) =>
        roles
            .Select(r => r.Trim().ToUpperInvariant())
            .Where(r => r.Length > 0 && !r.Contains(','))
            .Distinct()
            .ToList();
}
