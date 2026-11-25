using System.ComponentModel.DataAnnotations;

namespace MyMediaCollection.API.Models;

public sealed record BggMetadata
{
    public long BggId { get; init; }
    public string Title { get; init; } = "";
    public string Overview { get; init; } = "";
    public int? YearPublished { get; init; }
    public string? ImageUrl { get; init; }
    public int? MinPlayers { get; init; }
    public int? MaxPlayers { get; init; }
    public int? PlayingTime { get; init; }
    public int? MinAge { get; init; }
    public bool? IsExpansion { get; init; }
    public IReadOnlyList<BggGameReference> RequiredGames { get; init; } = [];
    public string SourceUrl => $"https://boardgamegeek.com/boardgame/{BggId}";
}

public sealed record BggGameReference(long BggId, string Name)
{
    public string SourceUrl => $"https://boardgamegeek.com/boardgame/{BggId}";
}

public sealed record BggSearchPage(int Page, bool HasNextPage, IReadOnlyList<BggMetadata> Results);

public sealed class BggImportRequest : IValidatableObject
{
    [Range(1, int.MaxValue)]
    public int BggId { get; init; }
    [Required]
    public CreateCollectionItemRequest Item { get; init; } = new();
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (Item is not null && Item.MediaType != MediaType.BoardGame)
            yield return new ValidationResult("BGG imports support only board and card games.", [nameof(Item)]);
    }
}
