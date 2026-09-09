namespace Gbp.Tms.Application.Common;

/// <summary>
/// Error de negocio esperado (validación, estado inválido). El middleware de la API
/// lo traduce a un 400/404 con mensaje legible en vez de un 500.
/// </summary>
public class AppException : Exception
{
    public int StatusCode { get; }

    public AppException(string mensaje, int statusCode = 400) : base(mensaje)
        => StatusCode = statusCode;

    public static AppException NoEncontrado(string qué) => new($"{qué} no existe.", 404);
}
