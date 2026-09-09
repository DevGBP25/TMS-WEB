using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Gbp.Tms.Api.Contracts;
using Gbp.Tms.Application.Auth;
using Gbp.Tms.Application.Auth.Dtos;
using Gbp.Tms.Application.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Gbp.Tms.Api.Controllers;

/// <summary>Autenticación de la web y de la app móvil.</summary>
[ApiController]
[Route("api/auth")]
[Produces("application/json")]
[ProducesResponseType(typeof(RespuestaError), StatusCodes.Status400BadRequest)]
public class AuthController : ControllerBase
{
    private readonly AuthService _auth;

    public AuthController(AuthService auth) => _auth = auth;

    /// <summary>Valida las credenciales y emite el token de acceso.</summary>
    [AllowAnonymous]
    [HttpPost("login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status403Forbidden)]
    public Task<LoginResponse> Login([FromBody] LoginRequest req, CancellationToken ct)
        => _auth.LoginAsync(req, ObtenerIp(), ct);

    /// <summary>Datos del usuario autenticado y sus roles.</summary>
    [Authorize]
    [HttpGet("yo")]
    [ProducesResponseType(typeof(UsuarioDto), StatusCodes.Status200OK)]
    public Task<UsuarioDto> Yo(CancellationToken ct)
        => _auth.ObtenerAsync(IdUsuarioActual(), ct);

    /// <summary>
    /// Marca la sesión como cerrada en la bitácora. El token sigue siendo
    /// válido hasta expirar: el cliente debe descartarlo.
    /// </summary>
    [Authorize]
    [HttpPost("salir")]
    [ProducesResponseType(typeof(RespuestaOk), StatusCodes.Status200OK)]
    public async Task<ActionResult<RespuestaOk>> Salir(CancellationToken ct)
    {
        var jti = User.FindFirstValue(JwtRegisteredClaimNames.Jti);

        if (!string.IsNullOrEmpty(jti))
            await _auth.CerrarSesionAsync(jti, ct);

        return Ok(new RespuestaOk());
    }

    private int IdUsuarioActual()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier)
                 ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub);

        return int.TryParse(id, out var n)
            ? n
            : throw new AppException("El token no identifica a un usuario válido.", 401);
    }

    /// <summary>
    /// IP real del cliente. Detrás de IIS o de un proxy, la de la conexión es
    /// la del proxy, así que se prefiere X-Forwarded-For cuando viene.
    /// </summary>
    private string? ObtenerIp()
    {
        var reenviada = Request.Headers["X-Forwarded-For"].FirstOrDefault();

        if (!string.IsNullOrWhiteSpace(reenviada))
            return reenviada.Split(',')[0].Trim();

        return HttpContext.Connection.RemoteIpAddress?.ToString();
    }
}
