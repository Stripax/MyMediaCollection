using Microsoft.Extensions.Caching.Memory;
using MyMediaCollection.API.Data;
using MyMediaCollection.API.Models;

namespace MyMediaCollection.API.Services;

public sealed class BggExpansionService(BggClient bgg, CollectionRepository repository, IMemoryCache cache, IConfiguration configuration)
{
    public async Task<bool> EnsureDetailsAsync(IReadOnlyList<CollectionItem> items, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(configuration["Bgg:ApiKey"])) return false;
        var changed = false;
        foreach (var id in items.Where(item => item.MediaType == MediaType.BoardGame && item.BggId is > 0 and <= int.MaxValue &&
                     item.SourceMetadata?.IsExpansion is null).Select(item => item.BggId!.Value).Distinct())
        {
            var key = $"bgg-expansion-retry:{id}";
            if (cache.TryGetValue(key, out _)) continue;
            try
            {
                var metadata = await bgg.DetailsAsync((int)id, cancellationToken);
                await repository.CacheBggExpansionDetailsAsync(metadata, cancellationToken);
                changed = true;
            }
            catch (BggException) { cache.Set(key, true, TimeSpan.FromMinutes(2)); }
        }
        return changed;
    }
}
