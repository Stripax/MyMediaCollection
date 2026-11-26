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
            SELECT c."Id", c."Name", c."IsNameCustom", c."MediaType", c."MediaFormat", c."Platform", c."Store", c."IsPhysical", c."IsCompleteBox", c."IsCollection", c."BoardGameKind", c."BaseGamesJson", c."Info", c."CreatedAt", c."UpdatedAt", c."UserId",
                   c."TmdbMetadataId", m."TmdbId", m."PosterPath", c."IgdbMetadataId", g."IgdbId", g."CoverImageId", c."BggMetadataId", b."BggId", b."ImageUrl" AS "BggImageUrl"
            FROM "Collection" c LEFT JOIN "TmdbMetadata" m ON m."Id" = c."TmdbMetadataId"
            LEFT JOIN "IgdbMetadata" g ON g."Id" = c."IgdbMetadataId"
            LEFT JOIN "BggMetadata" b ON b."Id" = c."BggMetadataId"
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
                "IsNameCustom" = CASE WHEN @NameWasEdited = 1 OR (@NameWasEdited IS NULL AND "Name" <> @Name) THEN 1 ELSE "IsNameCustom" END, "MediaType" = @MediaType, "MediaFormat" = @MediaFormat, "Platform" = @Platform, "Store" = @Store, "IsPhysical" = @IsPhysical, "IsCollection" = CASE WHEN @MediaType IN (1,2) THEN COALESCE(@IsCollection,"IsCollection") ELSE 0 END, "IsCompleteBox" = CASE WHEN @IsCollection = 1 THEN 0 WHEN @MediaType = 2 THEN COALESCE(@IsCompleteBox, "IsCompleteBox") ELSE 0 END, "Info" = @Info,
                "UpdatedAt" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                "TmdbMetadataId" = CASE WHEN "MediaType" = @MediaType THEN "TmdbMetadataId" ELSE NULL END,
                "IgdbMetadataId" = CASE WHEN "MediaType" = @MediaType THEN "IgdbMetadataId" ELSE NULL END,
                "BggMetadataId" = CASE WHEN "MediaType" = @MediaType THEN "BggMetadataId" ELSE NULL END
            WHERE "Id" = @Id
            RETURNING "Id", "Name", "IsNameCustom", "MediaType", "MediaFormat", "Platform", "Store", "IsPhysical", "IsCompleteBox", "IsCollection", "BoardGameKind", "BaseGamesJson", "Info", "CreatedAt", "UpdatedAt", "UserId", "TmdbMetadataId",
                (SELECT "TmdbId" FROM "TmdbMetadata" WHERE "Id" = "TmdbMetadataId") AS "TmdbId",
                (SELECT "PosterPath" FROM "TmdbMetadata" WHERE "Id" = "TmdbMetadataId") AS "PosterPath",
                "IgdbMetadataId",
                (SELECT "IgdbId" FROM "IgdbMetadata" WHERE "Id" = "IgdbMetadataId") AS "IgdbId",
                (SELECT "CoverImageId" FROM "IgdbMetadata" WHERE "Id" = "IgdbMetadataId") AS "CoverImageId",
                "BggMetadataId",
                (SELECT "BggId" FROM "BggMetadata" WHERE "Id" = "BggMetadataId") AS "BggId",
                (SELECT "ImageUrl" FROM "BggMetadata" WHERE "Id" = "BggMetadataId") AS "BggImageUrl";
            """,
            new
            {
                Id = id, request.IsCompleteBox, request.IsCollection, Name = request.Name.Trim(), request.NameWasEdited, MediaType = (int)request.MediaType,
                MediaFormat = (int?)request.MediaFormat, Platform = (int?)request.Platform, Store = (int?)request.Store,
                IsPhysical = request.MediaType == MediaType.VideoGame ? request.IsPhysical ?? false : (bool?)null,
                Info = string.IsNullOrWhiteSpace(request.Info) ? null : request.Info.Trim()
            },
            transaction, cancellationToken: cancellationToken);
        var item = await connection.QuerySingleOrDefaultAsync<CollectionItem>(command);
        if (item is null) return null;
        item = await SaveBoardGameDetailsAsync(connection, transaction, item, request, cancellationToken);
        item = await SaveCollectionContentsAsync(connection, transaction, item, request, cancellationToken, null);
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

    public async Task<CollectionItem> CreateAsync(CreateCollectionItemRequest request, CancellationToken cancellationToken, TmdbMetadata? metadata = null, IgdbMetadata? igdbMetadata = null, IReadOnlyList<TmdbMetadata>? translations = null, bool? useLocalizedName = null, BggMetadata? bggMetadata = null, IReadOnlyList<TmdbMetadata>? collectionMetadata = null)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);

        using var transaction = connection.BeginTransaction();
        long? metadataId = null;
        long? igdbMetadataId = null;
        long? bggMetadataId = null;
        if (bggMetadata is not null)
        {
            bggMetadataId = await connection.ExecuteScalarAsync<long>(new CommandDefinition(
                """
                INSERT INTO BggMetadata (BggId, Title, Overview, YearPublished, ImageUrl, MinPlayers, MaxPlayers, PlayingTime, MinAge, FetchedAt, IsExpansion, RequiredGamesJson)
                VALUES (@BggId, @Title, @Overview, @YearPublished, @ImageUrl, @MinPlayers, @MaxPlayers, @PlayingTime, @MinAge, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), @IsExpansion, @RequiredGamesJson)
                ON CONFLICT (BggId) DO UPDATE SET Title=excluded.Title, Overview=excluded.Overview,
                    YearPublished=excluded.YearPublished, ImageUrl=excluded.ImageUrl, MinPlayers=excluded.MinPlayers,
                    MaxPlayers=excluded.MaxPlayers, PlayingTime=excluded.PlayingTime, MinAge=excluded.MinAge, FetchedAt=excluded.FetchedAt,
                    IsExpansion=excluded.IsExpansion, RequiredGamesJson=excluded.RequiredGamesJson
                RETURNING Id;
                """, new { bggMetadata.BggId, bggMetadata.Title, bggMetadata.Overview, bggMetadata.YearPublished,
                    bggMetadata.ImageUrl, bggMetadata.MinPlayers, bggMetadata.MaxPlayers, bggMetadata.PlayingTime, bggMetadata.MinAge,
                    bggMetadata.IsExpansion, RequiredGamesJson = JsonSerializer.Serialize(bggMetadata.RequiredGames) }, transaction, cancellationToken: cancellationToken));
        }
        if (igdbMetadata is not null)
        {
            igdbMetadataId = await connection.ExecuteScalarAsync<long>(new CommandDefinition(
                """
                INSERT INTO "IgdbMetadata" ("IgdbId", "Title", "Overview", "ReleaseDate", "CoverImageId", "PlatformsJson", "FetchedAt", "SourceUrl")
                VALUES (@IgdbId, @Title, @Overview, @ReleaseDate, @CoverImageId, @PlatformsJson, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), @SourceUrl)
                ON CONFLICT ("IgdbId") DO UPDATE SET
                    "Title" = excluded."Title", "Overview" = excluded."Overview", "ReleaseDate" = excluded."ReleaseDate",
                    "CoverImageId" = excluded."CoverImageId", "PlatformsJson" = excluded."PlatformsJson", "FetchedAt" = excluded."FetchedAt", "SourceUrl" = COALESCE(excluded."SourceUrl", "IgdbMetadata"."SourceUrl")
                RETURNING "Id";
                """, new { igdbMetadata.IgdbId, igdbMetadata.Title, igdbMetadata.Overview, igdbMetadata.ReleaseDate,
                    igdbMetadata.CoverImageId, igdbMetadata.SourceUrl, PlatformsJson = JsonSerializer.Serialize(igdbMetadata.Platforms) },
                transaction, cancellationToken: cancellationToken));
        }
        if (metadata is not null)
        {
            foreach (var translation in translations ?? [metadata]) {
                var id = await SaveTmdbMetadataAsync(connection, translation, cancellationToken, transaction);
                if (translation.Language == metadata.Language && translation.TmdbId == metadata.TmdbId && translation.MediaType == metadata.MediaType) metadataId = id;
            }
        }

        var name = request.Name.Trim();
        var info = string.IsNullOrWhiteSpace(request.Info) ? null : request.Info.Trim();
        var command = new CommandDefinition(
            """
            INSERT INTO "Collection" ("Name", "IsNameCustom", "MediaType", "MediaFormat", "Platform", "Store", "IsPhysical", "IsCompleteBox", "Info", "CreatedAt", "TmdbMetadataId", "IgdbMetadataId", "BggMetadataId", "IsCollection")
            VALUES (@Name, @IsNameCustom, @MediaType, @MediaFormat, @Platform, @Store, @IsPhysical, @IsCompleteBox, @Info, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), @MetadataId, @IgdbMetadataId, @BggMetadataId, @IsCollection)
            RETURNING "Id", "Name", "IsNameCustom", "MediaType", "MediaFormat", "Platform", "Store", "IsPhysical", "IsCompleteBox", "IsCollection", "BoardGameKind", "BaseGamesJson", "Info", "CreatedAt", "UpdatedAt", "UserId", "TmdbMetadataId", "IgdbMetadataId", "BggMetadataId";
            """,
            new { Name = name, IsCompleteBox = request.MediaType == MediaType.TvSeries && request.IsCompleteBox == true, IsCollection = request.IsCollection == true, IsNameCustom = request.IsCollection == true || metadata is null || !(useLocalizedName ?? string.Equals(name, metadata.Title.Trim(), StringComparison.Ordinal)), MediaType = (int)request.MediaType, MediaFormat = (int?)request.MediaFormat, Platform = (int?)request.Platform, Store = (int?)request.Store, IsPhysical = request.MediaType == MediaType.VideoGame ? request.IsPhysical ?? false : (bool?)null, Info = info, MetadataId = metadataId, IgdbMetadataId = igdbMetadataId, BggMetadataId = bggMetadataId },
            transaction,
            cancellationToken: cancellationToken);
        var item = await connection.QuerySingleAsync<CollectionItem>(command);
        item = item with { BggId = bggMetadata?.BggId };
        item = await SaveBoardGameDetailsAsync(connection, transaction, item, request, cancellationToken);
        item = await SaveCollectionContentsAsync(connection, transaction, item, request, cancellationToken, collectionMetadata);
        await SaveOwnershipAsync(connection, transaction, item, request, cancellationToken);
        var complete = await WithSourceMetadataAsync(connection,
            [item with { TmdbId = metadata?.TmdbId, PosterPath = metadata?.PosterPath, IgdbId = igdbMetadata?.IgdbId, CoverImageId = igdbMetadata?.CoverImageId, BggId = bggMetadata?.BggId, BggImageUrl = bggMetadata?.ImageUrl }],
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

    public async Task CacheIgdbSourceUrlAsync(long igdbId, string url, CancellationToken cancellationToken)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(
            "UPDATE IgdbMetadata SET SourceUrl = @Url WHERE IgdbId = @IgdbId;",
            new { Url = url, IgdbId = igdbId }, cancellationToken: cancellationToken));
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
        if (items.Count > 0)
        {
            var contents = await connection.QueryAsync<ContentRow>(new CommandDefinition(
                """
                SELECT c.CollectionItemId,c.Name,c.TmdbMetadataId,m.TmdbId,m.PosterPath
                FROM CollectionContents c LEFT JOIN TmdbMetadata m ON m.Id=c.TmdbMetadataId
                WHERE c.CollectionItemId IN @Ids ORDER BY c.Position;
                """, new { Ids = items.Select(item => item.Id).ToArray() }, transaction, cancellationToken: cancellationToken));
            var grouped = contents.GroupBy(row => row.CollectionItemId).ToDictionary(group => group.Key,
                group => (IReadOnlyList<CollectionContent>)group.Select(row => new CollectionContent { Name=row.Name, TmdbId=row.TmdbId, TmdbMetadataId=row.TmdbMetadataId, PosterPath=row.PosterPath }).ToArray());
            items = items.Select(item => item with { CollectionContents = item.IsCollection ? grouped.GetValueOrDefault(item.Id) ?? [] : [] }).ToArray();
        }
        var tmdbIds = items.SelectMany(item => item.CollectionContents.Select(entry => entry.TmdbMetadataId).Append(item.TmdbMetadataId))
            .OfType<long>().Distinct().ToArray();
        var igdbIds = items.Where(item => item.IgdbMetadataId.HasValue).Select(item => item.IgdbMetadataId!.Value).Distinct().ToArray();
        var tmdb = new Dictionary<long, CollectionSourceMetadata>();
        var igdb = new Dictionary<long, CollectionSourceMetadata>();
        var bggIds = items.Where(item => item.BggMetadataId.HasValue).Select(item => item.BggMetadataId!.Value).Distinct().ToArray();
        var bgg = new Dictionary<long, CollectionSourceMetadata>();
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
                SELECT "Id", 'IGDB' AS "Source", "Title", "Overview", "ReleaseDate", "PlatformsJson", "FetchedAt", "SourceUrl"
                FROM "IgdbMetadata" WHERE "Id" IN @Ids;
                """, new { Ids = igdbIds }, transaction, cancellationToken: cancellationToken));
            igdb = rows.ToDictionary(row => row.Id, ToSourceMetadata);
        }
        if (bggIds.Length > 0)
        {
            var rows = await connection.QueryAsync<SourceMetadataRow>(new CommandDefinition(
                """
                SELECT Id, 'BGG' AS Source, 'https://boardgamegeek.com/boardgame/' || BggId AS SourceUrl,
                    Title, Overview, YearPublished, MinPlayers, MaxPlayers, PlayingTime, MinAge, FetchedAt, IsExpansion, RequiredGamesJson
                FROM BggMetadata WHERE Id IN @Ids;
                """, new { Ids = bggIds }, transaction, cancellationToken: cancellationToken));
            bgg = rows.ToDictionary(row => row.Id, ToSourceMetadata);
        }
        var externalIds = items.SelectMany(item => item.CollectionContents.Select(entry => entry.TmdbId).Append(item.TmdbId))
            .OfType<long>().Distinct().ToArray();
        var localized = new Dictionary<(long, MediaType), IReadOnlyDictionary<string, string>>();
        var overviews = new Dictionary<(long, MediaType), IReadOnlyDictionary<string, string>>();
        if (externalIds.Length > 0)
        {
            var rows = await connection.QueryAsync<TmdbMetadata>(new CommandDefinition(
                "SELECT TmdbId, MediaType, Language, Title, Overview FROM TmdbMetadata WHERE TmdbId IN @Ids AND Language IN ('fi-FI', 'en-US');",
                new { Ids = externalIds }, transaction, cancellationToken: cancellationToken));
            localized = rows.Where(row => !string.IsNullOrWhiteSpace(row.Title)).GroupBy(row => (row.TmdbId, row.MediaType))
                .ToDictionary(group => group.Key, group => (IReadOnlyDictionary<string, string>)group.ToDictionary(row => row.Language == "fi-FI" ? "fi" : "en", row => row.Title));
            overviews = rows.GroupBy(row => (row.TmdbId, row.MediaType))
                .ToDictionary(group => group.Key, group => (IReadOnlyDictionary<string, string>)group.ToDictionary(row => row.Language == "fi-FI" ? "fi" : "en", row => row.Overview));
        }
        var ownership = new Dictionary<long, IReadOnlyList<OwnedSeason>>();
        if (items.Count > 0) {
            var rows = await connection.QueryAsync<OwnershipRow>(new CommandDefinition(
                "SELECT CollectionItemId, SeasonNumber, MediaFormat FROM CollectionSeasons WHERE CollectionItemId IN @Ids ORDER BY SeasonNumber;",
                new { Ids = items.Select(item => item.Id).ToArray() }, transaction, cancellationToken: cancellationToken));
            ownership = rows.GroupBy(row => row.CollectionItemId).ToDictionary(group => group.Key,
                group => (IReadOnlyList<OwnedSeason>)group.Select(row => new OwnedSeason { SeasonNumber = row.SeasonNumber, MediaFormat = row.MediaFormat }).ToList());
        }
        var enriched = items.Select(item => item with
        {
            CollectionContents = item.CollectionContents.Select(entry => entry with
            {
                SourceMetadata = entry.TmdbMetadataId is long memberId && tmdb.TryGetValue(memberId, out var member)
                    ? member with { LocalizedOverviews = entry.TmdbId is long memberExternalId ? overviews.GetValueOrDefault((memberExternalId, item.MediaType)) : null }
                    : null
            }).ToArray(),
            OwnedSeasons = ownership.GetValueOrDefault(item.Id) ?? [],
            LocalizedTitles = item.TmdbId is long externalId ? localized.GetValueOrDefault((externalId, item.MediaType)) : null,
            SourceMetadata = item.MediaType is MediaType.Movie or MediaType.TvSeries && item.TmdbMetadataId is long tmdbId
                ? tmdb.GetValueOrDefault(tmdbId) is { } metadata
                    ? metadata with { LocalizedOverviews = item.TmdbId is long id ? overviews.GetValueOrDefault((id, item.MediaType)) : null }
                    : null
                : item.MediaType == MediaType.VideoGame && item.IgdbMetadataId is long igdbId ? igdb.GetValueOrDefault(igdbId)
                : item.MediaType == MediaType.BoardGame && item.BggMetadataId is long bggId ? bgg.GetValueOrDefault(bggId) : null
        }).ToList();
        enriched = enriched.Select(item => item with
        {
            BoardGameKind = item.MediaType != MediaType.BoardGame ? null : item.BoardGameKind ??
                (item.SourceMetadata?.IsExpansion is bool expansion ? expansion ? BoardGameKind.Expansion : BoardGameKind.BaseGame : item.BggMetadataId is null ? BoardGameKind.BaseGame : null),
            BaseGames = item.MediaType != MediaType.BoardGame ? [] : item.BaseGamesJson is not null ? ReadBaseGames(item.BaseGamesJson) :
                item.SourceMetadata?.RequiredGames.Select(game => new BoardGameReference { BggId = game.BggId, Name = game.Name }).ToArray() ?? []
        }).Select(item => item.BoardGameKind is BoardGameKind.Expansion or BoardGameKind.Other ? item : item with { BaseGames = [] }).ToList();
        var parentIds = enriched.SelectMany(item => item.BaseGames).Where(game => game.CollectionItemId.HasValue).Select(game => game.CollectionItemId!.Value).Distinct().ToArray();
        var parents = parentIds.Length == 0 ? new Dictionary<long, ParentGameRow>() :
            (await connection.QueryAsync<ParentGameRow>(new CommandDefinition(
                "SELECT c.Id, c.Name, c.MediaType, b.BggId FROM Collection c LEFT JOIN BggMetadata b ON b.Id=c.BggMetadataId WHERE c.Id IN @Ids;",
                new { Ids = parentIds }, transaction, cancellationToken: cancellationToken))).ToDictionary(parent => parent.Id);
        return enriched.Select(item => item with { BaseGames = item.BaseGames.Select(game =>
            game.CollectionItemId is long parentId && parents.TryGetValue(parentId, out var parent) && parent.MediaType == MediaType.BoardGame && parentId != item.Id
                ? game with { Name = parent.Name, BggId = parent.BggId }
                : game with { CollectionItemId = null }).ToArray() }).ToList();
    }

    private sealed class ParentGameRow
    {
        public long Id { get; init; }
        public string Name { get; init; } = "";
        public MediaType MediaType { get; init; }
        public long? BggId { get; init; }
    }

    private sealed class ContentRow
    {
        public long CollectionItemId { get; init; }
        public string Name { get; init; } = "";
        public long? TmdbMetadataId { get; init; }
        public long? TmdbId { get; init; }
        public string? PosterPath { get; init; }
    }

    private static async Task<CollectionItem> SaveCollectionContentsAsync(SqliteConnection connection, SqliteTransaction transaction, CollectionItem item,
        CreateCollectionItemRequest request, CancellationToken cancellationToken, IReadOnlyList<TmdbMetadata>? canonical)
    {
        if (!item.IsCollection)
        {
            if (request.CoverTmdbId.HasValue) throw new CollectionValidationException("Select a cover from the collection contents.");
            if (request.CollectionContents?.Count > 0) throw new CollectionValidationException("Enable collection before adding contents.");
            await connection.ExecuteAsync(new CommandDefinition("DELETE FROM CollectionContents WHERE CollectionItemId=@Id;", new { item.Id }, transaction, cancellationToken: cancellationToken));
            return item;
        }
        if (item.MediaType is not (MediaType.Movie or MediaType.TvSeries) || request.IsCompleteBox == true || request.OwnedSeasons?.Count > 0)
            throw new CollectionValidationException("Collections use one shared movie or TV format.");
        if (canonical is null && request.CollectionContents is null)
        {
            var count = await connection.ExecuteScalarAsync<int>(new CommandDefinition("SELECT COUNT(*) FROM CollectionContents WHERE CollectionItemId=@Id;", new { item.Id }, transaction, cancellationToken: cancellationToken));
            if (count == 0) throw new CollectionValidationException("Add at least one title to the collection.");
            return item;
        }
        var entries = new List<CollectionContent>();
        if (canonical is not null)
        {
            foreach (var metadata in canonical)
            {
                var metadataId = await connection.ExecuteScalarAsync<long>(new CommandDefinition(
                    "SELECT Id FROM TmdbMetadata WHERE TmdbId=@TmdbId AND MediaType=@MediaType AND Language=@Language;", metadata, transaction, cancellationToken: cancellationToken));
                entries.Add(new CollectionContent { Name=metadata.Title, TmdbId=metadata.TmdbId, TmdbMetadataId=metadataId, PosterPath=metadata.PosterPath });
            }
        }
        else
        {
            var existing = (await connection.QueryAsync<ContentRow>(new CommandDefinition(
                "SELECT c.Name,c.TmdbMetadataId,m.TmdbId,m.PosterPath FROM CollectionContents c LEFT JOIN TmdbMetadata m ON m.Id=c.TmdbMetadataId WHERE c.CollectionItemId=@Id;",
                new { item.Id }, transaction, cancellationToken: cancellationToken))).ToList();
            foreach (var entry in request.CollectionContents ?? [])
            {
                var saved = entry.TmdbId is long id ? existing.FirstOrDefault(row => row.TmdbId == id) : null;
                if (entry.TmdbId.HasValue && saved is null) throw new CollectionValidationException("Use TMDB import to attach new source titles.");
                entries.Add(new CollectionContent { Name=entry.Name.Trim(), TmdbId=saved?.TmdbId, TmdbMetadataId=saved?.TmdbMetadataId, PosterPath=saved?.PosterPath });
            }
        }
        if (entries.Count is < 1 or > 100) throw new CollectionValidationException("A collection must contain between 1 and 100 titles.");
        var cover = request.CoverTmdbId is long coverId
            ? entries.FirstOrDefault(entry => entry.TmdbId == coverId)
                ?? throw new CollectionValidationException("Select a cover from the collection contents.")
            : entries[0];
        await connection.ExecuteAsync(new CommandDefinition("DELETE FROM CollectionContents WHERE CollectionItemId=@Id;", new { item.Id }, transaction, cancellationToken: cancellationToken));
        for (var index = 0; index < entries.Count; index++)
            await connection.ExecuteAsync(new CommandDefinition("INSERT INTO CollectionContents (CollectionItemId,Position,Name,TmdbMetadataId) VALUES (@Id,@Position,@Name,@TmdbMetadataId);",
                new { item.Id, Position=index, entries[index].Name, entries[index].TmdbMetadataId }, transaction, cancellationToken: cancellationToken));
        await connection.ExecuteAsync(new CommandDefinition("UPDATE Collection SET TmdbMetadataId=@TmdbMetadataId,IsNameCustom=1,IsCompleteBox=0 WHERE Id=@Id;",
            new { item.Id, cover.TmdbMetadataId }, transaction, cancellationToken: cancellationToken));
        return item with { TmdbMetadataId=cover.TmdbMetadataId, TmdbId=cover.TmdbId, PosterPath=cover.PosterPath, IsNameCustom=true, IsCompleteBox=false };
    }

    private static IReadOnlyList<BoardGameReference> ReadBaseGames(string json)
    {
        try { return (JsonSerializer.Deserialize<List<BoardGameReference?>>(json) ?? []).OfType<BoardGameReference>()
            .Where(game => !string.IsNullOrWhiteSpace(game.Name)).ToArray(); }
        catch (JsonException) { return []; }
    }

    private static async Task<CollectionItem> SaveBoardGameDetailsAsync(SqliteConnection connection, SqliteTransaction transaction, CollectionItem item, CreateCollectionItemRequest request, CancellationToken cancellationToken)
    {
        var kind = item.MediaType == MediaType.BoardGame ? request.BoardGameKind ?? item.BoardGameKind : null;
        if (item.MediaType == MediaType.BoardGame && kind is null && item.BggMetadataId is null) kind = BoardGameKind.BaseGame;
        if (item.MediaType == MediaType.BoardGame && kind is null && item.BggMetadataId is long metadataId && request.BaseGames is not null)
        {
            var expansion = await connection.QuerySingleAsync<bool?>(new CommandDefinition("SELECT IsExpansion FROM BggMetadata WHERE Id=@Id;", new { Id = metadataId }, transaction, cancellationToken: cancellationToken));
            kind = expansion is bool isExpansion ? isExpansion ? BoardGameKind.Expansion : BoardGameKind.BaseGame : null;
        }
        var json = item.BaseGamesJson;
        if (item.MediaType != MediaType.BoardGame || (kind is not null && kind is not (BoardGameKind.Expansion or BoardGameKind.Other))) json = null;
        if (request.BaseGames is not null && request.BaseGames.Count > 0 && kind is not (BoardGameKind.Expansion or BoardGameKind.Other))
            throw new CollectionValidationException("Only expansions and other related items can have base games.");
        if (item.MediaType == MediaType.BoardGame && (kind is BoardGameKind.Expansion or BoardGameKind.Other) && request.BaseGames is not null)
        {
            var games = new List<BoardGameReference>();
            foreach (var reference in request.BaseGames)
            {
                var game = reference with { Name = reference.Name?.Trim() ?? "" };
                if (game.CollectionItemId is long parentId)
                {
                    if (parentId == item.Id) throw new CollectionValidationException("An item cannot require itself.");
                    var parent = await connection.QuerySingleOrDefaultAsync<ParentGameRow>(new CommandDefinition(
                        "SELECT c.Id,c.Name,c.MediaType,b.BggId FROM Collection c LEFT JOIN BggMetadata b ON b.Id=c.BggMetadataId WHERE c.Id=@Id;",
                        new { Id = parentId }, transaction, cancellationToken: cancellationToken));
                    if (parent?.MediaType != MediaType.BoardGame) throw new CollectionValidationException("Select an existing board or card game.");
                    game = game with { Name = parent.Name, BggId = parent.BggId };
                }
                else if (game.BggId.HasValue && game.BggId == item.BggId) throw new CollectionValidationException("An item cannot require itself.");
                if (!games.Any(existing => existing == game)) games.Add(game);
            }
            json = JsonSerializer.Serialize(games);
        }
        await connection.ExecuteAsync(new CommandDefinition("UPDATE Collection SET BoardGameKind=@Kind, BaseGamesJson=@Json WHERE Id=@Id;",
            new { Kind = (int?)kind, Json = json, item.Id }, transaction, cancellationToken: cancellationToken));
        return item with { BoardGameKind = kind, BaseGamesJson = json };
    }

    private static IReadOnlyList<BggGameReference> ReadRequiredGames(string? json)
    {
        try
        {
            return (JsonSerializer.Deserialize<List<BggGameReference?>>(json ?? "[]") ?? [])
                .OfType<BggGameReference>().Where(game => game.BggId > 0 && !string.IsNullOrWhiteSpace(game.Name))
                .DistinctBy(game => game.BggId).ToArray();
        }
        catch (JsonException) { return []; }
    }

    public async Task CacheBggExpansionDetailsAsync(BggMetadata metadata, CancellationToken cancellationToken)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await connection.ExecuteAsync(new CommandDefinition(
            "UPDATE BggMetadata SET IsExpansion = @IsExpansion, RequiredGamesJson = @RequiredGamesJson WHERE BggId = @BggId;",
            new { metadata.BggId, metadata.IsExpansion, RequiredGamesJson = JsonSerializer.Serialize(metadata.RequiredGames) }, cancellationToken: cancellationToken));
    }

    private static IReadOnlyList<TmdbSeason> ReadSeasons(string? json) {
        try { return json is null ? [] : JsonSerializer.Deserialize<List<TmdbSeason>>(json) ?? []; }
        catch (JsonException) { return []; }
    }

    private static async Task SaveOwnershipAsync(SqliteConnection connection, SqliteTransaction transaction, CollectionItem item, CreateCollectionItemRequest request, CancellationToken cancellationToken)
    {
        if (item.IsCollection)
        {
            await connection.ExecuteAsync(new CommandDefinition("DELETE FROM CollectionSeasons WHERE CollectionItemId=@Id;", new { item.Id }, transaction, cancellationToken: cancellationToken));
            return;
        }
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
            Source = row.Source, SourceUrl = row.SourceUrl, Title = row.Title, OriginalTitle = row.OriginalTitle,
            Overview = row.Overview, ReleaseDate = row.ReleaseDate, Language = row.Language,
            YearPublished = row.YearPublished, MinPlayers = row.MinPlayers, MaxPlayers = row.MaxPlayers, PlayingTime = row.PlayingTime, MinAge = row.MinAge,
            IsExpansion = row.IsExpansion, RequiredGames = ReadRequiredGames(row.RequiredGamesJson),
            Platforms = platforms, FetchedAt = row.FetchedAt, NumberOfSeasons = row.NumberOfSeasons, NumberOfEpisodes = row.NumberOfEpisodes, Seasons = ReadSeasons(row.SeasonsJson)
        };
    }

    private sealed class SourceMetadataRow
    {
        public long Id { get; init; }
        public string Source { get; init; } = "";
        public string? SourceUrl { get; init; }
        public string Title { get; init; } = "";
        public string? OriginalTitle { get; init; }
        public string Overview { get; init; } = "";
        public string? ReleaseDate { get; init; }
        public int? YearPublished { get; init; }
        public int? MinPlayers { get; init; }
        public int? MaxPlayers { get; init; }
        public int? PlayingTime { get; init; }
        public int? MinAge { get; init; }
        public bool? IsExpansion { get; init; }
        public string? RequiredGamesJson { get; init; }
        public string? Language { get; init; }
        public string? PlatformsJson { get; init; }
        public int? NumberOfSeasons { get; init; }
        public int? NumberOfEpisodes { get; init; }
        public string? SeasonsJson { get; init; }
        public string? FetchedAt { get; init; }
    }
}
