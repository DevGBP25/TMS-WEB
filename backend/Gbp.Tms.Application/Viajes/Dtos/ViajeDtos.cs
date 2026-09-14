using System.ComponentModel.DataAnnotations;
using Gbp.Tms.Application.Entregas.Dtos;

namespace Gbp.Tms.Application.Viajes.Dtos;

/// <summary>Estados de un viaje. Coinciden con el CHECK de la tabla.</summary>
public static class EstadoViaje
{
    /// <summary>Creado, todavía sin camión ni piloto.</summary>
    public const string Planificado = "PLANIFICADO";

    /// <summary>Ya tiene camión y piloto; puede seguir cambiando su carga.</summary>
    public const string Asignado    = "ASIGNADO";

    public const string EnRuta      = "EN_RUTA";
    public const string Entregado   = "ENTREGADO";
    public const string Liquidado   = "LIQUIDADO";
    public const string Cancelado   = "CANCELADO";

    public static readonly string[] Todos =
        [Planificado, Asignado, EnRuta, Entregado, Liquidado, Cancelado];

    /// <summary>Estados en los que todavía se puede modificar la carga del viaje.</summary>
    public static readonly string[] Editables = [Planificado, Asignado];
}

public record ViajeListaDto(
    int       IdViaje,
    string    Numero,
    DateTime  Fecha,
    string    Estado,
    decimal   PesoKg,
    int       TotalEntregas,
    int       EntregasCompletadas,
    DateTime? SalidaReal,
    DateTime? RetornoReal,
    string?   Observaciones,
    DateTime  FechaCreacion,
    int?      IdUnidad,
    string?   UnidadCodigo,
    string?   UnidadPlaca,
    int?      IdPiloto,
    string?   PilotoNombre);

/// <summary>Encabezado del viaje, sin sus entregas.</summary>
public record ViajeCabeceraDto(
    int       IdViaje,
    string    Numero,
    DateTime  Fecha,
    string    Estado,
    decimal   PesoKg,
    int       TotalEntregas,
    int       EntregasCompletadas,
    DateTime? SalidaProgramada,
    DateTime? SalidaReal,
    DateTime? RetornoReal,
    string?   Observaciones,
    DateTime  FechaCreacion,
    int?      IdUnidad,
    string?   UnidadCodigo,
    string?   UnidadPlaca,
    decimal?  UnidadCapacidadKg,
    int?      IdPiloto,
    string?   PilotoNombre,
    string?   PilotoTelefono);

/// <summary>Entrega tal como se ve dentro del detalle de un viaje.</summary>
public record ViajeEntregaDto(
    int       IdEntrega,
    int       SapDocNum,
    int?      SapOrdenVenta,
    int?      SapFacturaNum,
    string    ClienteCodigo,
    string    ClienteNombre,
    string?   Direccion,
    string?   Municipio,
    decimal   PesoKg,
    decimal   Monto,
    DateTime  FechaDocumento,
    string    Estado,
    int?      Secuencia,
    string?   Receptor,
    string?   MotivoRechazo,
    DateTime? EntregadaEn);

public record ViajeDetalleDto(
    ViajeCabeceraDto Viaje,
    IReadOnlyList<ViajeEntregaDto> Entregas);

/// <summary>Piloto disponible para asignar, con el viaje que ya tenga ese día.</summary>
public record PilotoDto(
    int     IdUsuario,
    string  Usuario,
    string  Nombre,
    string? Telefono,
    // Número del viaje que ya trae ese día, si lo hay.
    string? ViajeDelDia);

public class CrearViajeRequest
{
    [Required(ErrorMessage = "La fecha del viaje es obligatoria.")]
    public DateTime Fecha { get; set; }

    public int? IdUnidad { get; set; }
    public int? IdPiloto { get; set; }

    [StringLength(500)]
    public string? Observaciones { get; set; }

    /// <summary>
    /// Entregas con las que nace el viaje. Es opcional: el supervisor puede
    /// crear el viaje vacío y cargarlo después desde la tabla de entregas.
    /// </summary>
    public List<int> Entregas { get; set; } = [];
}

public class AsignarRecursosRequest
{
    [Range(1, int.MaxValue, ErrorMessage = "Seleccione la unidad.")]
    public int IdUnidad { get; set; }

    [Range(1, int.MaxValue, ErrorMessage = "Seleccione el piloto.")]
    public int IdPiloto { get; set; }
}

public class CambiarEstadoViajeRequest
{
    [Required(ErrorMessage = "Indique el nuevo estado.")]
    public string Estado { get; set; } = string.Empty;

    [StringLength(500)]
    public string? Observaciones { get; set; }
}

/// <summary>Filtros del listado de viajes.</summary>
public class ViajeFiltro
{
    public string?   Buscar { get; set; }
    public string?   Estado { get; set; }
    public DateTime? Desde  { get; set; }
    public DateTime? Hasta  { get; set; }
}
