using Gbp.Tms.Application.Viajes.Dtos;

namespace Gbp.Tms.Application.Abstractions;

public interface IViajeRepository
{
    Task<IReadOnlyList<ViajeListaDto>> ListarAsync(ViajeFiltro filtro, CancellationToken ct = default);

    /// <summary>Encabezado y entregas en una sola llamada; por separado no sirven.</summary>
    Task<ViajeDetalleDto?> ObtenerAsync(int idViaje, CancellationToken ct = default);

    Task<(int IdViaje, string Numero)> CrearAsync(CrearViajeRequest req, CancellationToken ct = default);

    Task AsignarRecursosAsync(int idViaje, AsignarRecursosRequest req, CancellationToken ct = default);

    Task CambiarEstadoAsync(
        int idViaje, string estado, string? observaciones, CancellationToken ct = default);

    Task<IReadOnlyList<PilotoDto>> PilotosAsync(DateTime? fecha, CancellationToken ct = default);
}
