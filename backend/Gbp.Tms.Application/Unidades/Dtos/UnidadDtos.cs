using System.ComponentModel.DataAnnotations;

namespace Gbp.Tms.Application.Unidades.Dtos;

/// <summary>
/// Estados posibles de una unidad. Coinciden con el CHECK de la tabla: un
/// valor fuera de esta lista haría fallar el INSERT con un error de motor
/// en vez de un mensaje legible.
/// </summary>
public static class EstadoUnidad
{
    public const string Disponible    = "DISPONIBLE";
    public const string EnRuta        = "EN_RUTA";
    public const string Mantenimiento = "MANTENIMIENTO";
    public const string FueraServicio = "FUERA_SERVICIO";

    public static readonly string[] Todos = [Disponible, EnRuta, Mantenimiento, FueraServicio];

    /// <summary>EN_RUTA lo gobierna el turno del piloto, no la pantalla de flota.</summary>
    public static readonly string[] Asignables = [Disponible, Mantenimiento, FueraServicio];
}

/// <summary>Fila del listado de flota.</summary>
public record UnidadListaDto(
    int       IdUnidad,
    string    Codigo,
    string?   Placa,
    string?   Marca,
    string?   Modelo,
    short?    Anio,
    string?   Tipo,
    decimal   CapacidadKg,
    decimal   CapacidadM3,
    decimal   OdometroKm,
    string?   Transportista,
    string    Estado,
    bool      Activo,
    DateTime  FechaCreacion,
    // Piloto con turno abierto sobre la unidad, si lo hay.
    string?   PilotoActual,
    DateTime? TurnoDesde);

public class GuardarUnidadRequest
{
    [Required(ErrorMessage = "El código es obligatorio.")]
    [StringLength(20, ErrorMessage = "El código no puede exceder 20 caracteres.")]
    public string Codigo { get; set; } = string.Empty;

    [StringLength(20)]  public string? Placa         { get; set; }
    [StringLength(60)]  public string? Marca         { get; set; }
    [StringLength(60)]  public string? Modelo        { get; set; }
    [StringLength(30)]  public string? Tipo          { get; set; }
    [StringLength(120)] public string? Transportista { get; set; }

    [Range(1950, 2100, ErrorMessage = "El año debe estar entre 1950 y 2100.")]
    public short? Anio { get; set; }

    [Range(0, 999999.99, ErrorMessage = "La capacidad en kg no puede ser negativa.")]
    public decimal CapacidadKg { get; set; }

    [Range(0, 9999.99, ErrorMessage = "La capacidad en m³ no puede ser negativa.")]
    public decimal CapacidadM3 { get; set; }

    [Range(0, 9999999.99, ErrorMessage = "El odómetro no puede ser negativo.")]
    public decimal OdometroKm { get; set; }

    public string Estado { get; set; } = EstadoUnidad.Disponible;

    public bool Activo { get; set; } = true;
}
