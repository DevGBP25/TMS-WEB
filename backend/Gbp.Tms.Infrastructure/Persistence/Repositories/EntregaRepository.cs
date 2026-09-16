using System.Data;
using Dapper;
using Gbp.Tms.Application.Abstractions;
using Gbp.Tms.Application.Common;
using Gbp.Tms.Application.Entregas.Dtos;
using Microsoft.Data.SqlClient;

namespace Gbp.Tms.Infrastructure.Persistence.Repositories;

public class EntregaRepository : IEntregaRepository
{
    // RAISERROR de nivel 16 desde el procedimiento: es una regla de negocio.
    private const int ErrorDeNegocio = 50000;

    private readonly ISqlConnectionFactory _factory;

    public EntregaRepository(ISqlConnectionFactory factory) => _factory = factory;

    public async Task<PagedResult<EntregaListaDto>> ListarAsync(
        EntregaFiltro filtro, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        var filas = (await conn.QueryAsync<Fila>(new CommandDefinition(
            "dbo.usp_gbp_tms_entrega_listar",
            new
            {
                buscar    = filtro.Buscar,
                estado    = filtro.Estado,
                municipio = filtro.Municipio,
                desde     = filtro.Desde,
                hasta     = filtro.Hasta,
                id_viaje  = filtro.IdViaje,
                id_piloto = filtro.IdPiloto,
                sin_viaje = filtro.SinViaje,
                pagina    = filtro.Pagina,
                tamano    = filtro.PorPagina
            },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct))).ToList();

        return new PagedResult<EntregaListaDto>
        {
            // El total viaja repetido en cada fila; una página vacía no trae ninguna.
            Total     = filas.Count > 0 ? filas[0].total : 0,
            Pagina    = filtro.Pagina,
            PorPagina = filtro.PorPagina,
            Items     = filas.Select(f => new EntregaListaDto(
                f.id_entrega, f.sap_doc_entry, f.sap_doc_num,
                f.sap_orden_doc_entry, f.sap_orden_venta, f.sap_factura_num,
                f.cliente_codigo, f.cliente_nombre, f.direccion, f.municipio,
                f.peso_kg, f.fecha_documento, f.hora_documento, f.fecha_entrega,
                f.estado, f.id_viaje, f.secuencia,
                f.id_usuario_piloto, f.asignada_en,
                f.receptor, f.motivo_rechazo, f.entregada_en,
                f.piloto_nombre, f.viaje_numero, f.viaje_fecha, f.unidad_codigo,
                f.articulos)).ToList()
        };
    }

