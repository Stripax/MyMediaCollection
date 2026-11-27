namespace MyMediaCollection.API.Models;

public sealed record CollectionItem
{
    public long Id { get; init; }
    [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingDefault)]
    public bool VersionAdded { get; init; }
    public IReadOnlyList<CollectionVersion> Versions { get; init; } = [];
    public string Name { get; init; } = string.Empty;
    public bool IsNameCustom { get; init; } = true;
    public IReadOnlyDictionary<string, string>? LocalizedTitles { get; init; }
    public MediaType MediaType { get; init; }
    public MediaFormat? MediaFormat { get; init; }
    public GamePlatform? Platform { get; init; }
    public GameStore? Store { get; init; }
    public bool? IsPhysical { get; init; }
    public bool IsCompleteBox { get; init; }
    public bool IsCollection { get; init; }
    public IReadOnlyList<CollectionContent> CollectionContents { get; init; } = [];
    public BoardGameKind? BoardGameKind { get; init; }
    public IReadOnlyList<BoardGameReference> BaseGames { get; init; } = [];
    [System.Text.Json.Serialization.JsonIgnore]
    public string? BaseGamesJson { get; init; }
    public IReadOnlyList<OwnedSeason> OwnedSeasons { get; init; } = [];
    public string? Info { get; init; }
    public DateTime? CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }
    public string? UserId { get; init; }
    public long? TmdbMetadataId { get; init; }
    public long? TmdbId { get; init; }
    public string? PosterPath { get; init; }
    public long? IgdbMetadataId { get; init; }
    public long? IgdbId { get; init; }
    public string? CoverImageId { get; init; }
    public long? BggMetadataId { get; init; }
    public long? BggId { get; init; }
    public string? BggImageUrl { get; init; }
    public CollectionSourceMetadata? SourceMetadata { get; init; }
}
