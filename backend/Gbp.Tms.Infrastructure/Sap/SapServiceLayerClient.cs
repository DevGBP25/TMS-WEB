using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Gbp.Tms.Application.Abstractions;
using Gbp.Tms.Infrastructure.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Gbp.Tms.Infrastructure.Sap;

/// <summary>
/// Cliente del SAP B1 Service Layer. Mantiene una sesión (B1SESSION) compartida
/// y la renueva sola: al vencer el plazo configurado o cuando SAP responde 401.
/// </summary>
public class SapServiceLayerClient : ISapServiceLayerClient
{
    private readonly HttpClient                     _http;
    private readonly SapOptions                     _opt;
    private readonly ILogger<SapServiceLayerClient> _log;

    // Una sola sesión por proceso; el semáforo evita logins simultáneos.
    private static readonly SemaphoreSlim _loginLock = new(1, 1);
    private static string?  _sessionId;
    private static DateTime _sessionExpira = DateTime.MinValue;

    // Para leer: Web trae PropertyNameCaseInsensitive, que es lo que queremos.
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /* Para escribir es al revés. El Service Layer distingue mayúsculas en el
       cuerpo del login: si recibe companyDB/userName no los reconoce y
       responde 400 con el código 206 "Invalid login credential", idéntico a
       cuando la contraseña está mal. PostAsJsonAsync aplica camelCase por
       omisión, así que hay que desactivar esa política a mano. */
    private static readonly JsonSerializerOptions JsonEnvio =
        new(JsonSerializerDefaults.Web) { PropertyNamingPolicy = null };

    public SapServiceLayerClient(HttpClient http, IOptions<SapOptions> opt, ILogger<SapServiceLayerClient> log)
    {
        _http = http;
        _opt  = opt.Value;
        _log  = log;

        /* Sin BaseAddress, el primer login falla al armar la petición y el
           error que sale es "invalid request URI", que no le dice a nadie que
           lo que falta es un ajuste. Pasa cada vez que la sección Sap no llega
           a la aplicación: el archivo del entorno equivocado, o —lo más
           común— el archivo correcto editado sin reiniciar el sitio, porque
           la configuración se lee una sola vez al arrancar. */
        if (_http.BaseAddress is null)
            throw new InvalidOperationException(
                "Falta 'Sap:Url' en la configuración: no hay a dónde conectarse. " +
                "Revise appsettings del entorno activo y reinicie la aplicación, " +
                "porque el cambio no surte efecto hasta reiniciarla.");
    }

    /* Códigos de objeto de SAP. Van como constantes porque leer "17" suelto
       en medio de un filtro no le dice nada a nadie. */
    private const int ObjOrdenVenta = 17;   // ORDR
    private const int ObjFactura    = 13;   // OINV
    private const int ObjEntrega    = 15;   // ODLN

    public async Task<IReadOnlyList<OrdenSap>> OrdenesDeRangoAsync(
        DateTime desde, DateTime hasta, CancellationToken ct = default)
    {
        /* Sin DocumentLines, y ahí está toda la diferencia: con líneas esta
           misma consulta son 37 MB y 19 segundos; sin ellas, 1.6 MB y 2.6.
           El Service Layer no deja pedir sólo algunos campos de la línea, así
           que la única forma de que el listado sea usable es no pedirlas. */
        var filtro = $"DocDate ge '{desde:yyyy-MM-dd}' and DocDate le '{hasta:yyyy-MM-dd}' " +
                     "and Cancelled eq 'tNO'";

        var recurso = ConsultaOrden + $"&$filter={Uri.EscapeDataString(filtro)}&$orderby=DocNum desc";

        var docs = await LeerTodoAsync<SapOrder>(recurso, ct);

        _log.LogInformation(
            "Órdenes de venta {Desde:d}–{Hasta:d}: {N} leídas de SAP.", desde, hasta, docs.Count);

        return docs.Select(OrdenDe).ToList();
    }

