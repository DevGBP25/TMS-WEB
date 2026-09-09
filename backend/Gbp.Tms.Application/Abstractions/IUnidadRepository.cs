using Gbp.Tms.Application.Unidades.Dtos;

namespace Gbp.Tms.Application.Abstractions;

/// <summary>Flota. Cada método corresponde a un procedimiento almacenado.</summary>
public interface IUnidadRepository
{
    Task<IReadOnlyList<UnidadListaDto>> ListarAsync(
        string? buscar, string? estado, bool soloActivas, CancellationToken ct = default);

    /// <summary>Devuelve el id creado. Lanza <see cref="Common.AppException"/> si el código o la placa se repiten.</summary>
    Task<int> CrearAsync(GuardarUnidadRequest req, CancellationToken ct = default);

    /// <summary>false si la unidad no existe.</summary>
    Task<bool> ActualizarAsync(int idUnidad, GuardarUnidadRequest req, CancellationToken ct = default);
}
