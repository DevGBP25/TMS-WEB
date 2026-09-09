using System.Text;
using System.Text.Json.Serialization;
using Gbp.Tms.Api.Middleware;
using Gbp.Tms.Api.Swagger;
using Gbp.Tms.Application;
using Gbp.Tms.Infrastructure;
using Gbp.Tms.Infrastructure.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((ctx, cfg) => cfg
    .ReadFrom.Configuration(ctx.Configuration)
    .Enrich.FromLogContext());

builder.Services
    .AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        o.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

/* Los errores de validación salen por defecto como ProblemDetails, con una
   forma distinta a la del middleware de errores. Se unifica a { ok, mensaje }
   para que el cliente lea siempre el mismo campo. */
builder.Services.Configure<ApiBehaviorOptions>(o =>
{
    o.InvalidModelStateResponseFactory = ctx =>
    {
        var mensaje = ctx.ModelState
            .SelectMany(e => e.Value?.Errors ?? new ModelErrorCollection())
            .Select(e => e.ErrorMessage)
            .FirstOrDefault(m => !string.IsNullOrWhiteSpace(m))
            ?? "La solicitud no es válida.";

        return new BadRequestObjectResult(new { ok = false, mensaje });
    };
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(o =>
{
    o.SwaggerDoc("v1", new OpenApiInfo
    {
        Title   = "GBP · TMS API",
        Version = "v1",
        Description = "Gestión de transporte. Todas las consultas pasan por procedimientos almacenados."
    });

    foreach (var ensamblado in new[] { "Gbp.Tms.Api", "Gbp.Tms.Application", "Gbp.Tms.Domain" })
    {
        var xml = Path.Combine(AppContext.BaseDirectory, $"{ensamblado}.xml");
        if (File.Exists(xml)) o.IncludeXmlComments(xml, includeControllerXmlComments: true);
    }

    // Botón "Authorize" en Swagger para pegar el token y probar los endpoints protegidos.
    var esquema = new OpenApiSecurityScheme
    {
        Name         = "Authorization",
        Type         = SecuritySchemeType.Http,
        Scheme       = "bearer",
        BearerFormat = "JWT",
        In           = ParameterLocation.Header,
        Description  = "Pegue el token devuelto por /api/auth/login. No escriba 'Bearer', se agrega solo."
    };

    o.AddSecurityDefinition("Bearer", esquema);
    o.OperationFilter<SeguridadPorOperacionFilter>();
});

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

var jwt = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer           = true,
            ValidIssuer              = jwt.Issuer,
            ValidateAudience         = true,
            ValidAudience            = jwt.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey         = new SymmetricSecurityKey(
                                           Encoding.UTF8.GetBytes(
                                               string.IsNullOrWhiteSpace(jwt.Key)
                                                   ? new string('0', 32)   // placeholder: el generador aborta el arranque si falta
                                                   : jwt.Key)),
            ValidateLifetime         = true,
            // Sin esto .NET tolera 5 minutos de desfase y un token vencido sigue pasando.
            ClockSkew                = TimeSpan.Zero
        };
    });

builder.Services.AddAuthorization();

// En producción el frontend se sirve desde wwwroot (mismo origen); CORS
// sólo hace falta para el dev server de Vite.
const string CorsDev = "cors-dev";
builder.Services.AddCors(o => o.AddPolicy(CorsDev, p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

/* Verificación de arranque.

   Los servicios singleton se construyen al primer uso, así que sin esto la
   app levanta con una configuración incompleta y falla recién cuando alguien
   intenta entrar. Es preferible que no arranque. */
using (var scope = app.Services.CreateScope())
{
    _ = scope.ServiceProvider.GetRequiredService<Gbp.Tms.Application.Abstractions.IGeneradorToken>();
    _ = scope.ServiceProvider.GetRequiredService<Gbp.Tms.Infrastructure.Persistence.ISqlConnectionFactory>();
}

app.UseMiddleware<ExceptionMiddleware>();
app.UseSerilogRequestLogging();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(o =>
    {
        o.SwaggerEndpoint("/swagger/v1/swagger.json", "GBP · TMS API v1");
        o.RoutePrefix   = "swagger";
        o.DocumentTitle = "GBP · TMS API";
    });

    app.UseCors(CorsDev);
}

app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

/* Una ruta /api inexistente debe responder 404 en JSON. Sin esto cae en el
   fallback del SPA, devuelve index.html y el cliente falla al parsearlo con
   "Unexpected token '<'", que no dice nada sobre el problema real. */
app.MapFallback("/api/{**resto}", (HttpContext ctx) =>
    Results.Json(
        new { ok = false, mensaje = $"No existe el endpoint {ctx.Request.Path}." },
        statusCode: StatusCodes.Status404NotFound));

// El resto lo resuelve el router de React.
app.MapFallbackToFile("index.html");

app.Run();
