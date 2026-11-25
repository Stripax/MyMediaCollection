namespace MyMediaCollection.API.Models;

public sealed record CollectionSourceMetadata
{
    public string Source { get; init; } = "";
    public string? SourceUrl { get; init; }
    public string Title { get; init; } = "";
    public string? OriginalTitle { get; init; }
    public string Overview { get; init; } = "";
    public IReadOnlyDictionary<string, string>? LocalizedOverviews { get; init; }
    public string? ReleaseDate { get; init; }
    public int? YearPublished { get; init; }
    public int? MinPlayers { get; init; }
    public int? MaxPlayers { get; init; }
    public int? PlayingTime { get; init; }
    public int? MinAge { get; init; }
    public bool? IsExpansion { get; init; }
    public IReadOnlyList<BggGameReference> RequiredGames { get; init; } = [];
    public string? Language { get; init; }
    public IReadOnlyList<string> Platforms { get; init; } = [];
    public string? FetchedAt { get; init; }
    public int? NumberOfSeasons { get; init; }
    public int? NumberOfEpisodes { get; init; }
    public IReadOnlyList<TmdbSeason> Seasons { get; init; } = [];
}
