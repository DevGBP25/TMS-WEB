using System.Text.Json;
using Gbp.Tms.Application.Common;

namespace Gbp.Tms.Api.Middleware;

/// <summary>
/// Traduce las excepciones a JSON uniforme: <c>AppException</c> conserva su código y
/// mensaje; cualquier otra se registra y sale como 500 genérico.
/// </summary>
public class ExceptionMiddleware
{
    private readonly RequestDelegate               _next;
    private readonly ILogger<ExceptionMiddleware>  _log;
    private readonly IHostEnvironment              _env;

    public ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> log, IHostEnvironment env)
    {
        _next = next;
        _log  = log;
        _env  = env;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (AppException ex)
        {
            await EscribirAsync(context, ex.StatusCode, ex.Message);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Error no controlado en {Metodo} {Ruta}",
                context.Request.Method, context.Request.Path);

            // En desarrollo se devuelve el detalle real; en producción, un mensaje neutro.
            await EscribirAsync(context, 500,
                _env.IsDevelopment() ? ex.Message : "Ocurrió un error inesperado.");
        }
    }

    private static async Task EscribirAsync(HttpContext context, int statusCode, string mensaje)
    {
        if (context.Response.HasStarted) return;

        context.Response.Clear();
        context.Response.StatusCode  = statusCode;
        context.Response.ContentType = "application/json; charset=utf-8";

        await context.Response.WriteAsync(
            JsonSerializer.Serialize(new { ok = false, mensaje }));
    }
}
