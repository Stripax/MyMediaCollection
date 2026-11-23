namespace MyMediaCollection.API.Models;

public sealed record CollectionItem
{
    public long Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public MediaType MediaType { get; init; }
    public MediaFormat? MediaFormat { get; init; }
    public GamePlatform? Platform { get; init; }
    public GameStore? Store { get; init; }
    public string? Info { get; init; }
    public DateTime? CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }
    public string? UserId { get; init; }
    public long? TmdbMetadataId { get; init; }
    public long? TmdbId { get; init; }
    public string? PosterPath { get; init; }
}
