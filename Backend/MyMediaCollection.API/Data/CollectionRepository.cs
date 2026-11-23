using Dapper;
using Microsoft.Data.Sqlite;
using MyMediaCollection.API.Models;

namespace MyMediaCollection.API.Data;

public sealed class CollectionRepository(IConfiguration configuration, IWebHostEnvironment environment)
{
    private SqliteConnection CreateConnection()
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
        connectionString.ForeignKeys = true;
        return new SqliteConnection(connectionString.ToString());
    }

    public async Task<IReadOnlyList<CollectionItem>> GetAllAsync(CancellationToken cancellationToken)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        var command = new CommandDefinition(
            """
            SELECT c."Id", c."Name", c."MediaType", c."MediaFormat", c."Platform", c."Store", c."Info", c."CreatedAt", c."UpdatedAt", c."UserId",
                   c."TmdbMetadataId", m."TmdbId", m."PosterPath"
            FROM "Collection" c LEFT JOIN "TmdbMetadata" m ON m."Id" = c."TmdbMetadataId"
            ORDER BY c."Id" DESC;
            """,
            cancellationToken: cancellationToken);
        var items = await connection.QueryAsync<CollectionItem>(command);
        return items.AsList();
    }

    public async Task<CollectionItem?> UpdateAsync(long id, CreateCollectionItemRequest request, CancellationToken cancellationToken)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        var command = new CommandDefinition(
            """
            UPDATE "Collection"
            SET "Name" = @Name, "MediaType" = @MediaType, "MediaFormat" = @MediaFormat, "Platform" = @Platform, "Store" = @Store, "Info" = @Info,
                "UpdatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                "TmdbMetadataId" = CASE WHEN "MediaType" = @MediaType THEN "TmdbMetadataId" ELSE NULL END
            WHERE "Id" = @Id
            RETURNING "Id", "Name", "MediaType", "MediaFormat", "Platform", "Store", "Info", "CreatedAt", "UpdatedAt", "UserId", "TmdbMetadataId",
                (SELECT "TmdbId" FROM "TmdbMetadata" WHERE "Id" = "TmdbMetadataId") AS "TmdbId",
                (SELECT "PosterPath" FROM "TmdbMetadata" WHERE "Id" = "TmdbMetadataId") AS "PosterPath";
            """,
            new
            {
                Id = id, Name = request.Name.Trim(), MediaType = (int)request.MediaType,
                MediaFormat = (int?)request.MediaFormat, Platform = (int?)request.Platform, Store = (int?)request.Store,
                Info = string.IsNullOrWhiteSpace(request.Info) ? null : request.Info.Trim()
            },
            cancellationToken: cancellationToken);
        return await connection.QuerySingleOrDefaultAsync<CollectionItem>(command);
    }

    public async Task<bool> DeleteAsync(long id, CancellationToken cancellationToken)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        var command = new CommandDefinition(
            """DELETE FROM "Collection" WHERE "Id" = @Id;""",
            new { Id = id }, cancellationToken: cancellationToken);
        return await connection.ExecuteAsync(command) > 0;
    }

    public async Task<CollectionItem> CreateAsync(CreateCollectionItemRequest request, CancellationToken cancellationToken, TmdbMetadata? metadata = null)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);

        using var transaction = connection.BeginTransaction();
        long? metadataId = null;
        if (metadata is not null)
        {
            metadataId = await connection.ExecuteScalarAsync<long>(new CommandDefinition(
                """
                INSERT INTO "TmdbMetadata" ("TmdbId", "MediaType", "Language", "Title", "OriginalTitle", "Overview", "ReleaseDate", "PosterPath", "FetchedAt")
                VALUES (@TmdbId, @MediaType, @Language, @Title, @OriginalTitle, @Overview, @ReleaseDate, @PosterPath, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                ON CONFLICT ("TmdbId", "MediaType", "Language") DO UPDATE SET
                    "Title" = excluded."Title", "OriginalTitle" = excluded."OriginalTitle", "Overview" = excluded."Overview",
                    "ReleaseDate" = excluded."ReleaseDate", "PosterPath" = excluded."PosterPath", "FetchedAt" = excluded."FetchedAt"
                RETURNING "Id";
                """, metadata, transaction, cancellationToken: cancellationToken));
        }

        var name = request.Name.Trim();
        var info = string.IsNullOrWhiteSpace(request.Info) ? null : request.Info.Trim();
        var command = new CommandDefinition(
            """
            INSERT INTO "Collection" ("Name", "MediaType", "MediaFormat", "Platform", "Store", "Info", "CreatedAt", "TmdbMetadataId")
            VALUES (@Name, @MediaType, @MediaFormat, @Platform, @Store, @Info, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), @MetadataId)
            RETURNING "Id", "Name", "MediaType", "MediaFormat", "Platform", "Store", "Info", "CreatedAt", "UpdatedAt", "UserId", "TmdbMetadataId";
            """,
            new { Name = name, MediaType = (int)request.MediaType, MediaFormat = (int?)request.MediaFormat, Platform = (int?)request.Platform, Store = (int?)request.Store, Info = info, MetadataId = metadataId },
            transaction,
            cancellationToken: cancellationToken);
        var item = await connection.QuerySingleAsync<CollectionItem>(command);
        transaction.Commit();
        return item with { TmdbId = metadata?.TmdbId, PosterPath = metadata?.PosterPath };
    }
}