    public async Task<IReadOnlyList<OrdenSap>> OrdenesConLineasAsync(
        IReadOnlyList<int> docEntries, CancellationToken ct = default)
    {
        var buscadas = docEntries.Where(d => d > 0).Distinct().ToList();
        if (buscadas.Count == 0) return [];

        var todo = new List<SapOrder>();

        /* En tandas porque el filtro va en la URL y el Service Layer corta
           las largas. Veinticinco documentos por consulta es lo que aguanta
           con holgura. */
        const int tanda = 25;

        for (var i = 0; i < buscadas.Count; i += tanda)
        {
            var filtro = string.Join(" or ", buscadas.Skip(i).Take(tanda).Select(d => $"DocEntry eq {d}"));

            todo.AddRange(await LeerTodoAsync<SapOrder>(
                ConsultaOrdenConLineas + $"&$filter={Uri.EscapeDataString(filtro)}", ct));
        }

        _log.LogInformation("Órdenes con productos: {N} de {Pedidas} pedidas.", todo.Count, buscadas.Count);

        return todo.Select(OrdenDe).ToList();
    }

    private static OrdenSap OrdenDe(SapOrder o) => new(
        SapDocEntry:    o.DocEntry,
        SapDocNum:      o.DocNum,
        FechaDocumento: o.DocDate,
        HoraDocumento:  HoraDe(o.DocTime),
        FechaEntrega:   o.DocDueDate,
        ClienteCodigo:  o.CardCode ?? string.Empty,
        ClienteNombre:  o.CardName ?? string.Empty,
        Direccion:      o.Address,
        Municipio:      o.AddressExtension?.ShipToCity,
        Monto:          o.DocTotal,
        Comentarios:    string.IsNullOrWhiteSpace(o.Comments) ? null : o.Comments.Trim(),
        /* bost_Close significa que la orden ya se copió por completo a su
           documento destino. En esta operación ese destino es la entrega,
           así que es lo más cercano a "ya tiene entrega" que se puede
           saber sin bajar las líneas de todas las entregas del rango. */
        Cerrada:        string.Equals(o.DocumentStatus, "bost_Close", StringComparison.OrdinalIgnoreCase),
        Anulada:        string.Equals(o.Cancelled, "tYES", StringComparison.OrdinalIgnoreCase),
        Lineas:         o.DocumentLines.Select(ProductoDe).ToList());

    /// <summary>
    /// La hora del documento. Llega como "11:12:00", pero hay instalaciones
    /// que la mandan como número (1112): si no se entiende, se prefiere no
    /// mostrar hora antes que mostrar una inventada.
    /// </summary>
    private static TimeSpan? HoraDe(string? doctime)
    {
        if (string.IsNullOrWhiteSpace(doctime)) return null;

        if (TimeSpan.TryParse(doctime, CultureInfo.InvariantCulture, out var h)) return h;

        if (int.TryParse(doctime, out var n) && n is >= 0 and <= 2359)
            return new TimeSpan(n / 100, n % 100, 0);

        return null;
    }

    public async Task<IReadOnlyList<EntregaSap>> EntregasDeOrdenesAsync(
        IReadOnlyList<int> ordenDocEntries, IReadOnlyList<string> clientes,
        DateTime desde, DateTime hasta, CancellationToken ct = default)
    {
        if (ordenDocEntries.Count == 0) return [];

        /* El enlace orden → entrega sólo existe en las líneas de la entrega y
           no se puede filtrar por un campo de una colección. Pero sí se puede
           filtrar por cliente, y eso lo cambia todo: en vez de bajar las
           entregas de toda una semana —decenas de MB— se bajan las de los
           pocos clientes de las órdenes elegidas. */
        var docs = await PorClienteAsync<SapDeliveryNote>(Consulta, clientes, desde, hasta, ct);

        var buscadas = ordenDocEntries.ToHashSet();

        var suyas = docs.Where(d => OrdenVentaDe(d) is int oe && buscadas.Contains(oe)).ToList();

        if (suyas.Count == 0) return [];

        var min = suyas.Min(d => d.DocDate).Date;
        var max = suyas.Max(d => d.DocDate).Date.AddDays(MargenFactura);

        var facturas = await FacturasPorEntregaAsync(clientes, min, max, ct);

        return await ArmarAsync(suyas, facturas, ct);
    }

