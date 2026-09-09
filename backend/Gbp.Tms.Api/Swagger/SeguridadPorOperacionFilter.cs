using Microsoft.AspNetCore.Authorization;
using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace Gbp.Tms.Api.Swagger;

/// <summary>
/// Marca como protegidas sólo las operaciones con [Authorize]. Un requisito
/// global pondría el candado también en /login y /salud, y el contrato diría
/// que hacen falta credenciales para autenticarse.
/// </summary>
public class SeguridadPorOperacionFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var metadatos = context.ApiDescription.ActionDescriptor.EndpointMetadata;

        var anonimo = metadatos.OfType<IAllowAnonymous>().Any();
        var exige   = metadatos.OfType<IAuthorizeData>().Any();

        if (anonimo || !exige) return;

        operation.Security =
        [
            new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference("Bearer", context.Document)] = new List<string>()
            }
        ];

        operation.Responses ??= [];
        operation.Responses.TryAdd("401", new OpenApiResponse { Description = "Token ausente o inválido." });
    }
}
