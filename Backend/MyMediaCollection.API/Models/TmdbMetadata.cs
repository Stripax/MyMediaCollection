using System.ComponentModel.DataAnnotations;

namespace MyMediaCollection.API.Models;

public sealed record TmdbMetadata
{
    public long TmdbId { get; init; }
    public MediaType MediaType { get; init; }
    public string Language { get; init; } = "en-US";
    public string Title { get; init; } = string.Empty;
    public string OriginalTitle { get; init; } = string.Empty;
    public string Overview { get; init; } = string.Empty;
    public string? ReleaseDate { get; init; }
    public string? PosterPath { get; init; }
    public int? NumberOfSeasons { get; init; }
    public int? NumberOfEpisodes { get; init; }
    public IReadOnlyList<TmdbSeason> Seasons { get; init; } = [];
}

public sealed record TmdbSearchPage(int Page, int TotalPages, IReadOnlyList<TmdbMetadata> Results);

public sealed class TmdbImportRequest : IValidatableObject
{
    public bool? UseLocalizedName { get; init; }
    [Range(1, int.MaxValue)]
    public int TmdbId { get; init; }
    [MaxLength(100)]
    public IReadOnlyList<int>? TmdbIds { get; init; }
    [Required, RegularExpression("^(fi-FI|en-US)$")]
    public string Language { get; init; } = "en-US";
    [Required]
    public CreateCollectionItemRequest Item { get; init; } = new();

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (TmdbIds is not null && (TmdbIds.Count == 0 || TmdbIds.Any(id => id <= 0) || TmdbIds.Distinct().Count() != TmdbIds.Count || TmdbIds[0] != TmdbId))
            yield return new ValidationResult("Select unique valid titles in collection order, beginning with TmdbId.", [nameof(TmdbIds)]);
        if (Item?.IsCollection == true && TmdbIds is null)
            yield return new ValidationResult("Select titles for the collection.", [nameof(TmdbIds)]);
        if (Item?.IsCollection != true && TmdbIds is not null)
            yield return new ValidationResult("Multiple titles require collection mode.", [nameof(TmdbIds)]);
        if (Item is not null && Item.MediaType is not (MediaType.Movie or MediaType.TvSeries))
            yield return new ValidationResult("TMDB imports support only movies and TV series.", [nameof(Item)]);
    }
}