    public async Task<EntregaDetalleDto?> ObtenerAsync(int idEntrega, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        using var multi = await conn.QueryMultipleAsync(new CommandDefinition(
            "dbo.usp_gbp_tms_entrega_obtener",
            new { id_entrega = idEntrega },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        var d = await multi.ReadSingleOrDefaultAsync<FilaDetalle>();
        if (d is null) return null;

        var productos = (await multi.ReadAsync<FilaProducto>())
            .Select(l => new ProductoDto(
                l.linea_num, l.codigo_articulo, l.codigo_barras,
                l.descripcion, l.cantidad, l.unidad, l.almacen))
            .ToList();

        return new EntregaDetalleDto(
            d.id_entrega, d.sap_doc_entry, d.sap_doc_num,
            d.sap_orden_doc_entry, d.sap_orden_venta, d.sap_factura_num,
            d.cliente_codigo, d.cliente_nombre, d.direccion, d.municipio,
            d.peso_kg, d.fecha_documento, d.hora_documento, d.fecha_entrega,
            d.estado, d.id_viaje, d.secuencia,
            d.id_usuario_piloto, d.asignada_en, d.receptor, d.motivo_rechazo, d.entregada_en,
            d.observaciones, d.fecha_creacion,
            d.piloto_nombre, d.piloto_usuario, d.piloto_telefono,
            d.viaje_numero, d.viaje_fecha, d.viaje_estado,
            d.unidad_codigo, d.unidad_placa,
            productos);
    }

    public async Task<ResumenEntregasDto> ResumenAsync(CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        var r = await conn.QuerySingleAsync<FilaResumen>(new CommandDefinition(
            "dbo.usp_gbp_tms_entrega_resumen",
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return new ResumenEntregasDto(
            r.asignadas, r.en_ruta, r.entregadas, r.rechazadas, r.anuladas, r.sin_viaje);
    }

    public async Task<IReadOnlyList<int>> TomadasAsync(
        IReadOnlyList<int> sapDocEntries, CancellationToken ct = default)
    {
        if (sapDocEntries.Count == 0) return [];

        using var conn = await _factory.CreateAsync(ct);

        var p = new DynamicParameters();
        p.Add("@doc_entries", TablaIds(sapDocEntries).AsTableValuedParameter("dbo.tp_gbp_tms_id"));

        var filas = await conn.QueryAsync<int>(new CommandDefinition(
            "dbo.usp_gbp_tms_entrega_tomadas", p,
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return filas.ToList();
    }

    public async Task<IReadOnlyList<int>> OrdenesTomadasAsync(
        IReadOnlyList<int> ordenNums, CancellationToken ct = default)
    {
        if (ordenNums.Count == 0) return [];

        using var conn = await _factory.CreateAsync(ct);

        var p = new DynamicParameters();
        p.Add("@ordenes", TablaIds(ordenNums).AsTableValuedParameter("dbo.tp_gbp_tms_id"));

        var filas = await conn.QueryAsync<int>(new CommandDefinition(
            "dbo.usp_gbp_tms_entrega_ordenes_tomadas", p,
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return filas.ToList();
    }

    public async Task<int> AsignarPilotoAsync(
        int idPiloto, IReadOnlyList<EntregaAAsignar> boletas, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        var p = new DynamicParameters();
        p.Add("@id_piloto", idPiloto);
        p.Add("@ordenes", TablaOrdenes(boletas).AsTableValuedParameter("dbo.tp_gbp_tms_entrega_asignar"));
        p.Add("@lineas",  TablaLineas(boletas).AsTableValuedParameter("dbo.tp_gbp_tms_entrega_linea"));

        try
        {
            return await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                "dbo.usp_gbp_tms_entrega_asignar_piloto", p,
                commandType: CommandType.StoredProcedure,
                cancellationToken: ct));
        }
        catch (SqlException ex) when (ex.Number == ErrorDeNegocio)
        {
            // El procedimiento ya redactó el motivo y nombró los documentos.
            throw new AppException(ex.Message, 409);
        }
    }

    public async Task<IReadOnlyList<PendienteDeBoleta>> PendientesDeBoletaAsync(
        int dias, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        var filas = await conn.QueryAsync<FilaPendiente>(new CommandDefinition(
            "dbo.usp_gbp_tms_entrega_pendientes_de_boleta",
            new { dias },
            commandType: CommandType.StoredProcedure,
            cancellationToken: ct));

        return filas.Select(f => new PendienteDeBoleta(
            f.id_entrega, f.sap_orden_doc_entry, f.sap_orden_venta,
            f.cliente_codigo, f.fecha_documento)).ToList();
    }

    public async Task<int> VincularAsync(
        IReadOnlyList<VinculoEntrega> vinculos, CancellationToken ct = default)
    {
        if (vinculos.Count == 0) return 0;

        using var conn = await _factory.CreateAsync(ct);

        var p = new DynamicParameters();
        p.Add("@vinculos", TablaVinculos(vinculos).AsTableValuedParameter("dbo.tp_gbp_tms_entrega_vinculo"));

        try
        {
            return await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                "dbo.usp_gbp_tms_entrega_vincular", p,
                commandType: CommandType.StoredProcedure,
                cancellationToken: ct));
        }
        catch (SqlException ex) when (ex.Number == ErrorDeNegocio)
        {
            throw new AppException(ex.Message, 409);
        }
    }

    public async Task<int> CambiarPilotoAsync(
        int idPiloto, IReadOnlyList<int> ids, CancellationToken ct = default)
    {
        using var conn = await _factory.CreateAsync(ct);

        var p = new DynamicParameters();
        p.Add("@id_piloto", idPiloto);
        p.Add("@ids", TablaIds(ids).AsTableValuedParameter("dbo.tp_gbp_tms_id"));

        try
        {
            return await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                "dbo.usp_gbp_tms_entrega_cambiar_piloto", p,
                commandType: CommandType.StoredProcedure,
                cancellationToken: ct));
        }
        catch (SqlException ex) when (ex.Number == ErrorDeNegocio)
        {
            // El procedimiento ya redactó el motivo y nombró los documentos.
            throw new AppException(ex.Message, 409);
        }
    }

    public Task<int> SacarDeViajeAsync(IReadOnlyList<int> ids, CancellationToken ct = default)
        => PorLoteAsync("dbo.usp_gbp_tms_entrega_sacar_de_viaje", ids, null, ct);

    public Task<int> LiberarAsync(IReadOnlyList<int> ids, CancellationToken ct = default)
        => PorLoteAsync("dbo.usp_gbp_tms_entrega_liberar", ids, null, ct);

    public Task<int> AsignarViajeAsync(
        int idViaje, IReadOnlyList<int> ids, CancellationToken ct = default)
        => PorLoteAsync("dbo.usp_gbp_tms_entrega_asignar", ids, idViaje, ct);

    private async Task<int> PorLoteAsync(
        string procedimiento, IReadOnlyList<int> ids, int? idViaje, CancellationToken ct)
    {
        using var conn = await _factory.CreateAsync(ct);

        var p = new DynamicParameters();
        if (idViaje is not null) p.Add("@id_viaje", idViaje);
        p.Add("@ids", TablaIds(ids).AsTableValuedParameter("dbo.tp_gbp_tms_id"));

        try
        {
            return await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                procedimiento, p,
                commandType: CommandType.StoredProcedure,
                cancellationToken: ct));
        }
        catch (SqlException ex) when (ex.Number == ErrorDeNegocio)
        {
            throw new AppException(ex.Message, 409);
        }
    }

