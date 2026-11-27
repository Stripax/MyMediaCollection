using System.Text.Json;
using Dapper;
using Microsoft.Data.Sqlite;
using MyMediaCollection.API.Models;

namespace MyMediaCollection.API.Data;

public sealed partial class CollectionRepository
{
    public async Task<(CollectionItem? Item, string? Error)> DeleteVersionAsync(long itemId, long versionId,
        string deletionToken, CancellationToken cancellationToken)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        using var transaction = connection.BeginTransaction(deferred: false);
        var item = (await ReadItemsAsync(connection, cancellationToken, transaction)).FirstOrDefault(item => item.Id == itemId);
        var version = item?.Versions.FirstOrDefault(version => version.Id == versionId);
        if (item is null || version is null || item.MediaType is not (MediaType.Movie or MediaType.TvSeries or MediaType.VideoGame)) return (null, null);
        if (version.DeletionToken != deletionToken) return (null, "collection_version_changed");
        if (item.Versions.Count <= 1) return (null, "collection_last_version");

        if (versionId == 0)
        {
            var replacement = item.Versions.First(version => version.Id > 0);
            await connection.ExecuteAsync(new CommandDefinition(
                """
                UPDATE Collection SET MediaFormat=@MediaFormat, Platform=@Platform, Store=@Store,
                    IsPhysical=@IsPhysical, IsCompleteBox=@IsCompleteBox, Info=@Info,
                    UpdatedAt=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE Id=@ItemId;
                DELETE FROM CollectionSeasons WHERE CollectionItemId=@ItemId;
                DELETE FROM CollectionVersions WHERE Id=@Id AND CollectionItemId=@ItemId;
                """, new { ItemId = itemId, replacement.Id, replacement.MediaFormat, replacement.Platform,
                    replacement.Store, replacement.IsPhysical, replacement.IsCompleteBox, replacement.Info }, transaction,
                cancellationToken: cancellationToken));
            foreach (var season in replacement.OwnedSeasons)
                await connection.ExecuteAsync(new CommandDefinition(
                    "INSERT INTO CollectionSeasons (CollectionItemId, SeasonNumber, MediaFormat) VALUES (@ItemId, @SeasonNumber, @MediaFormat);",
                    new { ItemId = itemId, season.SeasonNumber, season.MediaFormat }, transaction, cancellationToken: cancellationToken));
        }
        else
            await connection.ExecuteAsync(new CommandDefinition(
                """
                DELETE FROM CollectionVersions WHERE Id=@VersionId AND CollectionItemId=@ItemId;
                UPDATE Collection SET UpdatedAt=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE Id=@ItemId;
                """, new { ItemId = itemId, VersionId = versionId }, transaction, cancellationToken: cancellationToken));

