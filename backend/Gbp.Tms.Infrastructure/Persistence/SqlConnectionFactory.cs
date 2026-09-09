using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace Gbp.Tms.Infrastructure.Persistence;

public interface ISqlConnectionFactory
{
    /// <summary>Conexión abierta a la base del TMS. El llamador la libera.</summary>
    Task<IDbConnection> CreateAsync(CancellationToken ct = default);
}

public class SqlConnectionFactory : ISqlConnectionFactory
{
    private readonly string _connectionString;

    public SqlConnectionFactory(IConfiguration configuration)
    {
        var cadena = configuration.GetConnectionString("Tms");

        // Se valida por vacío y no sólo por null: una cadena en blanco pasaría
        // el ?? y reventaría después con un error de SqlClient sin contexto.
        if (string.IsNullOrWhiteSpace(cadena))
            throw new InvalidOperationException(
                "Falta la cadena de conexión 'Tms'. En desarrollo defínala con:\n" +
                "  dotnet user-secrets set \"ConnectionStrings:Tms\" \"<cadena>\" --project Gbp.Tms.Api\n" +
                "En el servidor, con la variable de entorno ConnectionStrings__Tms.");

        _connectionString = cadena;
    }

    public async Task<IDbConnection> CreateAsync(CancellationToken ct = default)
    {
        var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        return conn;
    }
}
