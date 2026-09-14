using Gbp.Tms.Api.Contracts;
using Gbp.Tms.Application.Viajes;
using Gbp.Tms.Application.Viajes.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Gbp.Tms.Api.Controllers;

/// <summary>
/// Viajes: el grupo de entregas que sale junto con un piloto y un camión.
/// </summary>
[ApiController]
[Route("api/viajes")]
[Produces("application/json")]
[Authorize]
[ProducesResponseType(typeof(RespuestaError), StatusCodes.Status400BadRequest)]
public class ViajesController : ControllerBase
{
    private const string Operadores = "ADMIN,SUPERVISOR,DESPACHO";

    private readonly ViajeService _viajes;

    public ViajesController(ViajeService viajes) => _viajes = viajes;

    /// <summary>Viajes registrados, del más reciente al más antiguo.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<ViajeListaDto>), StatusCodes.Status200OK)]
    public Task<IReadOnlyList<ViajeListaDto>> Listar(
        [FromQuery] string? buscar,
        [FromQuery] string? estado,
        [FromQuery] DateTime? desde,
        [FromQuery] DateTime? hasta,
        CancellationToken ct = default)
        => _viajes.ListarAsync(
            new ViajeFiltro { Buscar = buscar, Estado = estado, Desde = desde, Hasta = hasta }, ct);

    /// <summary>Encabezado del viaje con todas sus entregas.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ViajeDetalleDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status404NotFound)]
    public Task<ViajeDetalleDto> Obtener(int id, CancellationToken ct)
        => _viajes.ObtenerAsync(id, ct);

    /// <summary>Estados posibles de un viaje.</summary>
    [HttpGet("estados")]
    [ProducesResponseType(typeof(IReadOnlyList<string>), StatusCodes.Status200OK)]
    public IReadOnlyList<string> Estados() => EstadoViaje.Todos;

    /// <summary>
    /// Pilotos disponibles, con el viaje que ya tengan ese día. Ver quién
    /// está comprometido es lo que evita asignar dos veces a la misma persona.
    /// </summary>
    [HttpGet("pilotos")]
    [ProducesResponseType(typeof(IReadOnlyList<PilotoDto>), StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PilotoDto>> Pilotos(
        [FromQuery] DateTime? fecha, CancellationToken ct = default)
        => _viajes.PilotosAsync(fecha, ct);

    /// <summary>
    /// Crea un viaje. Puede nacer vacío y cargarse después, o traer ya las
    /// entregas seleccionadas en la pantalla.
    /// </summary>
    [HttpPost]
    [Authorize(Roles = Operadores)]
    [ProducesResponseType(typeof(RespuestaViajeCreado), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RespuestaViajeCreado>> Crear(
        [FromBody] CrearViajeRequest req, CancellationToken ct)
    {
        var (id, numero) = await _viajes.CrearAsync(req, ct);

        return CreatedAtAction(nameof(Obtener), new { id },
            new RespuestaViajeCreado { ViajeId = id, Numero = numero });
    }

    /// <summary>
    /// Asigna camión y piloto. Se rechaza si alguno ya está comprometido en
    /// otro viaje del mismo día que todavía no ha terminado.
    /// </summary>
    [HttpPost("{id:int}/recursos")]
    [Authorize(Roles = Operadores)]
    [ProducesResponseType(typeof(RespuestaOk), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RespuestaOk>> AsignarRecursos(
        int id, [FromBody] AsignarRecursosRequest req, CancellationToken ct)
    {
        await _viajes.AsignarRecursosAsync(id, req, ct);
        return Ok(new RespuestaOk());
    }

    /// <summary>
    /// Cambia el estado del viaje. Despachar (EN_RUTA) arrastra a todas sus
    /// entregas; cancelar las devuelve a pendientes.
    /// </summary>
    [HttpPost("{id:int}/estado")]
    [Authorize(Roles = Operadores)]
    [ProducesResponseType(typeof(RespuestaOk), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RespuestaOk>> CambiarEstado(
        int id, [FromBody] CambiarEstadoViajeRequest req, CancellationToken ct)
    {
        await _viajes.CambiarEstadoAsync(id, req, ct);
        return Ok(new RespuestaOk());
    }
}
