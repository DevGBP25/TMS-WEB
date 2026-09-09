namespace Gbp.Tms.Domain.Entities;

/// <summary>
/// Cuenta de acceso. Un piloto es un usuario con rol PILOTO: los campos de
/// licencia quedan nulos en las cuentas administrativas.
/// </summary>
public class Usuario
{
    public int       IdUsuario           { get; set; }
    public string    NombreUsuario       { get; set; } = string.Empty;
    public string    Nombre              { get; set; } = string.Empty;
    public string?   Telefono            { get; set; }

    public string    PasswordHash        { get; set; } = string.Empty;
    public byte      IntentosFallidos    { get; set; }
    public bool      Activo              { get; set; }
    public DateTime? UltimoAcceso        { get; set; }

    public string?   Licencia            { get; set; }
    public string?   TipoLicencia        { get; set; }
    public DateOnly? LicenciaVence       { get; set; }

    public List<Rol> Roles               { get; set; } = new();

    /// <summary>La licencia venció o vence dentro de los próximos <paramref name="dias"/> días.</summary>
    public bool LicenciaPorVencer(int dias = 30) =>
        LicenciaVence is { } v && v <= DateOnly.FromDateTime(DateTime.Today).AddDays(dias);
}
