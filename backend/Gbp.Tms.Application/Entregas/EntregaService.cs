using Gbp.Tms.Application.Abstractions;
using Gbp.Tms.Application.Common;
using Gbp.Tms.Application.Entregas.Dtos;
using Microsoft.Extensions.Logging;

namespace Gbp.Tms.Application.Entregas;

/// <summary>
/// Las boletas de entrega de SAP y su reparto entre pilotos.
///
/// El TMS no guarda lo que no administra: mientras una boleta no tenga
/// piloto vive sólo en SAP y se lee en cada consulta. La fila en la base
/// nace al asignarla, con los datos del documento y sus productos tal como
/// estaban en ese momento.
/// </summary>
public class EntregaService
{
    private readonly IEntregaRepository      _repo;
    private readonly ISapServiceLayerClient  _sap;
    private readonly ILogger<EntregaService> _log;

    public EntregaService(
        IEntregaRepository      repo,
        ISapServiceLayerClient  sap,
        ILogger<EntregaService> log)
    {
        _repo = repo;
        _sap  = sap;
        _log  = log;
    }

    /// <summary>Rango por omisión de la vista de SAP, en días hacia atrás.</summary>
    private const int DiasPorOmision = 7;

    /// <summary>Tope del rango. Leer meses del Service Layer no es una consulta, es una espera.</summary>
    private const int MaxDias = 31;

