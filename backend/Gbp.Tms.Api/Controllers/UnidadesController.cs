using Gbp.Tms.Api.Contracts;
using Gbp.Tms.Application.Unidades;
using Gbp.Tms.Application.Unidades.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Gbp.Tms.Api.Controllers;

/// <summary>Flota de la empresa: camiones, paneles y remolques.</summary>
[ApiController]
[Route("api/unidades")]
[Produces("application/json")]
[Authorize]
[ProducesResponseType(typeof(RespuestaError), StatusCodes.Status400BadRequest)]
public class UnidadesController : ControllerBase
{
    private readonly UnidadService _unidades;

    public UnidadesController(UnidadService unidades) => _unidades = unidades;

    /// <summary>Unidades registradas, con el piloto que tenga turno abierto.</summary>
    /// <param name="buscar">Filtra por código, placa, marca o modelo.</param>
    /// <param name="estado">DISPONIBLE, EN_RUTA, MANTENIMIENTO o FUERA_SERVICIO.</param>
    /// <param name="soloActivas">Excluye las dadas de baja.</param>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<UnidadListaDto>), StatusCodes.Status200OK)]
    public Task<IReadOnlyList<UnidadListaDto>> Listar(
        [FromQuery] string? buscar, [FromQuery] string? estado,
        [FromQuery] bool soloActivas = false, CancellationToken ct = default)
        => _unidades.ListarAsync(buscar, estado, soloActivas, ct);

    /// <summary>Estados que puede fijar esta pantalla. EN_RUTA no está: lo pone el turno.</summary>
    [HttpGet("estados")]
    [ProducesResponseType(typeof(IReadOnlyList<string>), StatusCodes.Status200OK)]
    public IReadOnlyList<string> Estados() => EstadoUnidad.Asignables;

    /// <summary>Registra una unidad nueva.</summary>
    [HttpPost]
    [Authorize(Roles = "ADMIN,DESPACHO")]
    [ProducesResponseType(typeof(RespuestaUnidadCreada), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RespuestaUnidadCreada>> Crear(
        [FromBody] GuardarUnidadRequest req, CancellationToken ct)
    {
        var id = await _unidades.CrearAsync(req, ct);
        return CreatedAtAction(nameof(Listar), new { }, new RespuestaUnidadCreada { IdUnidad = id });
    }

    /// <summary>
    /// Actualiza datos y estado. El código no se modifica, y una unidad con
    /// turno abierto no puede pasar a mantenimiento ni darse de baja.
    /// </summary>
    [HttpPut("{id:int}")]
    [Authorize(Roles = "ADMIN,DESPACHO")]
    [ProducesResponseType(typeof(RespuestaOk), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RespuestaOk>> Actualizar(
        int id, [FromBody] GuardarUnidadRequest req, CancellationToken ct)
    {
        await _unidades.ActualizarAsync(id, req, ct);
        return Ok(new RespuestaOk());
    }
}