    /* Las columnas van en el mismo orden que el tipo de tabla: SQL Server las
       empareja por posición, no por nombre, y un orden distinto no da error
       sino datos en la columna equivocada. */
    private static DataTable TablaOrdenes(IReadOnlyList<EntregaAAsignar> filas)
    {
        var t = new DataTable();
        t.Columns.Add("sap_orden_doc_entry", typeof(int));
        t.Columns.Add("sap_orden_venta",     typeof(int));
        t.Columns.Add("sap_doc_entry",       typeof(int));
        t.Columns.Add("sap_doc_num",         typeof(int));
        t.Columns.Add("sap_factura_num",     typeof(int));
        t.Columns.Add("cliente_codigo",      typeof(string));
        t.Columns.Add("cliente_nombre",      typeof(string));
        t.Columns.Add("direccion",           typeof(string));
        t.Columns.Add("municipio",           typeof(string));
        t.Columns.Add("peso_kg",             typeof(decimal));
        t.Columns.Add("monto",               typeof(decimal));
        t.Columns.Add("fecha_documento",     typeof(DateTime));
        t.Columns.Add("hora_documento",      typeof(TimeSpan));
        t.Columns.Add("fecha_entrega",       typeof(DateTime));

        foreach (var f in filas)
            t.Rows.Add(
                f.SapOrdenDocEntry,
                f.SapOrdenVenta,
                (object?)f.SapDocEntry     ?? DBNull.Value,
                (object?)f.SapDocNum       ?? DBNull.Value,
                (object?)f.SapFacturaNum   ?? DBNull.Value,
                Recortar(f.ClienteCodigo, 30),
                Recortar(f.ClienteNombre, 150) ?? string.Empty,
                (object?)Recortar(f.Direccion, 300) ?? DBNull.Value,
                (object?)Recortar(f.Municipio, 80)  ?? DBNull.Value,
                f.PesoKg,
                f.Monto,
                f.FechaDocumento.Date,
                (object?)f.HoraDocumento        ?? DBNull.Value,
                (object?)f.FechaEntrega?.Date   ?? DBNull.Value);

        return t;
    }

    private static DataTable TablaVinculos(IReadOnlyList<VinculoEntrega> filas)
    {
        var t = new DataTable();
        t.Columns.Add("sap_orden_doc_entry", typeof(int));
        t.Columns.Add("sap_doc_entry",       typeof(int));
        t.Columns.Add("sap_doc_num",         typeof(int));
        t.Columns.Add("sap_factura_num",     typeof(int));
        t.Columns.Add("anulada",             typeof(bool));

        foreach (var f in filas)
            t.Rows.Add(
                f.SapOrdenDocEntry,
                f.SapDocEntry,
                f.SapDocNum,
                (object?)f.SapFacturaNum ?? DBNull.Value,
                f.Anulada);

        return t;
    }

    private static DataTable TablaLineas(IReadOnlyList<EntregaAAsignar> filas)
    {
        var t = new DataTable();
        t.Columns.Add("sap_orden_doc_entry", typeof(int));
        t.Columns.Add("linea_num",       typeof(int));
        t.Columns.Add("codigo_articulo", typeof(string));
        t.Columns.Add("codigo_barras",   typeof(string));
        t.Columns.Add("descripcion",     typeof(string));
        t.Columns.Add("cantidad",        typeof(decimal));
        t.Columns.Add("unidad",          typeof(string));
        t.Columns.Add("almacen",         typeof(string));

        foreach (var e in filas)
            foreach (var l in e.Lineas)
                t.Rows.Add(
                    e.SapOrdenDocEntry,
                    l.LineaNum,
                    Recortar(l.CodigoArticulo, 50),
                    (object?)Recortar(l.CodigoBarras, 50) ?? DBNull.Value,
                    /* SAP no limita la descripción a lo que cabe en la columna;
                       recortar aquí evita que el INSERT falle por un artículo
                       con nombre largo y se pierda toda la asignación. */
                    Recortar(l.Descripcion, 200) ?? string.Empty,
                    l.Cantidad,
                    (object?)Recortar(l.Unidad, 30) ?? DBNull.Value,
                    (object?)Recortar(l.Almacen, 20) ?? DBNull.Value);

        return t;
    }

