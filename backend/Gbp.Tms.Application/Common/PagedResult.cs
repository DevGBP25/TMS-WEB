namespace Gbp.Tms.Application.Common;

/// <summary>Página de resultados junto al total de filas que cumplen el filtro.</summary>
public class PagedResult<T>
{
    public IReadOnlyList<T> Items    { get; init; } = Array.Empty<T>();
    public int              Total    { get; init; }
    public int              Pagina   { get; init; } = 1;
    public int              PorPagina{ get; init; } = 50;

    public int TotalPaginas => PorPagina <= 0 ? 0 : (int)Math.Ceiling(Total / (double)PorPagina);
}
