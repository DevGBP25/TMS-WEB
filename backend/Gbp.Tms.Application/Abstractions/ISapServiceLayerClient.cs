namespace Gbp.Tms.Application.Abstractions;

/// <summary>Entrega de SAP B1 (ODLN) candidata a formar parte de un viaje.</summary>
public record SapEntrega(
    int      DocEntry,
    int      DocNum,
    DateTime DocDate,
    string   CardCode,
    string   CardName,
    string?  Address,
    decimal  DocTotal,
    decimal  PesoKg);

/// <summary>Acceso de sólo lectura y de escritura al SAP B1 Service Layer.</summary>
public interface ISapServiceLayerClient
{
    /// <summary>Entregas de la fecha que aún no han sido incluidas en ningún viaje.</summary>
    Task<IReadOnlyList<SapEntrega>> EntregasPendientesAsync(DateTime fecha, CancellationToken ct = default);

    Task<SapEntrega?> ObtenerEntregaAsync(int docEntry, CancellationToken ct = default);

    /// <summary>GET crudo contra el Service Layer; <paramref name="recurso"/> va sin barra inicial.</summary>
    Task<string> GetRawAsync(string recurso, CancellationToken ct = default);
}
