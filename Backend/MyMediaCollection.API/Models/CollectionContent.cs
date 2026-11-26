using System.ComponentModel.DataAnnotations;

namespace MyMediaCollection.API.Models;

public sealed record CollectionContent
{
    [Required, StringLength(300)]
    public string Name { get; init; } = "";
    [Range(1, int.MaxValue)]
    public long? TmdbId { get; init; }
    public string? PosterPath { get; init; }
    public CollectionSourceMetadata? SourceMetadata { get; init; }
    [System.Text.Json.Serialization.JsonIgnore]
    public long? TmdbMetadataId { get; init; }
}
