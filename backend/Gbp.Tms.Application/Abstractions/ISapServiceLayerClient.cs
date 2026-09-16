namespace Gbp.Tms.Application.Abstractions;

/// <summary>Línea de un documento de SAP: un producto y su cantidad.</summary>
public record LineaSap(
    int      LineaNum,
    string   CodigoArticulo,
    // SAP antepone el código de barras a la descripción separado por "|".
    string?  CodigoBarras,
    string   Descripcion,
    decimal  Cantidad,
    string?  Unidad,
    string?  Almacen);

/// <summary>
/// Orden de venta tal como está en SAP.
///
/// Se lee sin sus líneas a propósito: el Service Layer manda cada línea con
/// casi cien campos y no admite pedir sólo algunos, así que incluirlas
/// convierte una consulta de dos segundos en una de veinte.
/// </summary>
public record OrdenSap(
    int      SapDocEntry,
    int      SapDocNum,
    DateTime FechaDocumento,
    // DocDate trae sólo la fecha; la hora viaja aparte, en DocTime.
    TimeSpan? HoraDocumento,
    // DocDueDate: la fecha en que se comprometió la entrega al cliente.
    DateTime? FechaEntrega,
    string   ClienteCodigo,
    string   ClienteNombre,
    string?  Direccion,
    string?  Municipio,
    decimal  Monto,
    string?  Comentarios,
    /// <summary>
    /// SAP ya copió la orden a su documento destino. En esta operación eso
    /// significa que la entrega existe; es lo único que se puede saber sin
    /// bajar las líneas de todas las entregas del rango.
    /// </summary>
    bool     Cerrada,
    bool     Anulada,
    // Vacías en el listado y llenas al asignar: pedirlas cuesta veinte segundos.
    IReadOnlyList<LineaSap> Lineas);

/// <summary>
/// Entrega de SAP con sus productos. Sólo se lee así al asignar, que es
/// cuando hacen falta las líneas y son pocos documentos.
/// </summary>
public record EntregaSap(
    int      SapDocEntry,
    int      SapDocNum,
    int?     SapOrdenVenta,
    int?     SapOrdenVentaDocEntry,
    int?     SapFacturaNum,
    string   ClienteCodigo,
    string   ClienteNombre,
    string?  Direccion,
    string?  Municipio,
    decimal  PesoKg,
    decimal  Monto,
    string?  Comentarios,
    DateTime FechaDocumento,
    bool     Anulada,
    bool     Facturada,
    IReadOnlyList<LineaSap> Lineas);

/// <summary>Acceso de sólo lectura al SAP B1 Service Layer.</summary>
public interface ISapServiceLayerClient
{
    /// <summary>
    /// Órdenes de venta del rango, sin líneas. Es la consulta del listado y
    /// por eso se mantiene barata.
    /// </summary>
    Task<IReadOnlyList<OrdenSap>> OrdenesDeRangoAsync(
        DateTime desde, DateTime hasta, CancellationToken ct = default);

    /// <summary>
    /// Entregas que nacieron de esas órdenes, con sus productos.
    ///
    /// El enlace vive en las líneas de la entrega, así que esta consulta sí
    /// las baja. Para que no cueste una eternidad se acota por los clientes
    /// de las órdenes elegidas, no sólo por fecha.
    /// </summary>
    Task<IReadOnlyList<EntregaSap>> EntregasDeOrdenesAsync(
        IReadOnlyList<int> ordenDocEntries, IReadOnlyList<string> clientes,
        DateTime desde, DateTime hasta, CancellationToken ct = default);

    /// <summary>
    /// Las mismas órdenes pero con sus productos, para las pocas que el
    /// supervisor acaba de elegir. Aquí sí se pagan las líneas: son un
    /// puñado de documentos y son lo que el piloto va a llevar.
    /// </summary>
    Task<IReadOnlyList<OrdenSap>> OrdenesConLineasAsync(
        IReadOnlyList<int> docEntries, CancellationToken ct = default);

    /// <summary>GET crudo contra el Service Layer; <paramref name="recurso"/> va sin barra inicial.</summary>
    Task<string> GetRawAsync(string recurso, CancellationToken ct = default);
}
