using Gbp.Tms.Application.Common;
using Gbp.Tms.Application.Entregas.Dtos;

namespace Gbp.Tms.Application.Abstractions;

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
        int idPiloto, IReadOnlyList<EntregaSap> entregas, CancellationToken ct = default);

    /// <summary>Borra la fila: la boleta vuelve a la lista de disponibles de SAP.</summary>
    Task<int> LiberarAsync(IReadOnlyList<int> ids, CancellationToken ct = default);

    /// <summary>Agrupa boletas ya asignadas en un viaje. No cambia de quién son.</summary>
    Task<int> AsignarViajeAsync(int idViaje, IReadOnlyList<int> ids, CancellationToken ct = default);
}
