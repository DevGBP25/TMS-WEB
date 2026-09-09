namespace Gbp.Tms.Infrastructure.Configuration;

/// <summary>Sección <c>Sap</c> de appsettings. Las credenciales van en user-secrets o variables de entorno.</summary>
public class SapOptions
{
    public const string SectionName = "Sap";

    /// <summary>URL base del Service Layer, sin barra final. Ej: https://sap.gbp.com.gt:50000/b1s/v1</summary>
    public string Url        { get; set; } = string.Empty;
    public string Company    { get; set; } = string.Empty;
    public string User       { get; set; } = string.Empty;
    public string Password   { get; set; } = string.Empty;
    /// <summary>false para certificados internos / autofirmados.</summary>
    public bool   VerifySsl  { get; set; }
    /// <summary>Minutos de vida de la sesión del Service Layer antes de renovar el login.</summary>
    public int    SesionMin  { get; set; } = 25;
    /// <summary>Almacén cuyas entregas alimentan la planificación de viajes.</summary>
    public string AlmacenOrigen { get; set; } = string.Empty;
}
