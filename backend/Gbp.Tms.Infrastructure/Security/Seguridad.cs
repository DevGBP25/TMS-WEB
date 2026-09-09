using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Gbp.Tms.Application.Abstractions;
using Gbp.Tms.Domain.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Gbp.Tms.Infrastructure.Security;

/// <summary>Sección <c>Jwt</c> de la configuración.</summary>
public class JwtOptions
{
    public const string SectionName = "Jwt";

    /// <summary>Clave de firma. Va en user-secrets o variable de entorno, nunca en el repositorio.</summary>
    public string Key      { get; set; } = string.Empty;
    public string Issuer   { get; set; } = "Gbp.Tms";
    public string Audience { get; set; } = "Gbp.Tms.Clientes";

    /// <summary>
    /// Vida del token. Corta a propósito: al no consultarse la sesión en cada
    /// petición, un token emitido vale hasta que expire aunque se cierre sesión.
    /// </summary>
    public int MinutosVigencia { get; set; } = 60;
}

/// <summary>
/// Envoltura del PasswordHasher de ASP.NET Core: PBKDF2-HMACSHA512 con
/// 100 000 iteraciones y salt embebido en el propio hash.
/// </summary>
public class PasswordHasherAdapter : IPasswordHasher
{
    private readonly PasswordHasher<object> _inner = new();
    private static readonly object Marcador = new();

    public string Hash(string password) => _inner.HashPassword(Marcador, password);

    public ResultadoVerificacion Verificar(string hash, string password)
    {
        if (string.IsNullOrEmpty(hash)) return ResultadoVerificacion.Fallo;

        // Un hash con formato inválido lanza en vez de devolver Failed.
        try
        {
            return _inner.VerifyHashedPassword(Marcador, hash, password) switch
            {
                PasswordVerificationResult.Success             => ResultadoVerificacion.Correcta,
                PasswordVerificationResult.SuccessRehashNeeded => ResultadoVerificacion.CorrectaRequiereRehash,
                _                                              => ResultadoVerificacion.Fallo
            };
        }
        catch (FormatException)
        {
            return ResultadoVerificacion.Fallo;
        }
    }
}

public class GeneradorTokenJwt : IGeneradorToken
{
    private readonly JwtOptions _opt;

    public GeneradorTokenJwt(IOptions<JwtOptions> opt)
    {
        _opt = opt.Value;

        // Falla al arrancar y no en el primer login: HMAC-SHA256 exige 256 bits.
        if (string.IsNullOrWhiteSpace(_opt.Key) || Encoding.UTF8.GetByteCount(_opt.Key) < 32)
            throw new InvalidOperationException(
                "Jwt:Key no está configurada o es menor a 32 bytes. " +
                "Defínala con user-secrets en desarrollo o con la variable Jwt__Key en el servidor.");
    }

    public TokenEmitido Generar(Usuario usuario)
    {
        var jti     = Guid.NewGuid().ToString("N");
        var emitido = DateTime.UtcNow;
        var expira  = emitido.AddMinutes(_opt.MinutosVigencia);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, usuario.IdUsuario.ToString()),
            new(JwtRegisteredClaimNames.Jti, jti),
            new(ClaimTypes.NameIdentifier, usuario.IdUsuario.ToString()),
            new(ClaimTypes.Name, usuario.NombreUsuario),
            new("nombre", usuario.Nombre)
        };

        // Un claim de rol por cada uno: así [Authorize(Roles="ADMIN")] funciona directo.
        claims.AddRange(usuario.Roles.Select(r => new Claim(ClaimTypes.Role, r.Nombre)));

        var credenciales = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_opt.Key)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer:             _opt.Issuer,
            audience:           _opt.Audience,
            claims:             claims,
            notBefore:          emitido,
            expires:            expira,
            signingCredentials: credenciales);

        return new TokenEmitido(new JwtSecurityTokenHandler().WriteToken(token), jti, expira);
    }
}
