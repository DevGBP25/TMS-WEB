using Gbp.Tms.Application.Auth;
using Gbp.Tms.Application.Unidades;
using Gbp.Tms.Application.Usuarios;
using Microsoft.Extensions.DependencyInjection;

namespace Gbp.Tms.Application;

public static class DependencyInjection
{
    /// <summary>Registra los casos de uso. Las implementaciones las aporta Infrastructure.</summary>
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<AuthService>();
        services.AddScoped<UsuarioService>();
        services.AddScoped<UnidadService>();
        return services;
    }
}
