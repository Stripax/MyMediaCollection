using Microsoft.Extensions.Caching.Memory;
using MyMediaCollection.API.Data;
using MyMediaCollection.API.Models;

namespace MyMediaCollection.API.Services;

public sealed class TmdbTitleService(TmdbClient tmdb, CollectionRepository repository, IMemoryCache cache, IConfiguration configuration)
{
    public async Task<bool> EnsureTitlesAsync(IReadOnlyList<CollectionItem> items, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(configuration["Tmdb:ApiKey"]) && string.IsNullOrWhiteSpace(configuration["Tmdb:ReadAccessToken"])) return false;
        var missing = items.Where(item => item.TmdbId is > 0 && item.MediaType is MediaType.Movie or MediaType.TvSeries)
            .SelectMany(item => new[] { (Code: "fi", Language: "fi-FI"), (Code: "en", Language: "en-US") }
                .Where(language => item.LocalizedTitles?.ContainsKey(language.Code) != true ||
                    (item.MediaType == MediaType.TvSeries && (item.SourceMetadata?.NumberOfSeasons is null || item.SourceMetadata?.NumberOfEpisodes is null)))
                .Select(language => (Id: (int)item.TmdbId!.Value, item.MediaType, language.Language)))
            .Distinct().ToArray();
        var changed = 0;
        await Parallel.ForEachAsync(missing, new ParallelOptions { MaxDegreeOfParallelism = 3, CancellationToken = cancellationToken }, async (entry, token) =>
        {
            var key = $"tmdb-title-retry:{entry.MediaType}:{entry.Id}:{entry.Language}";
            if (cache.TryGetValue(key, out _)) return;
            try
            {
                var metadata = await tmdb.DetailsAsync(entry.MediaType, entry.Id, entry.Language, token);
                await repository.CacheTmdbMetadataAsync(metadata, token);
                Interlocked.Exchange(ref changed, 1);
                // An empty translation also needs a retry delay rather than a request on every refresh.
                if (string.IsNullOrWhiteSpace(metadata.Title)) cache.Set(key, true, TimeSpan.FromMinutes(5));
            }
            catch (TmdbException) { cache.Set(key, true, TimeSpan.FromMinutes(2)); }
        });
        return changed != 0;
    }
}
