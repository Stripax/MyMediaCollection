using Dapper;
using System.Text.Json;
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
            SELECT c."Id", c."Name", c."IsNameCustom", c."MediaType", c."MediaFormat", c."Platform", c."Store", c."IsPhysical", c."IsCompleteBox", c."Info", c."CreatedAt", c."UpdatedAt", c."UserId",
                   c."TmdbMetadataId", m."TmdbId", m."PosterPath", c."IgdbMetadataId", g."IgdbId", g."CoverImageId"
            FROM "Collection" c LEFT JOIN "TmdbMetadata" m ON m."Id" = c."TmdbMetadataId"
            LEFT JOIN "IgdbMetadata" g ON g."Id" = c."IgdbMetadataId"
            ORDER BY c."Id" DESC;
            """,
            cancellationToken: cancellationToken);
        var items = await connection.QueryAsync<CollectionItem>(command);
        return await WithSourceMetadataAsync(connection, items.AsList(), cancellationToken);
    }

    public async Task<CollectionItem?> UpdateAsync(long id, CreateCollectionItemRequest request, CancellationToken cancellationToken)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        using var transaction = connection.BeginTransaction();
        var command = new CommandDefinition(
            """
            UPDATE "Collection"
            SET "Name" = CASE WHEN @NameWasEdited = 0 AND "TmdbMetadataId" IS NOT NULL THEN "Name" ELSE @Name END,
                "IsNameCustom" = CASE WHEN @NameWasEdited = 1 OR (@NameWasEdited IS NULL AND "Name" <> @Name) THEN 1 ELSE "IsNameCustom" END, "MediaType" = @MediaType, "MediaFormat" = @MediaFormat, "Platform" = @Platform, "Store" = @Store, "IsPhysical" = @IsPhysical, "IsCompleteBox" = CASE WHEN @MediaType = 2 THEN COALESCE(@IsCompleteBox, "IsCompleteBox") ELSE 0 END, "Info" = @Info,
                "UpdatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                "TmdbMetadataId" = CASE WHEN "MediaType" = @MediaType THEN "TmdbMetadataId" ELSE NULL END,
                "IgdbMetadataId" = CASE WHEN "MediaType" = @MediaType THEN "IgdbMetadataId" ELSE NULL END
            WHERE "Id" = @Id
            RETURNING "Id", "Name", "IsNameCustom", "MediaType", "MediaFormat", "Platform", "Store", "IsPhysical", "IsCompleteBox", "Info", "CreatedAt", "UpdatedAt", "UserId", "TmdbMetadataId",
                (SELECT "TmdbId" FROM "TmdbMetadata" WHERE "Id" = "TmdbMetadataId") AS "TmdbId",
                (SELECT "PosterPath" FROM "TmdbMetadata" WHERE "Id" = "TmdbMetadataId") AS "PosterPath",
                "IgdbMetadataId",
                (SELECT "IgdbId" FROM "IgdbMetadata" WHERE "Id" = "IgdbMetadataId") AS "IgdbId",
                (SELECT "CoverImageId" FROM "IgdbMetadata" WHERE "Id" = "IgdbMetadataId") AS "CoverImageId";
            """,
            new
            {
                Id = id, request.IsCompleteBox, Name = request.Name.Trim(), request.NameWasEdited, MediaType = (int)request.MediaType,
                MediaFormat = (int?)request.MediaFormat, Platform = (int?)request.Platform, Store = (int?)request.Store,
                IsPhysical = request.MediaType == MediaType.VideoGame ? request.IsPhysical ?? false : (bool?)null,
                Info = string.IsNullOrWhiteSpace(request.Info) ? null : request.Info.Trim()
            },
            transaction, cancellationToken: cancellationToken);
        var item = await connection.QuerySingleOrDefaultAsync<CollectionItem>(command);
        if (item is null) return null;
        await SaveOwnershipAsync(connection, transaction, item, request, cancellationToken);
        var result = (await WithSourceMetadataAsync(connection, [item], cancellationToken, transaction))[0];
        transaction.Commit();
        return result;
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

    public async Task<CollectionItem> CreateAsync(CreateCollectionItemRequest request, CancellationToken cancellationToken, TmdbMetadata? metadata = null, IgdbMetadata? igdbMetadata = null, IReadOnlyList<TmdbMetadata>? translations = null, bool? useLocalizedName = null)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);

        using var transaction = connection.BeginTransaction();
        long? metadataId = null;
        long? igdbMetadataId = null;
        if (igdbMetadata is not null)
        {
            igdbMetadataId = await connection.ExecuteScalarAsync<long>(new CommandDefinition(
                """
                INSERT INTO "IgdbMetadata" ("IgdbId", "Title", "Overview", "ReleaseDate", "CoverImageId", "PlatformsJson", "FetchedAt")
                VALUES (@IgdbId, @Title, @Overview, @ReleaseDate, @CoverImageId, @PlatformsJson, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                ON CONFLICT ("IgdbId") DO UPDATE SET
                    "Title" = excluded."Title", "Overview" = excluded."Overview", "ReleaseDate" = excluded."ReleaseDate",
                    "CoverImageId" = excluded."CoverImageId", "PlatformsJson" = excluded."PlatformsJson", "FetchedAt" = excluded."FetchedAt"
                RETURNING "Id";
                """, new { igdbMetadata.IgdbId, igdbMetadata.Title, igdbMetadata.Overview, igdbMetadata.ReleaseDate,
                    igdbMetadata.CoverImageId, PlatformsJson = JsonSerializer.Serialize(igdbMetadata.Platforms) },
                transaction, cancellationToken: cancellationToken));
        }
        if (metadata is not null)
        {
            foreach (var translation in translations ?? [metadata]) {
                var id = await SaveTmdbMetadataAsync(connection, translation, cancellationToken, transaction);
                if (translation.Language == metadata.Language) metadataId = id;
            }
        }

        var name = request.Name.Trim();
        var info = string.IsNullOrWhiteSpace(request.Info) ? null : request.Info.Trim();
        var command = new CommandDefinition(
            """
            INSERT INTO "Collection" ("Name", "IsNameCustom", "MediaType", "MediaFormat", "Platform", "Store", "IsPhysical", "IsCompleteBox", "Info", "CreatedAt", "TmdbMetadataId", "IgdbMetadataId")
            VALUES (@Name, @IsNameCustom, @MediaType, @MediaFormat, @Platform, @Store, @IsPhysical, @IsCompleteBox, @Info, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), @MetadataId, @IgdbMetadataId)
            RETURNING "Id", "Name", "IsNameCustom", "MediaType", "MediaFormat", "Platform", "Store", "IsPhysical", "IsCompleteBox", "Info", "CreatedAt", "UpdatedAt", "UserId", "TmdbMetadataId", "IgdbMetadataId";
            """,
            new { Name = name, IsCompleteBox = request.MediaType == MediaType.TvSeries && request.IsCompleteBox == true, IsNameCustom = metadata is null || !(useLocalizedName ?? string.Equals(name, metadata.Title.Trim(), StringComparison.Ordinal)), MediaType = (int)request.MediaType, MediaFormat = (int?)request.MediaFormat, Platform = (int?)request.Platform, Store = (int?)request.Store, IsPhysical = request.MediaType == MediaType.VideoGame ? request.IsPhysical ?? false : (bool?)null, Info = info, MetadataId = metadataId, IgdbMetadataId = igdbMetadataId },
            transaction,
            cancellationToken: cancellationToken);
        var item = await connection.QuerySingleAsync<CollectionItem>(command);
        await SaveOwnershipAsync(connection, transaction, item, request, cancellationToken);
        var complete = await WithSourceMetadataAsync(connection,
            [item with { TmdbId = metadata?.TmdbId, PosterPath = metadata?.PosterPath, IgdbId = igdbMetadata?.IgdbId, CoverImageId = igdbMetadata?.CoverImageId }],
            cancellationToken, transaction);
        transaction.Commit();
        return complete[0];
    }

    public async Task CacheTmdbMetadataAsync(TmdbMetadata metadata, CancellationToken cancellationToken)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await SaveTmdbMetadataAsync(connection, metadata, cancellationToken);
    }

    private static Task<long> SaveTmdbMetadataAsync(SqliteConnection connection, TmdbMetadata metadata, CancellationToken cancellationToken, SqliteTransaction? transaction = null)
        => connection.ExecuteScalarAsync<long>(new CommandDefinition(
"""
                INSERT INTO "TmdbMetadata" ("TmdbId", "MediaType", "Language", "Title", "OriginalTitle", "Overview", "ReleaseDate", "PosterPath", "FetchedAt", "NumberOfSeasons", "NumberOfEpisodes", "SeasonsJson")
                VALUES (@TmdbId, @MediaType, @Language, @Title, @OriginalTitle, @Overview, @ReleaseDate, @PosterPath, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), @NumberOfSeasons, @NumberOfEpisodes, @SeasonsJson)
                ON CONFLICT ("TmdbId", "MediaType", "Language") DO UPDATE SET
                    "Title" = excluded."Title", "OriginalTitle" = excluded."OriginalTitle", "Overview" = excluded."Overview",
                    "ReleaseDate" = excluded."ReleaseDate", "PosterPath" = excluded."PosterPath", "FetchedAt" = excluded."FetchedAt",
                    "NumberOfSeasons" = excluded."NumberOfSeasons", "NumberOfEpisodes" = excluded."NumberOfEpisodes", "SeasonsJson" = excluded."SeasonsJson"
                RETURNING "Id";
                """, new { metadata.TmdbId, metadata.MediaType, metadata.Language, metadata.Title, metadata.OriginalTitle, metadata.Overview, metadata.ReleaseDate, metadata.PosterPath, metadata.NumberOfSeasons, metadata.NumberOfEpisodes, SeasonsJson = JsonSerializer.Serialize(metadata.Seasons) }, transaction, cancellationToken: cancellationToken));

    private static async Task<IReadOnlyList<CollectionItem>> WithSourceMetadataAsync(
        SqliteConnection connection, IReadOnlyList<CollectionItem> items, CancellationToken cancellationToken, SqliteTransaction? transaction = null)
    {
        var tmdbIds = items.Where(item => item.TmdbMetadataId.HasValue).Select(item => item.TmdbMetadataId!.Value).Distinct().ToArray();
        var igdbIds = items.Where(item => item.IgdbMetadataId.HasValue).Select(item => item.IgdbMetadataId!.Value).Distinct().ToArray();
        var tmdb = new Dictionary<long, CollectionSourceMetadata>();
        var igdb = new Dictionary<long, CollectionSourceMetadata>();
        if (tmdbIds.Length > 0)
        {
            var rows = await connection.QueryAsync<SourceMetadataRow>(new CommandDefinition(
                """
                SELECT "Id", 'TMDB' AS "Source", "Title", "OriginalTitle", "Overview", "ReleaseDate", "Language", "FetchedAt", "NumberOfSeasons", "NumberOfEpisodes", "SeasonsJson"
                FROM "TmdbMetadata" WHERE "Id" IN @Ids;
                """, new { Ids = tmdbIds }, transaction, cancellationToken: cancellationToken));
            tmdb = rows.ToDictionary(row => row.Id, ToSourceMetadata);
        }
        if (igdbIds.Length > 0)
        {
            var rows = await connection.QueryAsync<SourceMetadataRow>(new CommandDefinition(
                """
                SELECT "Id", 'IGDB' AS "Source", "Title", "Overview", "ReleaseDate", "PlatformsJson", "FetchedAt"
                FROM "IgdbMetadata" WHERE "Id" IN @Ids;
                """, new { Ids = igdbIds }, transaction, cancellationToken: cancellationToken));
            igdb = rows.ToDictionary(row => row.Id, ToSourceMetadata);
        }
        var externalIds = items.Where(item => item.TmdbId.HasValue).Select(item => item.TmdbId!.Value).Distinct().ToArray();
        var localized = new Dictionary<(long, MediaType), IReadOnlyDictionary<string, string>>();
        if (externalIds.Length > 0)
        {
            var rows = await connection.QueryAsync<TmdbMetadata>(new CommandDefinition(
                "SELECT TmdbId, MediaType, Language, Title FROM TmdbMetadata WHERE TmdbId IN @Ids AND Language IN ('fi-FI', 'en-US');",
                new { Ids = externalIds }, transaction, cancellationToken: cancellationToken));
            localized = rows.Where(row => !string.IsNullOrWhiteSpace(row.Title)).GroupBy(row => (row.TmdbId, row.MediaType))
                .ToDictionary(group => group.Key, group => (IReadOnlyDictionary<string, string>)group.ToDictionary(row => row.Language == "fi-FI" ? "fi" : "en", row => row.Title));
        }
        var ownership = new Dictionary<long, IReadOnlyList<OwnedSeason>>();
        if (items.Count > 0) {
            var rows = await connection.QueryAsync<OwnershipRow>(new CommandDefinition(
                "SELECT CollectionItemId, SeasonNumber, MediaFormat FROM CollectionSeasons WHERE CollectionItemId IN @Ids ORDER BY SeasonNumber;",
                new { Ids = items.Select(item => item.Id).ToArray() }, transaction, cancellationToken: cancellationToken));
            ownership = rows.GroupBy(row => row.CollectionItemId).ToDictionary(group => group.Key,
                group => (IReadOnlyList<OwnedSeason>)group.Select(row => new OwnedSeason { SeasonNumber = row.SeasonNumber, MediaFormat = row.MediaFormat }).ToList());
        }
        return items.Select(item => item with
        {
            OwnedSeasons = ownership.GetValueOrDefault(item.Id) ?? [],
            LocalizedTitles = item.TmdbId is long externalId ? localized.GetValueOrDefault((externalId, item.MediaType)) : null,
            SourceMetadata = item.MediaType is MediaType.Movie or MediaType.TvSeries && item.TmdbMetadataId is long tmdbId
                ? tmdb.GetValueOrDefault(tmdbId)
                : item.MediaType == MediaType.VideoGame && item.IgdbMetadataId is long igdbId ? igdb.GetValueOrDefault(igdbId) : null
        }).ToList();
    }

    private static IReadOnlyList<TmdbSeason> ReadSeasons(string? json) {
        try { return json is null ? [] : JsonSerializer.Deserialize<List<TmdbSeason>>(json) ?? []; }
        catch (JsonException) { return []; }
    }

    private static async Task SaveOwnershipAsync(SqliteConnection connection, SqliteTransaction transaction, CollectionItem item, CreateCollectionItemRequest request, CancellationToken cancellationToken)
    {
        if (item.MediaType == MediaType.TvSeries && request.OwnedSeasons is null && request.IsCompleteBox is null) return;
        var seasons = item.MediaType == MediaType.TvSeries ? request.OwnedSeasons ?? [] : [];
        if (item.MediaType == MediaType.TvSeries && request.OwnedSeasons is null)
            seasons = (await connection.QueryAsync<OwnedSeason>(new CommandDefinition(
                "SELECT SeasonNumber, MediaFormat FROM CollectionSeasons WHERE CollectionItemId = @Id ORDER BY SeasonNumber;",
                new { item.Id }, transaction, cancellationToken: cancellationToken))).AsList();
        if (item.MediaType == MediaType.TvSeries && item.IsCompleteBox && item.TmdbMetadataId is long metadataId)
        {
            var metadata = await connection.QuerySingleAsync<SourceMetadataRow>(new CommandDefinition(
                "SELECT NumberOfSeasons, SeasonsJson FROM TmdbMetadata WHERE Id = @Id;", new { Id = metadataId }, transaction, cancellationToken: cancellationToken));
            var known = ReadSeasons(metadata.SeasonsJson).Select(season => season.SeasonNumber).ToArray();
            if (known.Length == 0 && metadata.NumberOfSeasons is > 0 and <= 1000) known = Enumerable.Range(1, metadata.NumberOfSeasons.Value).ToArray();
            seasons = known.Concat(seasons.Select(season => season.SeasonNumber)).Distinct().OrderBy(number => number)
                .Select(number => seasons.FirstOrDefault(season => season.SeasonNumber == number) ?? new OwnedSeason { SeasonNumber = number, MediaFormat = item.MediaFormat!.Value }).ToList();
        }
        await connection.ExecuteAsync(new CommandDefinition("DELETE FROM CollectionSeasons WHERE CollectionItemId = @Id;", new { item.Id }, transaction, cancellationToken: cancellationToken));
        foreach (var season in seasons)
            await connection.ExecuteAsync(new CommandDefinition("INSERT INTO CollectionSeasons (CollectionItemId, SeasonNumber, MediaFormat) VALUES (@Id, @SeasonNumber, @MediaFormat);",
                new { item.Id, season.SeasonNumber, season.MediaFormat }, transaction, cancellationToken: cancellationToken));
    }

    private sealed class OwnershipRow {
        public long CollectionItemId { get; init; }
        public int SeasonNumber { get; init; }
        public MediaFormat MediaFormat { get; init; }
    }

    private static CollectionSourceMetadata ToSourceMetadata(SourceMetadataRow row)
    {
        string[] platforms = [];
        if (row.PlatformsJson is not null)
        {
            try { platforms = JsonSerializer.Deserialize<string[]>(row.PlatformsJson)?.Where(value => !string.IsNullOrWhiteSpace(value)).ToArray() ?? []; }
            catch (JsonException) { /* A malformed optional cache field must not prevent collection access. */ }
        }
        return new()
        {
            Source = row.Source, Title = row.Title, OriginalTitle = row.OriginalTitle,
            Overview = row.Overview, ReleaseDate = row.ReleaseDate, Language = row.Language,
            Platforms = platforms, FetchedAt = row.FetchedAt, NumberOfSeasons = row.NumberOfSeasons, NumberOfEpisodes = row.NumberOfEpisodes, Seasons = ReadSeasons(row.SeasonsJson)
        };
    }

    private sealed class SourceMetadataRow
    {
        public long Id { get; init; }
        public string Source { get; init; } = "";
        public string Title { get; init; } = "";
        public string? OriginalTitle { get; init; }
        public string Overview { get; init; } = "";
        public string? ReleaseDate { get; init; }
        public string? Language { get; init; }
        public string? PlatformsJson { get; init; }
        public int? NumberOfSeasons { get; init; }
        public int? NumberOfEpisodes { get; init; }
        public string? SeasonsJson { get; init; }
        public string? FetchedAt { get; init; }
    }
}
