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
                o.SapDocEntry, o.SapDocNum, o.FechaDocumento, o.HoraDocumento, o.FechaEntrega,
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
    /// Reparte las órdenes seleccionadas entre los pilotos.
    ///
    /// La fila nace de la orden, no de la entrega: los viajes se arman uno o
    /// más días antes del despacho, cuando SAP todavía no generó la boleta ni
    /// la factura. Si ya existen, se guardan de una vez; si no, quedan en
    /// nulo y las completa <see cref="VincularAsync"/> más adelante.
    ///
    /// Lo que se guarda se relee de SAP en este momento, no se toma de la
    /// pantalla: entre que el supervisor abrió la lista y pulsó el botón
    /// pudieron anular la orden o cambiar la dirección.
    /// </summary>
    public async Task<int> AsignarPilotoAsync(
        AsignarPilotoRequest req, CancellationToken ct = default)
    {
        var ordenes = Depurar(req.SapDocEntries);

        /* Aquí sí se piden las líneas: son pocos documentos y son justamente
           los productos que el piloto va a llevar. */
        var elegidas = await _sap.OrdenesConLineasAsync(ordenes, ct);

        if (elegidas.Count == 0)
            throw new AppException(
                "Las órdenes seleccionadas ya no aparecen en SAP. Actualice la lista.", 409);

        var anuladas = elegidas.Where(o => o.Anulada).Select(o => o.SapDocNum).ToList();
        if (anuladas.Count > 0)
            throw new AppException(
                $"Estas órdenes fueron anuladas en SAP: {string.Join(", ", anuladas)}.", 409);

        /* Las entregas que ya existan. Se busca acotando por los clientes de
           las órdenes elegidas; sin ese filtro habría que barrer semanas de
           documentos con todas sus líneas. */
        var porOrden = await EntregasDeAsync(elegidas.Select(
            o => (o.SapDocEntry, o.ClienteCodigo, o.FechaDocumento)).ToList(), ct);

        var boletas = elegidas.Select(o =>
        {
            porOrden.TryGetValue(o.SapDocEntry, out var entrega);

            return new EntregaAAsignar(
                SapOrdenDocEntry: o.SapDocEntry,
                SapOrdenVenta:    o.SapDocNum,
                SapDocEntry:      entrega?.SapDocEntry,
                SapDocNum:        entrega?.SapDocNum,
                SapFacturaNum:    entrega?.SapFacturaNum,
                ClienteCodigo:    o.ClienteCodigo,
                ClienteNombre:    o.ClienteNombre,
                /* Se prefiere el destino de la entrega cuando existe: es el
                   que el piloto va a usar, y puede diferir del de la orden. */
                Direccion:        entrega?.Direccion ?? o.Direccion,
                Municipio:        entrega?.Municipio ?? o.Municipio,
                PesoKg:           entrega?.PesoKg ?? 0m,
                Monto:            o.Monto,
                FechaDocumento:   o.FechaDocumento,
                HoraDocumento:    o.HoraDocumento,
                FechaEntrega:     o.FechaEntrega,
                /* Los productos de la entrega cuando la hay: son los que de
                   verdad salieron. Si no, los de la orden. */
                Lineas:           entrega is not null && entrega.Lineas.Count > 0
                                      ? entrega.Lineas
                                      : o.Lineas);
        }).ToList();

        var n = await _repo.AsignarPilotoAsync(req.IdPiloto, boletas, ct);

        _log.LogInformation(
            "{N} orden(es) asignadas al piloto {Piloto}; {Con} ya tenían boleta en SAP.",
            n, req.IdPiloto, boletas.Count(b => b.SapDocEntry is not null));

        return n;
    }

    /// <summary>
    /// Completa las boletas que se repartieron antes de que SAP generara la
    /// entrega. Es la otra mitad de planificar con anticipación: sin esto,
    /// una boleta planificada nunca sabría su número ni su factura.
    /// </summary>
    public async Task<int> VincularAsync(int dias = 30, CancellationToken ct = default)
    {
        var pendientes = await _repo.PendientesDeBoletaAsync(dias, ct);

        if (pendientes.Count == 0) return 0;

        var porOrden = await EntregasDeAsync(pendientes.Select(
            p => (p.SapOrdenDocEntry, p.ClienteCodigo, p.FechaDocumento)).ToList(), ct);

        var vinculos = pendientes
            .Where(p => porOrden.ContainsKey(p.SapOrdenDocEntry))
            .Select(p =>
            {
                var e = porOrden[p.SapOrdenDocEntry];
                return new VinculoEntrega(
                    p.SapOrdenDocEntry, e.SapDocEntry, e.SapDocNum, e.SapFacturaNum, e.Anulada);
            })
            .ToList();

        if (vinculos.Count == 0)
        {
            _log.LogInformation(
                "Vincular: {N} boleta(s) pendientes y ninguna con entrega todavía en SAP.",
                pendientes.Count);
            return 0;
        }

        var n = await _repo.VincularAsync(vinculos, ct);

        _log.LogInformation(
            "Vincular: {N} de {Pendientes} boleta(s) completadas con su entrega.",
            n, pendientes.Count);

        return n;
    }

    /// <summary>
    /// Busca en SAP las entregas de esas órdenes y las devuelve indizadas por
    /// la orden de la que nacieron. Acota por cliente y por fecha porque es lo
    /// único que hace la consulta soportable: con las líneas incluidas, una
    /// semana entera son cuarenta megas.
    /// </summary>
    private async Task<Dictionary<int, EntregaSap>> EntregasDeAsync(
        IReadOnlyList<(int DocEntry, string Cliente, DateTime Fecha)> ordenes,
        CancellationToken ct)
    {
        if (ordenes.Count == 0) return [];

        var desde = ordenes.Min(o => o.Fecha).Date;
        var hasta = ordenes.Max(o => o.Fecha).Date.AddDays(MargenEntrega);

        var clientes = ordenes.Select(o => o.Cliente).Where(c => !string.IsNullOrWhiteSpace(c))
                              .Distinct().ToList();

        var entregas = await _sap.EntregasDeOrdenesAsync(
            ordenes.Select(o => o.DocEntry).ToList(), clientes, desde, hasta, ct);

        /* Una orden puede tener más de una entrega si la despacharon en
           partes. Se queda la primera; el resto se verá al abrir el detalle
           en SAP, que es donde esa distinción importa. */
        return entregas
            .Where(e => e.SapOrdenVentaDocEntry is not null)
            .GroupBy(e => e.SapOrdenVentaDocEntry!.Value)
            .ToDictionary(g => g.Key, g => g.OrderBy(e => e.SapDocNum).First());
    }

    /// <summary>Días después de la orden en los que se busca su entrega.</summary>
    private const int MargenEntrega = 15;

    /// <summary>
    /// Cambia de piloto boletas que ya están repartidas. Es lo que ocurre a
    /// diario: alguien se enferma o la ruta se reacomoda, y la boleta no
    /// tiene por qué volver a SAP para eso.
    /// </summary>
    public Task<int> CambiarPilotoAsync(CambiarPilotoRequest req, CancellationToken ct = default)
        => _repo.CambiarPilotoAsync(req.IdPiloto, Depurar(req.Ids), ct);

    /// <summary>Saca boletas del viaje; siguen siendo del mismo piloto.</summary>
    public Task<int> SacarDeViajeAsync(IdsRequest req, CancellationToken ct = default)
        => _repo.SacarDeViajeAsync(Depurar(req.Ids), ct);

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
