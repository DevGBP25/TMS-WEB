using Gbp.Tms.Application.Abstractions;
using Gbp.Tms.Application.Common;
using Gbp.Tms.Application.Unidades.Dtos;

namespace Gbp.Tms.Application.Unidades;

/// <summary>Alta y mantenimiento de la flota: camiones, paneles y remolques.</summary>
public class UnidadService
{
    private readonly IUnidadRepository _repo;

    public UnidadService(IUnidadRepository repo) => _repo = repo;

    public Task<IReadOnlyList<UnidadListaDto>> ListarAsync(
        string? buscar, string? estado, bool soloActivas, CancellationToken ct = default)
    {
        if (estado is not null && !EstadoUnidad.Todos.Contains(estado))
            throw new AppException($"Estado no válido: {estado}.");

        return _repo.ListarAsync(
            string.IsNullOrWhiteSpace(buscar) ? null : buscar.Trim(), estado, soloActivas, ct);
    }

    public Task<int> CrearAsync(GuardarUnidadRequest req, CancellationToken ct = default)
    {
        Normalizar(req);

        // Una unidad nueva no puede nacer en ruta: eso lo define el turno.
        if (req.Estado == EstadoUnidad.EnRuta)
            throw new AppException("Una unidad nueva no puede crearse EN_RUTA.");

        return _repo.CrearAsync(req, ct);
    }

    public async Task ActualizarAsync(
        int idUnidad, GuardarUnidadRequest req, CancellationToken ct = default)
    {
        Normalizar(req);

        var ok = await _repo.ActualizarAsync(idUnidad, req, ct);

        if (!ok) throw AppException.NoEncontrado($"La unidad {idUnidad}");
    }

    private static void Normalizar(GuardarUnidadRequest req)
    {
        // Códigos y placas se comparan a diario contra papeles: van en mayúsculas.
        req.Codigo = req.Codigo.Trim().ToUpperInvariant();
        req.Placa  = string.IsNullOrWhiteSpace(req.Placa) ? null : req.Placa.Trim().ToUpperInvariant();
        req.Estado = (req.Estado ?? EstadoUnidad.Disponible).Trim().ToUpperInvariant();

        if (!EstadoUnidad.Todos.Contains(req.Estado))
            throw new AppException($"Estado no válido: {req.Estado}.");
    }
}
