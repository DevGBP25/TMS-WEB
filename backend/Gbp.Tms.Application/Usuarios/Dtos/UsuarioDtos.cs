using System.ComponentModel.DataAnnotations;

namespace Gbp.Tms.Application.Usuarios.Dtos;

/// <summary>Fila del listado de usuarios.</summary>
public record UsuarioListaDto(
    int                   IdUsuario,
    string                Usuario,
    string                Nombre,
    string?               Telefono,
    string?               Dpi,
    string?               Licencia,
    string?               TipoLicencia,
    DateOnly?             LicenciaVence,
    bool                  Activo,
    byte                  IntentosFallidos,
    DateTime?             UltimoAcceso,
    DateTime              FechaCreacion,
    IReadOnlyList<string> Roles);

public record RolDto(int IdRol, string Nombre, string? Descripcion);

/// <summary>
/// Longitud mínima de contraseña. Corta a propósito: el administrador asigna
/// claves numéricas a los pilotos, que las teclean en el celular. El freno a la
/// fuerza bruta es la desactivación a los 5 intentos, no la longitud.
/// </summary>
public static class ReglasPassword
{
    public const int Minimo = 4;
    public const string Mensaje = "La contraseña debe tener al menos 4 caracteres.";
}

public class CrearUsuarioRequest
{
    [Required(ErrorMessage = "El código de usuario es obligatorio.")]
    [StringLength(30, ErrorMessage = "El código no puede exceder 30 caracteres.")]
    [RegularExpression(@"^[A-Za-z0-9._-]+$",
        ErrorMessage = "El código sólo admite letras, números, punto, guion y guion bajo.")]
    public string Usuario { get; set; } = string.Empty;

    [Required(ErrorMessage = "El nombre es obligatorio.")]
    [StringLength(120)]
    public string Nombre { get; set; } = string.Empty;

    [Required(ErrorMessage = "La contraseña es obligatoria.")]
    [MinLength(ReglasPassword.Minimo, ErrorMessage = ReglasPassword.Mensaje)]
    public string Password { get; set; } = string.Empty;

    [StringLength(20)] public string? Telefono      { get; set; }
    [StringLength(20)] public string? Dpi           { get; set; }
    [StringLength(30)] public string? Licencia      { get; set; }
    [StringLength(5)]  public string? TipoLicencia  { get; set; }
    public DateOnly?  LicenciaVence { get; set; }

    public List<string> Roles { get; set; } = new();
}

public class ActualizarUsuarioRequest
{
    [Required(ErrorMessage = "El nombre es obligatorio.")]
    [StringLength(120)]
    public string Nombre { get; set; } = string.Empty;

    [StringLength(20)] public string? Telefono     { get; set; }
    [StringLength(20)] public string? Dpi          { get; set; }
    [StringLength(30)] public string? Licencia     { get; set; }
    [StringLength(5)]  public string? TipoLicencia { get; set; }
    public DateOnly? LicenciaVence { get; set; }

    public bool Activo { get; set; } = true;

    /// <summary>Selección completa de roles: reemplaza la anterior, no es un delta.</summary>
    public List<string> Roles { get; set; } = new();
}

public class RestablecerPasswordRequest
{
    [Required(ErrorMessage = "La contraseña es obligatoria.")]
    [MinLength(ReglasPassword.Minimo, ErrorMessage = ReglasPassword.Mensaje)]
    public string Password { get; set; } = string.Empty;
}
