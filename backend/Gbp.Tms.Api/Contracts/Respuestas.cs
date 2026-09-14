namespace Gbp.Tms.Api.Contracts;

/// <summary>Respuesta de una operación que no devuelve datos.</summary>
public record RespuestaOk
{
    public bool Ok { get; init; } = true;
}

/// <summary>Respuesta de la creación de un viaje.</summary>
public record RespuestaViajeCreado : RespuestaOk
{
    public int ViajeId { get; init; }

    /// <summary>Correlativo legible, del estilo V260910-001.</summary>
    public string Numero { get; init; } = string.Empty;
}

/// <summary>Respuesta de una operación en lote sobre entregas.</summary>
public record RespuestaEntregas : RespuestaOk
{
    public int Afectadas { get; init; }
}

/// <summary>
/// Cuerpo uniforme de error que produce <c>ExceptionMiddleware</c>.
/// Se declara para que quede documentado en Swagger, no se construye a mano.
/// </summary>
public record RespuestaError
{
    public bool   Ok      { get; init; }
    public string Mensaje { get; init; } = string.Empty;
}

/// <summary>Respuesta del alta de un usuario.</summary>
public record RespuestaUsuarioCreado : RespuestaOk
{
    public int IdUsuario { get; init; }
}

/// <summary>Respuesta del alta de una unidad.</summary>
public record RespuestaUnidadCreada : RespuestaOk
{
    public int IdUnidad { get; init; }
}
