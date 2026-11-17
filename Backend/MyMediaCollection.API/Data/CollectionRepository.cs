using Dapper;
using Microsoft.Data.Sqlite;
using MyMediaCollection.API.Models;

namespace MyMediaCollection.API.Data;

public sealed class CollectionRepository(IConfiguration configuration, IWebHostEnvironment environment)
{
    public async Task<CollectionItem> CreateAsync(CreateCollectionItemRequest request, CancellationToken cancellationToken)
    {
        var connectionString = new SqliteConnectionStringBuilder(
            configuration.GetConnectionString("Collection")
            ?? throw new InvalidOperationException("The Collection connection string is missing."));
        if (!Path.IsPathRooted(connectionString.DataSource))
        {
            connectionString.DataSource = Path.Combine(environment.ContentRootPath, connectionString.DataSource);
        }

        // The database and its tables are managed manually; do not create them here.
        connectionString.Mode = SqliteOpenMode.ReadWrite;
        await using var connection = new SqliteConnection(connectionString.ToString());
        await connection.OpenAsync(cancellationToken);

        var name = request.Name.Trim();
        var info = string.IsNullOrWhiteSpace(request.Info) ? null : request.Info.Trim();
        var command = new CommandDefinition(
            """
            INSERT INTO "Collection" ("Name", "MediaType", "MediaFormat", "Info")
            VALUES (@Name, @MediaType, @MediaFormat, @Info)
            RETURNING "Id";
            """,
            new { Name = name, MediaType = (int)request.MediaType, MediaFormat = (int)request.MediaFormat, Info = info },
            cancellationToken: cancellationToken);
        var id = await connection.ExecuteScalarAsync<long>(command);
        return new CollectionItem(id, name, request.MediaType, request.MediaFormat, info);
    }
}
