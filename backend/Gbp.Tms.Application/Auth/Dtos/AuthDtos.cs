using System.ComponentModel.DataAnnotations;

namespace Gbp.Tms.Application.Auth.Dtos;

/// <summary>Credenciales enviadas desde la web o la app móvil.</summary>
public class LoginRequest
{
    [Required(ErrorMessage = "El usuario es obligatorio.")]
    [StringLength(30, ErrorMessage = "El usuario no puede exceder 30 caracteres.")]
    public string Usuario { get; set; } = string.Empty;

    [Required(ErrorMessage = "La contraseña es obligatoria.")]
    public string Password { get; set; } = string.Empty;

    /// <summary>WEB o MOVIL. Queda registrado en la sesión y en la bitácora.</summary>
    public string Plataforma { get; set; } = "WEB";

    /// <summary>Descripción libre del dispositivo, para la bitácora.</summary>
    [StringLength(100)]
    public string? Dispositivo { get; set; }
}

/// <summary>Usuario autenticado, tal como lo consume el frontend.</summary>
public record UsuarioDto(
    int                   IdUsuario,
    string                Usuario,
    string                Nombre,
    string?               Telefono,
    DateTime?             UltimoAcceso,
    IReadOnlyList<string> Roles);

/// <summary>Respuesta de un login correcto.</summary>
public record LoginResponse(
    string      Token,
    DateTime    Expira,
    UsuarioDto  Usuario);
