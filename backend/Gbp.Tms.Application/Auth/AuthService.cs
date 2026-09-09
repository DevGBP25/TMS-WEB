using Gbp.Tms.Application.Abstractions;
using Gbp.Tms.Application.Auth.Dtos;
using Gbp.Tms.Application.Common;
using Gbp.Tms.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace Gbp.Tms.Application.Auth;

/// <summary>Autenticación: validación de credenciales, emisión de token y cambio de contraseña.</summary>
public class AuthService
{
    private readonly IAuthRepository       _repo;
    private readonly IPasswordHasher       _hasher;
    private readonly IGeneradorToken       _token;
    private readonly ILogger<AuthService>  _log;

    public AuthService(
        IAuthRepository      repo,
        IPasswordHasher      hasher,
        IGeneradorToken      token,
        ILogger<AuthService> log)
    {
        _repo   = repo;
        _hasher = hasher;
        _token  = token;
        _log    = log;
    }

    /// <summary>
    /// Valida credenciales y emite el token.
    ///
    /// Todos los fallos devuelven el mismo mensaje a propósito: distinguir
    /// "no existe" de "clave incorrecta" le confirma a un atacante qué
    /// usuarios son válidos. El motivo real sí queda en la bitácora.
    /// </summary>
    public async Task<LoginResponse> LoginAsync(
        LoginRequest req, string? ip, CancellationToken ct = default)
    {
        const string generico = "Usuario o contraseña incorrectos.";

        var plataforma = NormalizarPlataforma(req.Plataforma);
        var usuario    = await _repo.ObtenerPorLoginAsync(req.Usuario, ct);

        if (usuario is null)
        {
            await _repo.RegistrarIntentoAsync(
                null, req.Usuario, false, MotivoAcceso.NoExiste, plataforma, ip, ct);
            throw new AppException(generico, 401);
        }

        if (!usuario.Activo)
        {
            await _repo.RegistrarIntentoAsync(
                usuario.IdUsuario, req.Usuario, false, MotivoAcceso.Inactivo, plataforma, ip, ct);
            throw new AppException(
                "La cuenta está inactiva. Solicite al administrador que la reactive.", 403);
        }

        var verificacion = _hasher.Verificar(usuario.PasswordHash, req.Password);

        if (verificacion == ResultadoVerificacion.Fallo)
        {
            var desactivada = await _repo.RegistrarIntentoAsync(
                usuario.IdUsuario, req.Usuario, false, MotivoAcceso.ClaveIncorrecta, plataforma, ip, ct);

            if (desactivada)
            {
                _log.LogWarning("Cuenta {Usuario} desactivada por intentos fallidos.", req.Usuario);
                throw new AppException(
                    "Cuenta desactivada por intentos fallidos. Contacte al administrador.", 403);
            }

           throw new AppException(generico, 401);
        }

        // El hash se regenera si PasswordHasher subió sus parámetros desde que se guardó.
        if (verificacion == ResultadoVerificacion.CorrectaRequiereRehash)
        {
            await _repo.CambiarPasswordAsync(usuario.IdUsuario, _hasher.Hash(req.Password), ct);
            _log.LogInformation("Hash de {Usuario} regenerado con los parámetros actuales.", req.Usuario);
        }

        var emitido = _token.Generar(usuario);

        await _repo.CrearSesionAsync(
            usuario.IdUsuario, emitido.Jti, plataforma, req.Dispositivo, ip, emitido.ExpiraUtc, ct);

        await _repo.RegistrarIntentoAsync(
            usuario.IdUsuario, req.Usuario, true, null, plataforma, ip, ct);

        return new LoginResponse(emitido.Token, emitido.ExpiraUtc, Map(usuario));
    }

    public async Task<UsuarioDto> ObtenerAsync(int idUsuario, CancellationToken ct = default)
    {
        var u = await _repo.ObtenerPorIdAsync(idUsuario, ct)
                ?? throw AppException.NoEncontrado("El usuario");

        return Map(u);
    }

    public Task CerrarSesionAsync(string jti, CancellationToken ct = default)
        => _repo.CerrarSesionAsync(jti, ct);

    private static string NormalizarPlataforma(string? valor)
    {
        var p = (valor ?? "WEB").Trim().ToUpperInvariant();
        // La columna tiene un CHECK: un valor libre haría fallar el INSERT.
        return p is "WEB" or "MOVIL" ? p : "WEB";
    }

    private static UsuarioDto Map(Usuario u) => new(
        u.IdUsuario,
        u.NombreUsuario,
        u.Nombre,
        u.Telefono,
        u.UltimoAcceso,
        u.Roles.Select(r => r.Nombre).ToList());
}
