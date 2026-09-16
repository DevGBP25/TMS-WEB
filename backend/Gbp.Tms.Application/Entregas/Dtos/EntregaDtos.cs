using System.ComponentModel.DataAnnotations;

namespace Gbp.Tms.Application.Entregas.Dtos;

/// <summary>
/// Estados de una boleta dentro del TMS. Coinciden con el CHECK de la tabla.
///
/// No hay "pendiente" ni "sin factura": esas boletas no se guardan, se leen
/// de SAP. Una fila en la tabla es, por definición, una boleta con dueño.
/// </summary>
public static class EstadoEntrega
{
    /// <summary>Tiene piloto y todavía no sale.</summary>
    public const string Asignada  = "ASIGNADA";

    public const string EnRuta    = "EN_RUTA";
    public const string Entregada = "ENTREGADA";
    public const string Rechazada = "RECHAZADA";

    /// <summary>SAP canceló el documento después de haberla asignado.</summary>
    public const string Anulada   = "ANULADA";

    public static readonly string[] Todos = [Asignada, EnRuta, Entregada, Rechazada, Anulada];
}

/// <summary>Un producto de la boleta.</summary>
public record ProductoDto(
    int      LineaNum,
    string   CodigoArticulo,
    string?  CodigoBarras,
    string   Descripcion,
    decimal  Cantidad,
    string?  Unidad,
    string?  Almacen);

/// <summary>
/// Orden de venta de SAP todavía sin repartir. No existe en la base: se lee
/// del Service Layer cada vez que se abre la pantalla.
///
/// Se lista por orden y no por entrega porque la orden se puede leer sin sus
/// líneas, y eso es la diferencia entre dos segundos y veinte.
/// </summary>
public record OrdenDisponibleDto(
    int       SapDocEntry,
    int       SapDocNum,
    DateTime  FechaDocumento,
    TimeSpan? HoraDocumento,
    DateTime? FechaEntrega,
    string    ClienteCodigo,
    string    ClienteNombre,
    string?   Direccion,
    string?   Municipio,
    string?   Comentarios,
    /// <summary>
    /// SAP ya copió la orden a su entrega. Ya no condiciona el reparto —los
    /// viajes se arman días antes— pero dice en qué punto va el documento.
    /// </summary>
    bool      TieneEntrega);

/// <summary>Fila del listado de boletas que el TMS ya administra.</summary>
public record EntregaListaDto(
    int       IdEntrega,
    // Nulos mientras SAP no haya generado la entrega de esa orden.
    int?      SapDocEntry,
    int?      SapDocNum,
    int?      SapOrdenDocEntry,
    int?      SapOrdenVenta,
    int?      SapFacturaNum,
    string    ClienteCodigo,
    string    ClienteNombre,
    string?   Direccion,
    string?   Municipio,
    decimal   PesoKg,
    DateTime  FechaDocumento,
    TimeSpan? HoraDocumento,
    DateTime? FechaEntrega,
    string    Estado,
    int?      IdViaje,
    int?      Secuencia,
    int       IdUsuarioPiloto,
    DateTime? AsignadaEn,
    string?   Receptor,
    string?   MotivoRechazo,
    DateTime? EntregadaEn,
    string    PilotoNombre,
    string?   ViajeNumero,
    DateTime? ViajeFecha,
    string?   UnidadCodigo,
    int       Articulos);

/// <summary>Una boleta con todo lo que hay que saber de ella, productos incluidos.</summary>
public record EntregaDetalleDto(
    int       IdEntrega,
    int?      SapDocEntry,
    int?      SapDocNum,
    int?      SapOrdenDocEntry,
    int?      SapOrdenVenta,
    int?      SapFacturaNum,
    string    ClienteCodigo,
    string    ClienteNombre,
    string?   Direccion,
    string?   Municipio,
    decimal   PesoKg,
    DateTime  FechaDocumento,
    TimeSpan? HoraDocumento,
    DateTime? FechaEntrega,
    string    Estado,
    int?      IdViaje,
    int?      Secuencia,
    int       IdUsuarioPiloto,
    DateTime? AsignadaEn,
    string?   Receptor,
    string?   MotivoRechazo,
    DateTime? EntregadaEn,
    string?   Observaciones,
    DateTime  FechaCreacion,
    string    PilotoNombre,
    string?   PilotoUsuario,
    string?   PilotoTelefono,
    string?   ViajeNumero,
    DateTime? ViajeFecha,
    string?   ViajeEstado,
    string?   UnidadCodigo,
    string?   UnidadPlaca,
    IReadOnlyList<ProductoDto> Productos);

/// <summary>Contadores de lo que el TMS administra.</summary>
public record ResumenEntregasDto(
    int Asignadas,
    int EnRuta,
    int Entregadas,
    int Rechazadas,
    int Anuladas,
    // Asignadas que todavía no están en ningún viaje.
    int SinViaje);

/// <summary>Filtros del listado de boletas asignadas.</summary>
public class EntregaFiltro
{
    public string?   Buscar    { get; set; }
    public string?   Estado    { get; set; }
    public string?   Municipio { get; set; }
    public DateTime? Desde     { get; set; }
    public DateTime? Hasta     { get; set; }
    public int?      IdViaje   { get; set; }
    public int?      IdPiloto  { get; set; }
    public bool      SinViaje  { get; set; }
    public int       Pagina    { get; set; } = 1;
    public int       PorPagina { get; set; } = 50;
}

public class AsignarPilotoRequest
{
    [Range(1, int.MaxValue, ErrorMessage = "Seleccione el piloto.")]
    public int IdPiloto { get; set; }

    /// <summary>
    /// Órdenes de venta a repartir, por DocEntry. El servidor resuelve la
    /// entrega de cada una contra SAP antes de guardar nada: lo que se
    /// almacena no es lo que el navegador tenía en pantalla.
    /// </summary>
    [MinLength(1, ErrorMessage = "Seleccione al menos una orden.")]
    public List<int> SapDocEntries { get; set; } = [];
}

public class IdsRequest
{
    [MinLength(1, ErrorMessage = "Seleccione al menos una boleta.")]
    public List<int> Ids { get; set; } = [];
}

/// <summary>Boletas que pasan a otro piloto, por id de entrega.</summary>
public class CambiarPilotoRequest : IdsRequest
{
    [Range(1, int.MaxValue, ErrorMessage = "Seleccione el piloto.")]
    public int IdPiloto { get; set; }
}

public class AsignarViajeRequest : IdsRequest
{
    [Range(1, int.MaxValue, ErrorMessage = "Indique el viaje.")]
    public int IdViaje { get; set; }
}
