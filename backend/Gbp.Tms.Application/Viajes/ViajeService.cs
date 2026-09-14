using Gbp.Tms.Application.Abstractions;
using Gbp.Tms.Application.Common;
using Gbp.Tms.Application.Viajes.Dtos;

namespace Gbp.Tms.Application.Viajes;

/// <summary>
/// El viaje agrupa las entregas que salen juntas con un piloto y un camión.
/// Quién va con quién lo decide el supervisor; aquí sólo se comprueba que la
/// decisión sea posible.
/// </summary>
public class ViajeService
{
    private readonly IViajeRepository   _repo;
    private readonly IEntregaRepository _entregas;

    public ViajeService(IViajeRepository repo, IEntregaRepository entregas)
    {
        _repo     = repo;
        _entregas = entregas;
    }

    public Task<IReadOnlyList<ViajeListaDto>> ListarAsync(
        ViajeFiltro filtro, CancellationToken ct = default)
    {
        if (filtro.Estado is not null && !EstadoViaje.Todos.Contains(filtro.Estado))
            throw new AppException($"Estado no válido: {filtro.Estado}.");

        if (filtro.Desde is not null && filtro.Hasta is not null && filtro.Desde > filtro.Hasta)
            throw new AppException("La fecha inicial no puede ser posterior a la final.");

        filtro.Buscar = string.IsNullOrWhiteSpace(filtro.Buscar) ? null : filtro.Buscar.Trim();

        return _repo.ListarAsync(filtro, ct);
    }

    public async Task<ViajeDetalleDto> ObtenerAsync(int idViaje, CancellationToken ct = default)
        => await _repo.ObtenerAsync(idViaje, ct)
           ?? throw AppException.NoEncontrado($"El viaje {idViaje}");

    /// <summary>
    /// Crea el viaje y, si se indicaron entregas, se las asigna en el acto.
    ///
    /// Si la asignación falla el viaje queda creado y vacío: es preferible a
    /// perder el viaje, y el supervisor lo ve en la lista y decide. Lo que no
    /// puede pasar es que se asigne sólo una parte, y de eso se encarga el
    /// procedimiento, que es todo o nada.
    /// </summary>
    public async Task<(int IdViaje, string Numero)> CrearAsync(
        CrearViajeRequest req, CancellationToken ct = default)
    {
        if (req.Fecha == default)
            throw new AppException("Indique la fecha del viaje.");

        // Sólo uno de los dos recursos deja el viaje a medio asignar.
        if (req.IdUnidad is not null ^ req.IdPiloto is not null)
            throw new AppException("Indique unidad y piloto juntos, o ninguno de los dos.");

        var creado = await _repo.CrearAsync(req, ct);

        var ids = req.Entregas.Where(i => i > 0).Distinct().ToList();

        if (ids.Count > 0)
            await _entregas.AsignarViajeAsync(creado.IdViaje, ids, ct);

        return creado;
    }

    public Task AsignarRecursosAsync(
        int idViaje, AsignarRecursosRequest req, CancellationToken ct = default)
        => _repo.AsignarRecursosAsync(idViaje, req, ct);

    public Task CambiarEstadoAsync(
        int idViaje, CambiarEstadoViajeRequest req, CancellationToken ct = default)
    {
        var estado = (req.Estado ?? string.Empty).Trim().ToUpperInvariant();

        if (!EstadoViaje.Todos.Contains(estado))
            throw new AppException($"Estado no válido: {req.Estado}.");

        return _repo.CambiarEstadoAsync(idViaje, estado, req.Observaciones, ct);
    }

    public Task<IReadOnlyList<PilotoDto>> PilotosAsync(
        DateTime? fecha, CancellationToken ct = default)
        => _repo.PilotosAsync(fecha, ct);
}