    /// <summary>
    /// Órdenes de venta que todavía nadie reparte.
    ///
    /// Es una lectura pura; no escribe nada en la base. Se listan órdenes y
    /// no entregas porque la orden viene sin líneas y la entrega no, y esa
    /// diferencia son dieciocho segundos de espera.
    /// </summary>
    public async Task<IReadOnlyList<OrdenDisponibleDto>> DisponiblesAsync(
        DateTime? desde, DateTime? hasta, string? buscar, CancellationToken ct = default)
    {
        var (inicio, fin) = Rango(desde, hasta);

        var deSap = await _sap.OrdenesDeRangoAsync(inicio, fin, ct);

        var vigentes = deSap.Where(o => !o.Anulada).ToList();

        var tomadas = await _repo.OrdenesTomadasAsync(
            vigentes.Select(o => o.SapDocNum).ToList(), ct);

        var yaEstan = tomadas.ToHashSet();

        var libres = vigentes.Where(o => !yaEstan.Contains(o.SapDocNum));

        if (!string.IsNullOrWhiteSpace(buscar))
        {
            var t = buscar.Trim();

            libres = libres.Where(o =>
                o.ClienteNombre.Contains(t, StringComparison.OrdinalIgnoreCase) ||
                o.ClienteCodigo.Contains(t, StringComparison.OrdinalIgnoreCase) ||
                (o.Direccion?.Contains(t, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (o.Comentarios?.Contains(t, StringComparison.OrdinalIgnoreCase) ?? false) ||
                o.SapDocNum.ToString() == t);
        }

        var resultado = libres
            .OrderByDescending(o => o.FechaDocumento)
            .ThenByDescending(o => o.SapDocNum)
            .Select(o => new OrdenDisponibleDto(
                o.SapDocEntry, o.SapDocNum, o.FechaDocumento,
                o.ClienteCodigo, o.ClienteNombre, o.Direccion, o.Municipio,
                o.Comentarios, o.Cerrada))
            .ToList();

        _log.LogInformation(
            "Órdenes {Desde:d}–{Hasta:d}: {Sap} en SAP, {Tomadas} ya repartidas, {Libres} ofrecidas.",
            inicio, fin, deSap.Count, yaEstan.Count, resultado.Count);

        return resultado;
    }

    private (DateTime Inicio, DateTime Fin) Rango(DateTime? desde, DateTime? hasta)
    {
        var fin    = (hasta ?? DateTime.Today).Date;
        var inicio = (desde ?? fin.AddDays(-DiasPorOmision)).Date;

        if (inicio > fin)
            throw new AppException("La fecha inicial no puede ser posterior a la final.");

        if ((fin - inicio).TotalDays > MaxDias)
            throw new AppException($"El rango no puede exceder {MaxDias} días.");

        return (inicio, fin);
    }

    public Task<PagedResult<EntregaListaDto>> ListarAsync(
        EntregaFiltro filtro, CancellationToken ct = default)
    {
        if (filtro.Estado is not null && !EstadoEntrega.Todos.Contains(filtro.Estado))
            throw new AppException($"Estado no válido: {filtro.Estado}.");

        if (filtro.Desde is not null && filtro.Hasta is not null && filtro.Desde > filtro.Hasta)
            throw new AppException("La fecha inicial no puede ser posterior a la final.");

        filtro.Buscar    = Limpiar(filtro.Buscar);
        filtro.Municipio = Limpiar(filtro.Municipio);

        if (filtro.Pagina < 1) filtro.Pagina = 1;
        if (filtro.PorPagina is < 1 or > 200) filtro.PorPagina = 50;

        return _repo.ListarAsync(filtro, ct);
    }

    public async Task<EntregaDetalleDto> ObtenerAsync(int idEntrega, CancellationToken ct = default)
        => await _repo.ObtenerAsync(idEntrega, ct)
           ?? throw AppException.NoEncontrado($"La entrega {idEntrega}");

    public Task<ResumenEntregasDto> ResumenAsync(CancellationToken ct = default)
        => _repo.ResumenAsync(ct);

    /// <summary>
    /// Reparte las órdenes seleccionadas: busca la entrega de cada una en SAP
    /// y la guarda con el piloto puesto.
    ///
    /// Lo que se guarda se relee de SAP en este momento, no se toma de la
    /// pantalla: entre que el supervisor abrió la lista y pulsó el botón
    /// pudieron facturar, anular o cambiar la dirección.
    /// </summary>
    public async Task<int> AsignarPilotoAsync(
        AsignarPilotoRequest req, CancellationToken ct = default)
    {
        var ordenes = Depurar(req.SapDocEntries);

        /* Hay que saber de qué días son las órdenes para acotar la búsqueda de
           sus entregas. Releerlas cuesta un par de segundos y evita barrer
           semanas de documentos. */
        var (inicio, fin) = Rango(null, null);
        var todas = await _sap.OrdenesDeRangoAsync(inicio, fin, ct);

        var elegidas = todas.Where(o => ordenes.Contains(o.SapDocEntry)).ToList();

        if (elegidas.Count == 0)
            throw new AppException(
                "Las órdenes seleccionadas ya no aparecen en SAP. Actualice la lista.", 409);

        var desdeDoc = elegidas.Min(o => o.FechaDocumento).Date;
        var hastaDoc = elegidas.Max(o => o.FechaDocumento).Date.AddDays(MargenEntrega);

        var clientes = elegidas.Select(o => o.ClienteCodigo).Distinct().ToList();

        var entregas = await _sap.EntregasDeOrdenesAsync(ordenes, clientes, desdeDoc, hastaDoc, ct);

        var conEntrega = entregas.Select(e => e.SapOrdenVentaDocEntry).OfType<int>().ToHashSet();

        var sinEntrega = elegidas
            .Where(o => !conEntrega.Contains(o.SapDocEntry))
            .Select(o => o.SapDocNum)
            .ToList();

        if (sinEntrega.Count > 0)
            throw new AppException(
                $"Estas órdenes todavía no tienen entrega en SAP: {string.Join(", ", sinEntrega)}.", 409);

        var anuladas = entregas.Where(e => e.Anulada).Select(e => e.SapDocNum).ToList();
        if (anuladas.Count > 0)
            throw new AppException(
                $"Estas entregas fueron anuladas en SAP: {string.Join(", ", anuladas)}.", 409);

        /* La regla del negocio: sin factura no sale mercadería. Se comprueba
           aquí y otra vez en el procedimiento, que es por donde pasan todos
           los caminos. */
        var sinFactura = entregas.Where(e => e.SapFacturaNum is null).Select(e => e.SapDocNum).ToList();
        if (sinFactura.Count > 0)
            throw new AppException(
                $"Estas entregas todavía no tienen factura: {string.Join(", ", sinFactura)}.", 409);

        var n = await _repo.AsignarPilotoAsync(req.IdPiloto, entregas, ct);

        _log.LogInformation(
            "{N} entrega(s) de {O} orden(es) asignadas al piloto {Piloto}.",
            n, elegidas.Count, req.IdPiloto);

        return n;
    }

    /// <summary>Días después de la orden en los que se busca su entrega.</summary>
    private const int MargenEntrega = 15;

    public Task<int> LiberarAsync(IdsRequest req, CancellationToken ct = default)
        => _repo.LiberarAsync(Depurar(req.Ids), ct);

    public Task<int> AsignarViajeAsync(AsignarViajeRequest req, CancellationToken ct = default)
        => _repo.AsignarViajeAsync(req.IdViaje, Depurar(req.Ids), ct);

    /* Duplicados y ceros vienen de la selección de la pantalla; el
       procedimiento los rechazaría con un error de motor poco claro. */
    private static IReadOnlyList<int> Depurar(List<int> ids)
    {
        var limpios = ids.Where(i => i > 0).Distinct().ToList();

        if (limpios.Count == 0)
            throw new AppException("No se recibió ninguna boleta válida.");

        const int maxLote = 300;
        if (limpios.Count > maxLote)
            throw new AppException($"No se pueden procesar más de {maxLote} boletas a la vez.");

        return limpios;
    }

    private static string? Limpiar(string? v)
        => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
}
