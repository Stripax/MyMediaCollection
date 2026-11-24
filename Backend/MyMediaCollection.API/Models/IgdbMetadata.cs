using System.ComponentModel.DataAnnotations;

namespace MyMediaCollection.API.Models;

public sealed record IgdbMetadata
{
    public long IgdbId { get; init; }
    public string Title { get; init; } = "";
    public string Overview { get; init; } = "";
    public string? ReleaseDate { get; init; }
    public string? CoverImageId { get; init; }
    public string? SourceUrl { get; init; }
    public IReadOnlyList<string> Platforms { get; init; } = [];
}

public sealed record IgdbSearchPage(int Page, bool HasNextPage, IReadOnlyList<IgdbMetadata> Results);

public sealed class IgdbImportRequest : IValidatableObject
{
    [Range(1, int.MaxValue)]
    public int IgdbId { get; init; }
    [Required]
    public CreateCollectionItemRequest Item { get; init; } = new();

    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (Item is not null && Item.MediaType != MediaType.VideoGame)
            yield return new ValidationResult("IGDB imports support only video games.", [nameof(Item)]);
    }
}
