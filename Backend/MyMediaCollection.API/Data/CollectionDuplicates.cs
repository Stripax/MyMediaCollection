using System.Text;
using MyMediaCollection.API.Models;

namespace MyMediaCollection.API.Data;

internal static class CollectionDuplicates
{
    internal static bool Matches(CollectionItem first, CollectionItem second)
    {
        if (!SameItem(first, second)) return false;
        if (first.MediaType is MediaType.Movie or MediaType.TvSeries or MediaType.VideoGame)
            return first.Versions.DefaultIfEmpty(CollectionVersion.Original(first)).Any(a =>
                second.Versions.DefaultIfEmpty(CollectionVersion.Original(second)).Any(b => SameVersion(first.MediaType, a, b)));
        return first.MediaFormat == second.MediaFormat;
    }

    internal static bool SameVersion(MediaType type, CollectionVersion first, CollectionVersion second) =>
        type == MediaType.VideoGame ? first.Platform == second.Platform :
        Formats(first).Intersect(Formats(second)).Any();

    private static IEnumerable<MediaFormat?> Formats(CollectionVersion version) =>
        version.OwnedSeasons.Count > 0 && !version.IsCompleteBox
            ? version.OwnedSeasons.Select(season => (MediaFormat?)season.MediaFormat).Distinct() : [version.MediaFormat];

    internal static bool SameItem(CollectionItem first, CollectionItem second)
    {
        if (first.Id == second.Id || first.UserId != second.UserId || first.MediaType != second.MediaType || first.IsCollection != second.IsCollection) return false;
        if (first.IsCollection)
            return first.CollectionContents.Count > 0 && second.CollectionContents.Count > 0
                ? Contents(first).SequenceEqual(Contents(second)) : Normalize(first.Name) == Normalize(second.Name);
        if (first.TmdbId.HasValue && second.TmdbId.HasValue) return first.TmdbId == second.TmdbId;
        if (first.IgdbId.HasValue && second.IgdbId.HasValue) return first.IgdbId == second.IgdbId;
        if (first.BggId.HasValue && second.BggId.HasValue) return first.BggId == second.BggId;
        return Names(first).Intersect(Names(second), StringComparer.Ordinal).Any();
    }

    private static string Normalize(string value) => string.Join(' ', value.Normalize(NormalizationForm.FormKC)
        .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).ToUpperInvariant();

    private static IEnumerable<string> Names(CollectionItem item) => new[] { item.Name, item.SourceMetadata?.Title, item.SourceMetadata?.OriginalTitle }
        .Concat(item.LocalizedTitles?.Values ?? []).Where(name => !string.IsNullOrWhiteSpace(name)).Select(name => Normalize(name!));

    private static IEnumerable<string> Contents(CollectionItem item) => item.CollectionContents.Select(entry => entry.TmdbId is long id ? $"tmdb:{id}" : $"name:{Normalize(entry.Name)}").Order(StringComparer.Ordinal);
}
