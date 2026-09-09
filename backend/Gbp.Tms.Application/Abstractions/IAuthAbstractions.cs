using Gbp.Tms.Domain.Entities;

namespace Gbp.Tms.Application.Abstractions;

/// <summary>Motivos que se registran en la bitácora de accesos.</summary>
public static class MotivoAcceso
{
    public const string NoExiste       = "NO_EXISTE";
    public const string ClaveIncorrecta = "CLAVE_INCORRECTA";
    public const string Inactivo       = "INACTIVO";
}

/// <summary>
/// Acceso a los datos de autenticación. Cada método corresponde a un
/// procedimiento almacenado: no hay SQL en la aplicación.
/// </summary>
public interface IAuthRepository
{
    /// <summary>Usuario con su hash y sus roles, o null si el login no existe.</summary>
    Task<Usuario?> ObtenerPorLoginAsync(string usuario, CancellationToken ct = default);

    /// <summary>Usuario autenticado, sin el hash. Para /api/auth/yo.</summary>
    Task<Usuario?> ObtenerPorIdAsync(int idUsuario, CancellationToken ct = default);

    /// <summary>
    /// Registra el intento y ajusta contador y estado en una sola transacción.
    /// Devuelve true si este intento desactivó la cuenta.
    /// </summary>
    Task<bool> RegistrarIntentoAsync(
        int? idUsuario, string? usuarioIntento, bool exitoso, string? motivo,
        string? plataforma, string? ip, CancellationToken ct = default);

    Task CrearSesionAsync(
        int idUsuario, string tokenJti, string plataforma, string? dispositivo,
        string? ip, DateTime expiraUtc, CancellationToken ct = default);

    Task CerrarSesionAsync(string tokenJti, CancellationToken ct = default);

    Task<bool> CambiarPasswordAsync(int idUsuario, string passwordHash, CancellationToken ct = default);
}

/// <summary>Resultado de verificar una contraseña contra su hash.</summary>
public enum ResultadoVerificacion
{
    Fallo,
    Correcta,
    /// <summary>Correcta, pero el hash usa parámetros viejos y conviene regenerarlo.</summary>
    CorrectaRequiereRehash
}

public interface IPasswordHasher
{
    string Hash(string password);
    ResultadoVerificacion Verificar(string hash, string password);
}

/// <summary>Token emitido, con el identificador que lo enlaza a la sesión registrada.</summary>
public record TokenEmitido(string Token, string Jti, DateTime ExpiraUtc);

public interface IGeneradorToken
{
    TokenEmitido Generar(Usuario usuario);
}
