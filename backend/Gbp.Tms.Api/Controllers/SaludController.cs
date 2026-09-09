using Gbp.Tms.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;

namespace Gbp.Tms.Api.Controllers;

/// <summary>Diagnóstico rápido: confirma que la API responde y que la base contesta.</summary>
[ApiController]
[Route("api/salud")]
[Produces("application/json")]
public class SaludController : ControllerBase
{
    private readonly ISqlConnectionFactory _factory;

    public SaludController(ISqlConnectionFactory factory) => _factory = factory;

    /// <summary>Confirma que la API está en pie y en qué entorno corre.</summary>
    [HttpGet]
    public IActionResult Ping() => Ok(new
    {
        ok      = true,
        api     = "Gbp.Tms.Api",
        entorno = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production",
        hora    = DateTime.Now
    });

    /// <summary>Abre una conexión real a SQL Server; responde 503 si la base no contesta.</summary>
    [HttpGet("bd")]
    public async Task<IActionResult> BaseDatos(CancellationToken ct)
    {
        try
        {
            using var conn = await _factory.CreateAsync(ct);
            return Ok(new { ok = true, estado = "conectado", bd = conn.Database });
        }
        catch (Exception ex)
        {
            return StatusCode(503, new { ok = false, estado = "sin conexión", mensaje = ex.Message });
        }
    }
}
