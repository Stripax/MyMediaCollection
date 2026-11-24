using Microsoft.Extensions.Caching.Memory;
using MyMediaCollection.API.Data;
using MyMediaCollection.API.Models;

namespace MyMediaCollection.API.Services;

public sealed class IgdbSourceService(IgdbClient igdb, CollectionRepository repository, IMemoryCache cache, IConfiguration configuration)
{
    public async Task<bool> EnsureUrlsAsync(IReadOnlyList<CollectionItem> items, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(configuration["Igdb:ClientId"]) || string.IsNullOrWhiteSpace(configuration["Igdb:ClientSecret"])) return false;
        var changed = false;
        foreach (var id in items.Where(item => item.MediaType == MediaType.VideoGame && item.IgdbId is > 0 and <= int.MaxValue &&
                     string.IsNullOrWhiteSpace(item.SourceMetadata?.SourceUrl)).Select(item => item.IgdbId!.Value).Distinct())
        {
            var key = $"igdb-source-retry:{id}";
            if (cache.TryGetValue(key, out _)) continue;
            try
            {
                var metadata = await igdb.DetailsAsync(checked((int)id), cancellationToken);
                if (metadata.SourceUrl is { } url)
                {
                    await repository.CacheIgdbSourceUrlAsync(id, url, cancellationToken);
                    changed = true;
                }
                else cache.Set(key, true, TimeSpan.FromMinutes(5));
            }
            catch (IgdbException) { cache.Set(key, true, TimeSpan.FromMinutes(2)); }
        }
        return changed;
    }
}
