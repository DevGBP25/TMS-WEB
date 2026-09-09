using System.Security.Claims;
using Gbp.Tms.Api.Contracts;
using Gbp.Tms.Application.Usuarios;
using Gbp.Tms.Application.Usuarios.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Gbp.Tms.Api.Controllers;

/// <summary>
/// Administración de cuentas. Sólo el rol ADMIN: aquí se crean usuarios y se
/// definen contraseñas, así que no debe abrirse a otros perfiles.
/// </summary>
[ApiController]
[Route("api/usuarios")]
[Produces("application/json")]
[Authorize(Roles = "ADMIN")]
[ProducesResponseType(typeof(RespuestaError), StatusCodes.Status400BadRequest)]
[ProducesResponseType(typeof(RespuestaError), StatusCodes.Status403Forbidden)]
public class UsuariosController : ControllerBase
{
    private readonly UsuarioService _usuarios;

    public UsuariosController(UsuarioService usuarios) => _usuarios = usuarios;

    /// <summary>Usuarios registrados, con sus roles.</summary>
    /// <param name="buscar">Filtra por código o nombre.</param>
    /// <param name="soloActivos">Excluye las cuentas desactivadas.</param>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<UsuarioListaDto>), StatusCodes.Status200OK)]
    public Task<IReadOnlyList<UsuarioListaDto>> Listar(
        [FromQuery] string? buscar, [FromQuery] bool soloActivos = false, CancellationToken ct = default)
        => _usuarios.ListarAsync(buscar, soloActivos, ct);

    /// <summary>Roles disponibles para asignar.</summary>
    [HttpGet("roles")]
    [ProducesResponseType(typeof(IReadOnlyList<RolDto>), StatusCodes.Status200OK)]
    public Task<IReadOnlyList<RolDto>> Roles(CancellationToken ct)
        => _usuarios.RolesAsync(ct);

    /// <summary>Crea una cuenta con la contraseña que defina el administrador.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(RespuestaUsuarioCreado), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RespuestaUsuarioCreado>> Crear(
        [FromBody] CrearUsuarioRequest req, CancellationToken ct)
    {
        var id = await _usuarios.CrearAsync(req, IdUsuarioActual(), ct);
        return CreatedAtAction(nameof(Listar), new { }, new RespuestaUsuarioCreado { IdUsuario = id });
    }

    /// <summary>Actualiza datos, estado y roles. Los roles enviados reemplazan a los anteriores.</summary>
    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(RespuestaOk), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<RespuestaOk>> Actualizar(
        int id, [FromBody] ActualizarUsuarioRequest req, CancellationToken ct)
    {
        await _usuarios.ActualizarAsync(id, req, IdUsuarioActual(), ct);
        return Ok(new RespuestaOk());
    }

    /// <summary>Define una contraseña nueva. También limpia los intentos fallidos.</summary>
    [HttpPost("{id:int}/password")]
    [ProducesResponseType(typeof(RespuestaOk), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<RespuestaOk>> RestablecerPassword(
        int id, [FromBody] RestablecerPasswordRequest req, CancellationToken ct)
    {
        await _usuarios.RestablecerPasswordAsync(id, req, ct);
        return Ok(new RespuestaOk());
    }

    private int? IdUsuarioActual() =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var n) ? n : null;
}