    private static string? Recortar(string? v, int max)
        => v is null ? null : v.Length <= max ? v : v[..max];

    private static DataTable TablaIds(IReadOnlyList<int> ids)
    {
        var t = new DataTable();
        t.Columns.Add("id", typeof(int));
        foreach (var id in ids) t.Rows.Add(id);
        return t;
    }

    private sealed class Fila
    {
        public int       total             { get; init; }
        public int        id_entrega          { get; init; }
        public int?       sap_doc_entry       { get; init; }
        public int?       sap_doc_num         { get; init; }
        public int?       sap_orden_doc_entry { get; init; }
        public int?       sap_orden_venta     { get; init; }
        public int?       sap_factura_num     { get; init; }
        public string    cliente_codigo    { get; init; } = string.Empty;
        public string    cliente_nombre    { get; init; } = string.Empty;
        public string?   direccion         { get; init; }
        public string?   municipio         { get; init; }
        public decimal   peso_kg           { get; init; }
        public DateTime  fecha_documento   { get; init; }
        public TimeSpan? hora_documento    { get; init; }
        public DateTime? fecha_entrega     { get; init; }
        public string    estado            { get; init; } = string.Empty;
        public int?      id_viaje          { get; init; }
        public int?      secuencia         { get; init; }
        public int       id_usuario_piloto { get; init; }
        public DateTime? asignada_en       { get; init; }
        public string?   receptor          { get; init; }
        public string?   motivo_rechazo    { get; init; }
        public DateTime? entregada_en      { get; init; }
        public string    piloto_nombre     { get; init; } = string.Empty;
        public string?   viaje_numero      { get; init; }
        public DateTime? viaje_fecha       { get; init; }
        public string?   unidad_codigo     { get; init; }
        public int       articulos         { get; init; }
    }

    private sealed class FilaDetalle
    {
        public int        id_entrega          { get; init; }
        public int?       sap_doc_entry       { get; init; }
        public int?       sap_doc_num         { get; init; }
        public int?       sap_orden_doc_entry { get; init; }
        public int?       sap_orden_venta     { get; init; }
        public int?       sap_factura_num     { get; init; }
        public string    cliente_codigo    { get; init; } = string.Empty;
        public string    cliente_nombre    { get; init; } = string.Empty;
        public string?   direccion         { get; init; }
        public string?   municipio         { get; init; }
        public decimal   peso_kg           { get; init; }
        public DateTime  fecha_documento   { get; init; }
        public TimeSpan? hora_documento    { get; init; }
        public DateTime? fecha_entrega     { get; init; }
        public string    estado            { get; init; } = string.Empty;
        public int?      id_viaje          { get; init; }
        public int?      secuencia         { get; init; }
        public int       id_usuario_piloto { get; init; }
        public DateTime? asignada_en       { get; init; }
        public string?   receptor          { get; init; }
        public string?   motivo_rechazo    { get; init; }
        public DateTime? entregada_en      { get; init; }
        public string?   observaciones     { get; init; }
        public DateTime  fecha_creacion    { get; init; }
        public string    piloto_nombre     { get; init; } = string.Empty;
        public string?   piloto_usuario    { get; init; }
        public string?   piloto_telefono   { get; init; }
        public string?   viaje_numero      { get; init; }
        public DateTime? viaje_fecha       { get; init; }
        public string?   viaje_estado      { get; init; }
        public string?   unidad_codigo     { get; init; }
        public string?   unidad_placa      { get; init; }
    }

    private sealed class FilaPendiente
    {
        public int      id_entrega          { get; init; }
        public int      sap_orden_doc_entry { get; init; }
        public int      sap_orden_venta     { get; init; }
        public string   cliente_codigo      { get; init; } = string.Empty;
        public DateTime fecha_documento     { get; init; }
    }

    private sealed class FilaProducto
    {
        public int      linea_num       { get; init; }
        public string   codigo_articulo { get; init; } = string.Empty;
        public string?  codigo_barras   { get; init; }
        public string   descripcion     { get; init; } = string.Empty;
        public decimal  cantidad        { get; init; }
        public string?  unidad          { get; init; }
        public string?  almacen         { get; init; }
    }

    private sealed class FilaResumen
    {
        public int asignadas  { get; init; }
        public int en_ruta    { get; init; }
        public int entregadas { get; init; }
        public int rechazadas { get; init; }
        public int anuladas   { get; init; }
        public int sin_viaje  { get; init; }
    }
}
