using System.Net.Http.Json;
using System.Text.Json;
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

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public SapServiceLayerClient(HttpClient http, IOptions<SapOptions> opt, ILogger<SapServiceLayerClient> log)
    {
        _http = http;
        _opt  = opt.Value;
        _log  = log;
    }

    public async Task<IReadOnlyList<SapEntrega>> EntregasPendientesAsync(DateTime fecha, CancellationToken ct = default)
    {
        // Entregas abiertas de la fecha; se excluyen las ya canceladas.
        var filtro =
            $"DocDate eq '{fecha:yyyy-MM-dd}' and DocumentStatus eq 'bost_Open' and Cancelled eq 'tNO'";

        var recurso =
            "DeliveryNotes?$select=DocEntry,DocNum,DocDate,CardCode,CardName,Address,DocTotal" +
            $"&$filter={Uri.EscapeDataString(filtro)}&$orderby=DocNum";

        var raw  = await GetRawAsync(recurso, ct);
        var page = JsonSerializer.Deserialize<SapCollection<SapDeliveryNote>>(raw, Json);

        return page?.Value.Select(Map).ToList() ?? new List<SapEntrega>();
    }

    public async Task<SapEntrega?> ObtenerEntregaAsync(int docEntry, CancellationToken ct = default)
    {
        var recurso =
            $"DeliveryNotes({docEntry})?$select=DocEntry,DocNum,DocDate,CardCode,CardName,Address,DocTotal";

        try
        {
            var raw = await GetRawAsync(recurso, ct);
            var dn  = JsonSerializer.Deserialize<SapDeliveryNote>(raw, Json);
            return dn is null ? null : Map(dn);
        }
        catch (HttpRequestException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
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

        return await _http.SendAsync(req, ct);
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
            }, ct);

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

    private static SapEntrega Map(SapDeliveryNote d) => new(
        d.DocEntry,
        d.DocNum,
        d.DocDate,
        d.CardCode ?? string.Empty,
        d.CardName ?? string.Empty,
        d.Address,
        d.DocTotal,
        0m);   // El peso se calcula desde las líneas; pendiente de definir con logística.

    // ---- contratos de deserialización del Service Layer ----

    private class SapLoginResponse
    {
        public string? SessionId { get; set; }
    }

    private class SapCollection<T>
    {
        public List<T> Value { get; set; } = new();
    }

    private class SapDeliveryNote
    {
        public int      DocEntry { get; set; }
        public int      DocNum   { get; set; }
        public DateTime DocDate  { get; set; }
        public string?  CardCode { get; set; }
        public string?  CardName { get; set; }
        public string?  Address  { get; set; }
        public decimal  DocTotal { get; set; }
    }
}
