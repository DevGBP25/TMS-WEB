using System.Net.Security;
using Gbp.Tms.Application.Abstractions;
using Gbp.Tms.Infrastructure.Configuration;
using Gbp.Tms.Infrastructure.Persistence;
using Gbp.Tms.Infrastructure.Persistence.Repositories;
using Gbp.Tms.Infrastructure.Sap;
using Gbp.Tms.Infrastructure.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Gbp.Tms.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<SapOptions>(configuration.GetSection(SapOptions.SectionName));
        services.Configure<JwtOptions>(configuration.GetSection(JwtOptions.SectionName));

        services.AddSingleton<ISqlConnectionFactory, SqlConnectionFactory>();

        services.AddScoped<IAuthRepository, AuthRepository>();
        services.AddScoped<IUsuarioRepository, UsuarioRepository>();
        services.AddScoped<IUnidadRepository, UnidadRepository>();
        services.AddScoped<IEntregaRepository, EntregaRepository>();
        services.AddScoped<IViajeRepository, ViajeRepository>();
        services.AddSingleton<IPasswordHasher, PasswordHasherAdapter>();
        services.AddSingleton<IGeneradorToken, GeneradorTokenJwt>();

        var sap = configuration.GetSection(SapOptions.SectionName).Get<SapOptions>() ?? new SapOptions();

        services.AddHttpClient<ISapServiceLayerClient, SapServiceLayerClient>(http =>
        {
            // La barra final es necesaria para que las rutas relativas se resuelvan bajo /b1s/v1/.
            if (!string.IsNullOrWhiteSpace(sap.Url))
                http.BaseAddress = new Uri(sap.Url.TrimEnd('/') + "/");

            http.Timeout = TimeSpan.FromSeconds(60);
        })
        .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
        {
            // SAP suele exponer el Service Layer con certificado interno autofirmado.
            SslOptions = new SslClientAuthenticationOptions
            {
                RemoteCertificateValidationCallback = sap.VerifySsl
                    ? null
                    : (_, _, _, _) => true
            },
            PooledConnectionLifetime = TimeSpan.FromMinutes(5)
        });

        return services;
    }
}
