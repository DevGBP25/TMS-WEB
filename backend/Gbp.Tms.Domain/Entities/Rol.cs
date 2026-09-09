namespace Gbp.Tms.Domain.Entities;

/// <summary>Rol funcional. Los permisos viajan como JSON para que la app decida qué mostrar.</summary>
public class Rol
{
    public string  Nombre       { get; set; } = string.Empty;
    public string? PermisosJson { get; set; }
}
