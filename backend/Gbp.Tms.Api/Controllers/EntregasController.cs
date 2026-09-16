using Gbp.Tms.Api.Contracts;
using Gbp.Tms.Application.Common;
using Gbp.Tms.Application.Entregas;
using Gbp.Tms.Application.Entregas.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Gbp.Tms.Api.Controllers;

/// <summary>
/// Boletas de entrega. Hay dos mundos aquí y conviene no confundirlos:
///
/// · <c>/disponibles</c> es una lectura en vivo de SAP. No hay nada guardado.
/// · El resto opera sobre lo que el TMS administra, que es lo que ya tiene
///   piloto. Esa fila nace al asignar y muere al liberar.
/// </summary>
[ApiController]
[Route("api/entregas")]
[Produces("application/json")]
[Authorize]
[ProducesResponseType(typeof(RespuestaError), StatusCodes.Status400BadRequest)]
public class EntregasController : ControllerBase
{
    /// <summary>Quien reparte el trabajo. El piloto sólo consulta.</summary>
    private const string Operadores = "ADMIN,SUPERVISOR,DESPACHO";

    private readonly EntregaService _entregas;

    public EntregasController(EntregaService entregas) => _entregas = entregas;

    /// <summary>
    /// Órdenes de venta todavía sin repartir. Se lee del Service Layer en
    /// cada llamada; no se guarda nada.
    ///
    /// La columna "tiene entrega" sale del estado del documento en SAP, que
    /// es lo único que se puede saber sin bajar las líneas de todas las
    /// entregas del rango —y eso son veinte segundos de espera.
    /// </summary>
    /// <param name="desde">Inicio del rango. Por omisión, siete días atrás.</param>
    /// <param name="hasta">Fin del rango. Por omisión, hoy.</param>
    /// <param name="buscar">Cliente, dirección, o número de boleta, orden de venta o factura.</param>
    [HttpGet("disponibles")]
    [ProducesResponseType(typeof(IReadOnlyList<OrdenDisponibleDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status502BadGateway)]
    public Task<IReadOnlyList<OrdenDisponibleDto>> Disponibles(
        [FromQuery] DateTime? desde,
        [FromQuery] DateTime? hasta,
        [FromQuery] string? buscar,
        CancellationToken ct = default)
        => _entregas.DisponiblesAsync(desde, hasta, buscar, ct);

    /// <summary>Boletas que el TMS administra, es decir las que ya tienen piloto.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<EntregaListaDto>), StatusCodes.Status200OK)]
    public Task<PagedResult<EntregaListaDto>> Listar(
        [FromQuery] string? buscar,
        [FromQuery] string? estado,
        [FromQuery] string? municipio,
        [FromQuery] DateTime? desde,
        [FromQuery] DateTime? hasta,
        [FromQuery] int? idViaje,
        [FromQuery] int? idPiloto,
        [FromQuery] bool sinViaje = false,
        [FromQuery] int pagina = 1,
        [FromQuery] int porPagina = 50,
        CancellationToken ct = default)
        => _entregas.ListarAsync(new EntregaFiltro
        {
            Buscar    = buscar,
            Estado    = estado,
            Municipio = municipio,
            Desde     = desde,
            Hasta     = hasta,
            IdViaje   = idViaje,
            IdPiloto  = idPiloto,
            SinViaje  = sinViaje,
            Pagina    = pagina,
            PorPagina = porPagina
        }, ct);

    /// <summary>Una boleta con su piloto, su viaje y los productos que lleva.</summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(EntregaDetalleDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status404NotFound)]
    public Task<EntregaDetalleDto> Obtener(int id, CancellationToken ct)
        => _entregas.ObtenerAsync(id, ct);

    /// <summary>Contadores de lo que el TMS administra.</summary>
    [HttpGet("resumen")]
    [ProducesResponseType(typeof(ResumenEntregasDto), StatusCodes.Status200OK)]
    public Task<ResumenEntregasDto> Resumen(CancellationToken ct)
        => _entregas.ResumenAsync(ct);

    /// <summary>Estados posibles de una boleta ya asignada.</summary>
    [HttpGet("estados")]
    [ProducesResponseType(typeof(IReadOnlyList<string>), StatusCodes.Status200OK)]
    public IReadOnlyList<string> Estados() => EstadoEntrega.Todos;

    /// <summary>
    /// Reparte las órdenes seleccionadas entre un piloto. Aquí es donde las
    /// entregas se guardan: hasta este momento sólo existían en SAP.
    ///
    /// Los datos se releen de SAP al guardarlos, no se toman de la pantalla:
    /// entre que el supervisor abrió la lista y pulsó el botón pudieron
    /// anular el documento o cambiar la dirección. Es todo o nada.
    /// </summary>
    [HttpPost("asignar-piloto")]
    [Authorize(Roles = Operadores)]
    [ProducesResponseType(typeof(RespuestaEntregas), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RespuestaEntregas>> AsignarPiloto(
        [FromBody] AsignarPilotoRequest req, CancellationToken ct)
    {
        var n = await _entregas.AsignarPilotoAsync(req, ct);
        return Ok(new RespuestaEntregas { Afectadas = n });
    }

    /// <summary>
    /// Completa las boletas que se repartieron antes de que SAP generara su
    /// entrega: les pone el número de boleta y la factura cuando ya existen.
    ///
    /// Va aparte y no dentro del listado porque consulta SAP con las líneas,
    /// que es la parte cara: se ejecuta cuando el supervisor lo pide, no en
    /// cada apertura de la pantalla.
    /// </summary>
    [HttpPost("vincular")]
    [Authorize(Roles = Operadores)]
    [ProducesResponseType(typeof(RespuestaEntregas), StatusCodes.Status200OK)]
    public async Task<ActionResult<RespuestaEntregas>> Vincular(
        [FromQuery] int dias = 30, CancellationToken ct = default)
    {
        var n = await _entregas.VincularAsync(dias, ct);
        return Ok(new RespuestaEntregas { Afectadas = n });
    }

    /// <summary>
    /// Pasa boletas ya repartidas a otro piloto, sin devolverlas a SAP ni
    /// perder sus productos.
    /// </summary>
    [HttpPost("cambiar-piloto")]
    [Authorize(Roles = Operadores)]
    [ProducesResponseType(typeof(RespuestaEntregas), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RespuestaEntregas>> CambiarPiloto(
        [FromBody] CambiarPilotoRequest req, CancellationToken ct)
    {
        var n = await _entregas.CambiarPilotoAsync(req, ct);
        return Ok(new RespuestaEntregas { Afectadas = n });
    }

    /// <summary>
    /// Saca boletas de su viaje sin desasignarlas: conservan piloto y
    /// productos, y quedan disponibles para armar otro viaje.
    /// </summary>
    [HttpPost("sacar-de-viaje")]
    [Authorize(Roles = Operadores)]
    [ProducesResponseType(typeof(RespuestaEntregas), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RespuestaEntregas>> SacarDeViaje(
        [FromBody] IdsRequest req, CancellationToken ct)
    {
        var n = await _entregas.SacarDeViajeAsync(req, ct);
        return Ok(new RespuestaEntregas { Afectadas = n });
    }

    /// <summary>
    /// Libera boletas: se borran del TMS y vuelven a aparecer en la lista de
    /// disponibles. Sólo antes de salir; después, un cambio es un rechazo y
    /// lo registra el piloto desde la aplicación móvil.
    /// </summary>
    [HttpPost("liberar")]
    [Authorize(Roles = Operadores)]
    [ProducesResponseType(typeof(RespuestaEntregas), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RespuestaEntregas>> Liberar(
        [FromBody] IdsRequest req, CancellationToken ct)
    {
        var n = await _entregas.LiberarAsync(req, ct);
        return Ok(new RespuestaEntregas { Afectadas = n });
    }

    /// <summary>
    /// Agrupa boletas ya asignadas en un viaje, para darles camión y
    /// despacharlas juntas. No cambia de quién son.
    /// </summary>
    [HttpPost("asignar")]
    [Authorize(Roles = Operadores)]
    [ProducesResponseType(typeof(RespuestaEntregas), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RespuestaError), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<RespuestaEntregas>> AsignarViaje(
        [FromBody] AsignarViajeRequest req, CancellationToken ct)
    {
        var n = await _entregas.AsignarViajeAsync(req, ct);
        return Ok(new RespuestaEntregas { Afectadas = n });
    }
}
