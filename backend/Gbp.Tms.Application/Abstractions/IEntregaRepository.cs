using Gbp.Tms.Application.Common;
using Gbp.Tms.Application.Entregas.Dtos;

namespace Gbp.Tms.Application.Abstractions;

/// <summary>
/// Una boleta a punto de nacer. Nace de la orden de venta, que es lo único
/// que existe con seguridad cuando el supervisor reparte: la entrega y la
/// factura pueden llegar días después y por eso van en nulo.
/// </summary>
public record EntregaAAsignar(
    int       SapOrdenDocEntry,
    int       SapOrdenVenta,
    int?      SapDocEntry,
    int?      SapDocNum,
    int?      SapFacturaNum,
    string    ClienteCodigo,
    string    ClienteNombre,
    string?   Direccion,
    string?   Municipio,
    decimal   PesoKg,
    decimal   Monto,
    DateTime  FechaDocumento,
    TimeSpan? HoraDocumento,
    DateTime? FechaEntrega,
    IReadOnlyList<LineaSap> Lineas);

/// <summary>Lo que SAP terminó generando para una orden ya repartida.</summary>
public record VinculoEntrega(
    int  SapOrdenDocEntry,
    int  SapDocEntry,
    int  SapDocNum,
    int? SapFacturaNum,
    bool Anulada);

/// <summary>Boleta repartida a la que todavía le falta su entrega o su factura.</summary>
public record PendienteDeBoleta(
    int      IdEntrega,
    int      SapOrdenDocEntry,
    int      SapOrdenVenta,
    string   ClienteCodigo,
    DateTime FechaDocumento);

/// <summary>
/// Lo que el TMS administra: boletas que ya tienen piloto.
///
/// Lo que todavía no se asignó no pasa por aquí —vive en SAP— así que este
/// repositorio no tiene nada parecido a una sincronización.
/// </summary>
public interface IEntregaRepository
{
    Task<PagedResult<EntregaListaDto>> ListarAsync(EntregaFiltro filtro, CancellationToken ct = default);

    Task<EntregaDetalleDto?> ObtenerAsync(int idEntrega, CancellationToken ct = default);

    Task<ResumenEntregasDto> ResumenAsync(CancellationToken ct = default);

    /// <summary>
    /// De un conjunto de documentos de SAP, cuáles ya están tomados. Es lo
    /// que permite listar lo disponible sin ofrecer lo que alguien ya asignó.
    /// </summary>
    Task<IReadOnlyList<int>> TomadasAsync(
        IReadOnlyList<int> sapDocEntries, CancellationToken ct = default);

    /// <summary>
    /// De estas órdenes de venta, cuáles ya tienen su entrega repartida. Es
    /// por donde filtra el listado, que va por orden y no por boleta.
    /// </summary>
    Task<IReadOnlyList<int>> OrdenesTomadasAsync(
        IReadOnlyList<int> ordenNums, CancellationToken ct = default);

    /// <summary>
    /// Aquí nace la fila: inserta las boletas con su piloto y sus productos.
    /// Todo el grupo o ninguno.
    /// </summary>
    Task<int> AsignarPilotoAsync(
        int idPiloto, IReadOnlyList<EntregaAAsignar> boletas, CancellationToken ct = default);

    /// <summary>Las que se repartieron antes de que SAP generara la entrega.</summary>
    Task<IReadOnlyList<PendienteDeBoleta>> PendientesDeBoletaAsync(
        int dias, CancellationToken ct = default);

    /// <summary>
    /// Completa esas boletas con la entrega y la factura que SAP ya emitió.
    /// Es lo que cierra el círculo de planificar con anticipación.
    /// </summary>
    Task<int> VincularAsync(
        IReadOnlyList<VinculoEntrega> vinculos, CancellationToken ct = default);

    /// <summary>
    /// Pasa boletas ya repartidas a otro piloto. La boleta es la misma: sólo
    /// cambia de manos.
    /// </summary>
    Task<int> CambiarPilotoAsync(
        int idPiloto, IReadOnlyList<int> ids, CancellationToken ct = default);

    /// <summary>
    /// Saca boletas de su viaje sin desasignarlas: conservan piloto y
    /// productos. Es el paso intermedio para reacomodar un viaje.
    /// </summary>
    Task<int> SacarDeViajeAsync(IReadOnlyList<int> ids, CancellationToken ct = default);

    /// <summary>Borra la fila: la boleta vuelve a la lista de disponibles de SAP.</summary>
    Task<int> LiberarAsync(IReadOnlyList<int> ids, CancellationToken ct = default);

    /// <summary>Agrupa boletas ya asignadas en un viaje. No cambia de quién son.</summary>
    Task<int> AsignarViajeAsync(int idViaje, IReadOnlyList<int> ids, CancellationToken ct = default);
}