    /// <summary>
    /// Lee documentos de un conjunto de clientes en un rango. Se parte en
    /// tandas porque el Service Layer corta las URL largas.
    /// </summary>
    private async Task<List<T>> PorClienteAsync<T>(
        string consulta, IReadOnlyList<string> clientes,
        DateTime desde, DateTime hasta, CancellationToken ct)
    {
        var todo = new List<T>();
        const int tanda = 25;

        var unicos = clientes.Where(c => !string.IsNullOrWhiteSpace(c)).Distinct().ToList();
        if (unicos.Count == 0) return todo;

        for (var i = 0; i < unicos.Count; i += tanda)
        {
            var enTanda = unicos.Skip(i).Take(tanda)
                .Select(c => $"CardCode eq '{c.Replace("'", "''")}'");

            var filtro = $"DocDate ge '{desde:yyyy-MM-dd}' and DocDate le '{hasta:yyyy-MM-dd}' " +
                         $"and Cancelled eq 'tNO' and ({string.Join(" or ", enTanda)})";

            todo.AddRange(await LeerTodoAsync<T>(
                consulta + $"&$filter={Uri.EscapeDataString(filtro)}", ct));
        }

        return todo;
    }

    /// <summary>Días después de la entrega en los que se busca su factura.</summary>
    private const int MargenFactura = 15;

    /* La orden se pide sin líneas: es lo que mantiene el listado en segundos. */
    private const string ConsultaOrden =
        "Orders?$select=DocEntry,DocNum,DocDate,DocTime,DocDueDate,CardCode,CardName,Address," +
        "DocTotal,Cancelled,DocumentStatus,Comments,AddressExtension";

    /* La misma consulta con las líneas. Sólo se usa para las órdenes que ya
       se eligieron: pedir DocumentLines para un rango entero cuesta veinte
       segundos, pedirlo para diez documentos no se nota. */
    private const string ConsultaOrdenConLineas = ConsultaOrden + ",DocumentLines";

    /* La entrega sí las trae: son los productos que va a llevar el piloto. */
    private const string Consulta =
        "DeliveryNotes?$select=DocEntry,DocNum,DocDate,CardCode,CardName,Address," +
        "DocTotal,Cancelled,DocumentStatus,Comments,AddressExtension,DocumentLines";

    /// <summary>Convierte lo leído de SAP en el modelo del TMS.</summary>
    private async Task<List<EntregaSap>> ArmarAsync(
        List<SapDeliveryNote> docs, IReadOnlyDictionary<int, int> facturas, CancellationToken ct)
    {
        /* La orden de venta sí cuelga de la entrega: sus líneas traen
           BaseType 17 con el DocEntry del pedido. Falta convertirlo al número
           visible, y eso se resuelve por lotes en vez de un viaje por
           documento. */
        var ordenes  = docs.Select(OrdenVentaDe).OfType<int>().Distinct().ToList();
        var numOrden = await NumerosAsync("Orders", ordenes, ct);

        return docs.Select(d =>
        {
            var ordenEntry = OrdenVentaDe(d);

            return new EntregaSap(
                SapDocEntry:     d.DocEntry,
                SapDocNum:       d.DocNum,
                SapOrdenVenta:   ordenEntry is int oe && numOrden.TryGetValue(oe, out var on) ? on : null,
                SapOrdenVentaDocEntry: ordenEntry,
                /* Nulo en el listado —no se buscó— y con valor al asignar.
                   Facturada dice lo otro: que SAP ya la cerró contra una factura. */
                SapFacturaNum:   facturas.TryGetValue(d.DocEntry, out var fn) ? fn : null,
                Facturada:       string.Equals(d.DocumentStatus, "bost_Close", StringComparison.OrdinalIgnoreCase),
                ClienteCodigo:   d.CardCode ?? string.Empty,
                ClienteNombre:   d.CardName ?? string.Empty,
                Direccion:       d.Address,
                Municipio:       d.AddressExtension?.ShipToCity,
                /* El peso no está en SAP: ni la cabecera lo trae ni las líneas
                   (Weight1 llega en cero). Queda pendiente de mapearlo desde
                   la ficha del artículo si logística lo necesita. */
                PesoKg:          0m,
                Monto:           d.DocTotal,
                Comentarios:     string.IsNullOrWhiteSpace(d.Comments) ? null : d.Comments.Trim(),
                FechaDocumento:  d.DocDate,
                Anulada:         string.Equals(d.Cancelled, "tYES", StringComparison.OrdinalIgnoreCase),
                Lineas:          d.DocumentLines.Select(ProductoDe).ToList());
        }).ToList();
    }

    /// <summary>
    /// Producto de una línea. SAP entrega la descripción con el código de
    /// barras al frente, separado por "|": se parten para no guardar un
    /// texto que nadie quiere leer en pantalla ni perder el código.
    /// </summary>
    private static LineaSap ProductoDe(SapDocumentLine l)
    {
        var texto  = l.ItemDescription ?? string.Empty;
        var barras = (string?)null;

        var corte = texto.IndexOf('|');
        if (corte >= 0)
        {
            var prefijo = texto[..corte].Trim();
            barras = prefijo.Length > 0 ? prefijo : null;
            texto  = texto[(corte + 1)..].Trim();
        }

        return new LineaSap(
            LineaNum:       l.LineNum ?? 0,
            CodigoArticulo: l.ItemCode ?? string.Empty,
            CodigoBarras:   barras,
            Descripcion:    texto,
            Cantidad:       l.Quantity ?? 0m,
            Unidad:         l.MeasureUnit ?? l.UoMCode,
            Almacen:        l.WarehouseCode);
    }

    /// <summary>
    /// DocEntry de la orden de venta que originó la entrega. Se toma de la
    /// primera línea que la declare: un mismo documento no se arma con
    /// pedidos de clientes distintos.
    /// </summary>
    private static int? OrdenVentaDe(SapDeliveryNote d)
    {
        foreach (var l in d.DocumentLines)
            if (l.BaseType == ObjOrdenVenta && l.BaseEntry is int be) return be;

        return null;
    }

    /// <summary>
    /// Entrega (DocEntry) → número de su factura.
    ///
    /// El enlace sólo existe en un sentido: las líneas de la entrega no
    /// publican su documento destino, pero las de la factura sí traen
    /// BaseType 15 con el DocEntry de la entrega. Así que se leen las
    /// facturas del rango y se invierte la relación.
    /// </summary>
    private async Task<Dictionary<int, int>> FacturasPorEntregaAsync(
        IReadOnlyList<string> clientes, DateTime desde, DateTime hasta, CancellationToken ct)
    {
        var facturas = await PorClienteAsync<SapInvoice>(
            "Invoices?$select=DocEntry,DocNum,CardCode,Cancelled,DocumentLines",
            clientes, desde, hasta, ct);
        var mapa = new Dictionary<int, int>();

        foreach (var f in facturas)
            foreach (var l in f.DocumentLines)
                if (l.BaseType == ObjEntrega && l.BaseEntry is int be)
                    mapa[be] = f.DocNum;   // varias líneas de la misma entrega dan el mismo número

        return mapa;
    }

    /// <summary>DocEntry → DocNum para un conjunto de documentos, en lotes.</summary>
    private async Task<Dictionary<int, int>> NumerosAsync(
        string recurso, IReadOnlyList<int> docEntries, CancellationToken ct)
    {
        var mapa = new Dictionary<int, int>();
        if (docEntries.Count == 0) return mapa;

        // El Service Layer corta las URL largas; se parte en tandas.
        const int tanda = 40;

        for (var i = 0; i < docEntries.Count; i += tanda)
        {
            var filtro = string.Join(" or ", docEntries.Skip(i).Take(tanda).Select(e => $"DocEntry eq {e}"));
            var url    = $"{recurso}?$select=DocEntry,DocNum&$filter={Uri.EscapeDataString(filtro)}";

            foreach (var d in await LeerTodoAsync<SapDocRef>(url, ct))
                mapa[d.DocEntry] = d.DocNum;
        }

        return mapa;
    }

    public async Task<string> GetRawAsync(string recurso, CancellationToken ct = default)
    {
        var resp = await EnviarAsync(recurso, ct);

        // La sesión pudo haber caducado del lado de SAP antes del plazo local.
        if (resp.StatusCode == System.Net.HttpStatusCode.Unauthorized)
        {
            resp.Dispose();
            InvalidarSesion();
            resp = await EnviarAsync(recurso, ct);
        }

        using (resp)
        {
            var cuerpo = await resp.Content.ReadAsStringAsync(ct);

            if (!resp.IsSuccessStatusCode)
            {
                _log.LogError("Service Layer {Status} en {Recurso}: {Cuerpo}",
                    (int)resp.StatusCode, recurso, cuerpo);

                throw new HttpRequestException(
                    $"SAP Service Layer respondió {(int)resp.StatusCode} en {recurso}.",
                    null, resp.StatusCode);
            }

            return cuerpo;
        }
    }

    private async Task<HttpResponseMessage> EnviarAsync(string recurso, CancellationToken ct)
    {
        var sesion = await ObtenerSesionAsync(ct);

        var req = new HttpRequestMessage(HttpMethod.Get, recurso);
        req.Headers.Add("Cookie", $"B1SESSION={sesion}");

        /* El Service Layer pagina de 20 en 20 por omisión. Sin esta cabecera
           una consulta de una semana devuelve 20 documentos y parece completa:
           no hay error, sólo faltan datos. Se pide la página más grande que
           acepta y aun así se sigue el enlace de continuación. */
        req.Headers.Add("Prefer", $"odata.maxpagesize={TamanoPagina}");

        return await _http.SendAsync(req, ct);
    }

    private const int TamanoPagina = 500;

    /* Tope de páginas por consulta. Es una red de seguridad contra un filtro
       mal armado que acabe recorriendo años de historia. */
    private const int MaxPaginas = 60;

    /// <summary>
    /// Recorre una consulta completa siguiendo <c>odata.nextLink</c> y
    /// devuelve todas las filas, no sólo la primera página.
    /// </summary>
    private async Task<List<T>> LeerTodoAsync<T>(string recurso, CancellationToken ct)
    {
        var todo = new List<T>();
        var siguiente = recurso;

        for (var pagina = 0; siguiente is not null && pagina < MaxPaginas; pagina++)
        {
            var raw  = await GetRawAsync(siguiente, ct);
            var page = JsonSerializer.Deserialize<SapCollection<T>>(raw, Json);

            if (page is null) break;

            todo.AddRange(page.Value);
            siguiente = page.NextLink;
        }

        if (siguiente is not null)
            _log.LogWarning(
                "La consulta {Recurso} superó las {Max} páginas; el resultado quedó incompleto.",
                recurso, MaxPaginas);

        return todo;
    }

    private async Task<string> ObtenerSesionAsync(CancellationToken ct)
    {
        if (_sessionId is not null && DateTime.UtcNow < _sessionExpira)
            return _sessionId;

        await _loginLock.WaitAsync(ct);
        try
        {
            // Otro hilo pudo renovarla mientras esperábamos el semáforo.
            if (_sessionId is not null && DateTime.UtcNow < _sessionExpira)
                return _sessionId;

            var resp = await _http.PostAsJsonAsync("Login", new
            {
                CompanyDB = _opt.Company,
                UserName  = _opt.User,
                Password  = _opt.Password
            }, JsonEnvio, ct);

            var cuerpo = await resp.Content.ReadAsStringAsync(ct);

            if (!resp.IsSuccessStatusCode)
                throw new HttpRequestException(
                    $"Login al Service Layer falló ({(int)resp.StatusCode}): {cuerpo}", null, resp.StatusCode);

            var login = JsonSerializer.Deserialize<SapLoginResponse>(cuerpo, Json);

            if (string.IsNullOrEmpty(login?.SessionId))
                throw new InvalidOperationException("El Service Layer no devolvió SessionId.");

            _sessionId     = login.SessionId;
            _sessionExpira = DateTime.UtcNow.AddMinutes(_opt.SesionMin);

            _log.LogInformation("Sesión SAP abierta contra {Company}, vigente hasta {Expira:HH:mm} UTC.",
                _opt.Company, _sessionExpira);

            return _sessionId;
        }
        finally
        {
            _loginLock.Release();
        }
    }

    private static void InvalidarSesion()
    {
        _sessionId     = null;
        _sessionExpira = DateTime.MinValue;
    }

    // ---- contratos de deserialización del Service Layer ----

    private class SapLoginResponse
    {
        public string? SessionId { get; set; }
    }

    private class SapCollection<T>
    {
        public List<T> Value { get; set; } = new();

        /// <summary>Ruta de la página siguiente; nula en la última.</summary>
        [JsonPropertyName("odata.nextLink")]
        public string? NextLink { get; set; }
    }

    private class SapDeliveryNote
    {
        public int      DocEntry  { get; set; }
        public int      DocNum    { get; set; }
        public DateTime DocDate   { get; set; }
        public string?  CardCode  { get; set; }
        public string?  CardName  { get; set; }
        public string?  Address   { get; set; }
        public decimal  DocTotal  { get; set; }
        /// <summary>'tYES' cuando el documento fue anulado en SAP.</summary>
        public string?  Cancelled { get; set; }
        public string?  Comments  { get; set; }
        /// <summary>bost_Close cuando la entrega ya se copió a una factura.</summary>
        public string?  DocumentStatus { get; set; }

        public SapAddressExtension? AddressExtension { get; set; }
        public List<SapDocumentLine> DocumentLines   { get; set; } = new();
    }

    private class SapOrder
    {
        public int       DocEntry      { get; set; }
        public int       DocNum        { get; set; }
        public DateTime  DocDate       { get; set; }
        /// <summary>Hora del documento, como "11:12:00".</summary>
        public string?   DocTime       { get; set; }
        /// <summary>Fecha de entrega comprometida.</summary>
        public DateTime? DocDueDate    { get; set; }
        public string?  CardCode       { get; set; }
        public string?  CardName       { get; set; }
        public string?  Address        { get; set; }
        public decimal  DocTotal       { get; set; }
        public string?  Cancelled      { get; set; }
        /// <summary>bost_Close cuando la orden ya se copió a su documento destino.</summary>
        public string?  DocumentStatus { get; set; }
        public string?  Comments       { get; set; }

        public SapAddressExtension? AddressExtension { get; set; }

        /// <summary>Sólo llega cuando se piden a propósito.</summary>
        public List<SapDocumentLine> DocumentLines { get; set; } = [];
    }

    private class SapAddressExtension
    {
        public string? ShipToCity { get; set; }
    }

    private class SapDocumentLine
    {
        /// <summary>Tipo del documento del que se copió la línea: 17 orden, 15 entrega.</summary>
        public int?     BaseType        { get; set; }
        public int?     BaseEntry       { get; set; }
        public int?     LineNum         { get; set; }
        public string?  ItemCode        { get; set; }
        public string?  ItemDescription { get; set; }
        public decimal? Quantity        { get; set; }
        public string?  MeasureUnit     { get; set; }
        public string?  UoMCode         { get; set; }
        public string?  WarehouseCode   { get; set; }
    }

    private class SapInvoice
    {
        public int     DocEntry  { get; set; }
        public int     DocNum    { get; set; }
        public string? CardCode  { get; set; }
        public string? Cancelled { get; set; }
        public List<SapDocumentLine> DocumentLines { get; set; } = new();
    }

    private class SapDocRef
    {
        public int DocEntry { get; set; }
        public int DocNum   { get; set; }
    }
}