        var result = (await ReadItemsAsync(connection, cancellationToken, transaction)).Single(item => item.Id == itemId);
        transaction.Commit();
        return (result, null);
    }

    private static async Task<IReadOnlyList<CollectionItem>> AttachVersionsAsync(SqliteConnection connection,
        SqliteTransaction? transaction, IReadOnlyList<CollectionItem> items, CancellationToken cancellationToken)
    {
        if (items.Count == 0) return items;
        var versions = (await connection.QueryAsync<CollectionVersion>(new CommandDefinition(
            "SELECT * FROM CollectionVersions WHERE CollectionItemId IN @Ids ORDER BY Id;",
            new { Ids = items.Select(item => item.Id).ToArray() }, transaction, cancellationToken: cancellationToken)))
            .Select(version => version with { OwnedSeasons = JsonSerializer.Deserialize<OwnedSeason[]>(version.OwnedSeasonsJson ?? "[]") ?? [] })
            .ToLookup(version => version.CollectionItemId);
        return items.Select(item => item with { Versions = new[] { CollectionVersion.Original(item) }.Concat(versions[item.Id]).ToArray() }).ToArray();
    }

    private static async Task<CollectionItem> MergeCreatedAsync(SqliteConnection connection, SqliteTransaction transaction,
        CollectionItem item, CancellationToken cancellationToken)
    {
        var candidates = await ReadItemsAsync(connection, cancellationToken, transaction, item.MediaType);
        var related = candidates.Where(candidate => CollectionDuplicates.SameItem(item, candidate)).ToArray();
        var duplicate = related.FirstOrDefault(candidate => CollectionDuplicates.Matches(item, candidate));
        if (duplicate is not null) throw new DuplicateCollectionItemException(duplicate);
        if (item.MediaType is not (MediaType.Movie or MediaType.TvSeries or MediaType.VideoGame) || related.Length == 0) return item;
        var existing = related.OrderBy(candidate => candidate.Id).First();
        foreach (var version in item.Versions)
            await connection.ExecuteAsync(new CommandDefinition(
                """
                INSERT INTO CollectionVersions (CollectionItemId, MediaFormat, Platform, Store, IsPhysical, IsCompleteBox, OwnedSeasonsJson, Info, CreatedAt, UpdatedAt)
                VALUES (@CollectionItemId, @MediaFormat, @Platform, @Store, @IsPhysical, @IsCompleteBox, @OwnedSeasonsJson, @Info, @CreatedAt, @UpdatedAt);
                """,
                new { CollectionItemId = existing.Id, version.MediaFormat, version.Platform, version.Store, version.IsPhysical,
                    version.IsCompleteBox, OwnedSeasonsJson = JsonSerializer.Serialize(version.OwnedSeasons), version.Info, version.CreatedAt, version.UpdatedAt },
                transaction, cancellationToken: cancellationToken));
        await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE Collection SET UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                TmdbMetadataId = COALESCE(TmdbMetadataId, @TmdbMetadataId),
                IgdbMetadataId = COALESCE(IgdbMetadataId, @IgdbMetadataId)
            WHERE Id = @CollectionItemId;
            DELETE FROM Collection WHERE Id = @Id;
            """,
            new { CollectionItemId = existing.Id, item.Id, item.TmdbMetadataId, item.IgdbMetadataId }, transaction, cancellationToken: cancellationToken));
        return (await ReadItemsAsync(connection, cancellationToken, transaction, item.MediaType)).Single(candidate => candidate.Id == existing.Id) with { VersionAdded = true };
    }

    public async Task<int> ConsolidateVersionsAsync(CancellationToken cancellationToken)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        using var transaction = connection.BeginTransaction(deferred: false);
        var merged = 0;
        var items = (await ReadItemsAsync(connection, cancellationToken, transaction)).ToList();
        var ids = items.Where(item => item.MediaType is MediaType.Movie or MediaType.TvSeries or MediaType.VideoGame)
            .Select(item => item.Id).OrderDescending().ToArray();
        foreach (var id in ids)
        {
            var item = items.FirstOrDefault(item => item.Id == id);
            if (item is null) continue;
            var related = items.Where(other => CollectionDuplicates.SameItem(item, other)).ToArray();
            // Preserve historical exact duplicates rather than silently discarding any copy.
            if (related.Length == 0 || related.Any(other => CollectionDuplicates.Matches(item, other))) continue;
            var saved = await MergeCreatedAsync(connection, transaction, item, cancellationToken);
            items.RemoveAll(candidate => candidate.Id == item.Id || candidate.Id == saved.Id);
            items.Add(saved);
            merged++;
        }
        transaction.Commit();
        return merged;
    }

    private static async Task SaveVersionAsync(SqliteConnection connection, SqliteTransaction transaction, CollectionItem item,
        CreateCollectionItemRequest request, CancellationToken cancellationToken)
    {
        var existing = item.Versions.Single(version => version.Id == request.VersionId);
        var completeBox = request.IsCompleteBox ?? existing.IsCompleteBox;
        IReadOnlyList<OwnedSeason> seasons = request.OwnedSeasons ?? existing.OwnedSeasons;
        if (item.MediaType != MediaType.TvSeries || item.IsCollection) seasons = [];
        else if (completeBox)
        {
            var known = item.SourceMetadata?.Seasons.Select(season => season.SeasonNumber).ToArray() ?? [];
            if (known.Length == 0 && item.SourceMetadata?.NumberOfSeasons is > 0 and <= 1000)
                known = Enumerable.Range(1, item.SourceMetadata.NumberOfSeasons.Value).ToArray();
            seasons = known.Concat(seasons.Select(season => season.SeasonNumber)).Distinct().Order()
                .Select(number => seasons.FirstOrDefault(season => season.SeasonNumber == number)
                    ?? new OwnedSeason { SeasonNumber = number, MediaFormat = request.MediaFormat!.Value }).ToArray();
        }
        await connection.ExecuteAsync(new CommandDefinition(
            """
            UPDATE CollectionVersions SET MediaFormat=@MediaFormat, Platform=@Platform, Store=@Store,
                IsPhysical=@IsPhysical, IsCompleteBox=@IsCompleteBox, OwnedSeasonsJson=@OwnedSeasonsJson, Info=@Info,
                UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE CollectionItemId=@ItemId AND Id=@VersionId;
            """,
            new { ItemId = item.Id, request.VersionId, request.MediaFormat, request.Platform,
                Store = request.IsPhysical == true ? null : request.Store,
                IsPhysical = request.MediaType == MediaType.VideoGame ? request.IsPhysical ?? false : (bool?)null,
                IsCompleteBox = completeBox,
                OwnedSeasonsJson = JsonSerializer.Serialize(seasons),
                Info = string.IsNullOrWhiteSpace(request.Info) ? null : request.Info.Trim() }, transaction, cancellationToken: cancellationToken));
    }
}
