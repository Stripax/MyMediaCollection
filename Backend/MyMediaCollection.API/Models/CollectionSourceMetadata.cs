namespace MyMediaCollection.API.Models;

public sealed record CollectionSourceMetadata
{
    public string Source { get; init; } = "";
    public string Title { get; init; } = "";
    public string? OriginalTitle { get; init; }
    public string Overview { get; init; } = "";
    public string? ReleaseDate { get; init; }
    public string? Language { get; init; }
    public IReadOnlyList<string> Platforms { get; init; } = [];
    public string? FetchedAt { get; init; }
    public int? NumberOfSeasons { get; init; }
    public int? NumberOfEpisodes { get; init; }
    public IReadOnlyList<TmdbSeason> Seasons { get; init; } = [];
}
