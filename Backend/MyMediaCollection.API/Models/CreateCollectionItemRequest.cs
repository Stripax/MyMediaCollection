using System.ComponentModel.DataAnnotations;

namespace MyMediaCollection.API.Models;

public sealed class CreateCollectionItemRequest : IValidatableObject
{
    [Required, StringLength(300)]
    public string Name { get; init; } = string.Empty;
    public bool? NameWasEdited { get; init; }
    public bool? IsCompleteBox { get; init; }
    [MaxLength(1000)]
    public IReadOnlyList<OwnedSeason>? OwnedSeasons { get; init; }

    [EnumDataType(typeof(MediaType))]
    public MediaType MediaType { get; init; }

    [EnumDataType(typeof(MediaFormat))]
    public MediaFormat? MediaFormat { get; init; }

    [EnumDataType(typeof(GamePlatform))]
    public GamePlatform? Platform { get; init; }

    [EnumDataType(typeof(GameStore))]
    public GameStore? Store { get; init; }
    public bool? IsPhysical { get; init; }

    [StringLength(10000)]
    public string? Info { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (MediaType != MediaType.TvSeries && (IsCompleteBox == true || OwnedSeasons?.Count > 0))
            yield return new ValidationResult("Season ownership is only available for TV series.", [nameof(OwnedSeasons)]);
        if (OwnedSeasons?.Any(season => season is null) == true)
            yield return new ValidationResult("Owned seasons cannot contain null values.", [nameof(OwnedSeasons)]);
        else if (OwnedSeasons is not null && OwnedSeasons.Select(season => season.SeasonNumber).Distinct().Count() != OwnedSeasons.Count)
            yield return new ValidationResult("Each owned season must occur only once.", [nameof(OwnedSeasons)]);
        if (MediaType == MediaType.VideoGame && Platform == GamePlatform.Pc && IsPhysical != true)
        {
            if (Store is null)
                yield return new ValidationResult("Select the store for a PC game.", [nameof(Store)]);
        }
        if (MediaType != MediaType.VideoGame && Store is not null)
        {
            yield return new ValidationResult("Store is only available for video games.", [nameof(Store)]);
        }

        if (MediaType != MediaType.VideoGame && IsPhysical is not null)
            yield return new ValidationResult("Copy type is only available for video games.", [nameof(IsPhysical)]);

        if (MediaType == MediaType.VideoGame)
        {
            if (Platform is null)
                yield return new ValidationResult("Select a platform for a video game.", [nameof(Platform)]);
            if (MediaFormat is not null)
                yield return new ValidationResult("Video games use Platform instead of MediaFormat.", [nameof(MediaFormat)]);
        }
        else if (MediaType == MediaType.BoardGame)
        {
            if (MediaFormat is not (Models.MediaFormat.BoardGame or Models.MediaFormat.CardGame or Models.MediaFormat.Other))
                yield return new ValidationResult("Select board game, card game or other game.", [nameof(MediaFormat)]);
            if (Platform is not null)
                yield return new ValidationResult("Board and card games have no platform.", [nameof(Platform)]);
        }
        else
        {
            if (MediaFormat is not (Models.MediaFormat.Dvd or Models.MediaFormat.BluRay or Models.MediaFormat.UltraHdBluRay or Models.MediaFormat.Other))
                yield return new ValidationResult("Select a disc format or Other for a movie or TV series.", [nameof(MediaFormat)]);
            if (Platform is not null)
                yield return new ValidationResult("Platform is only available for video games.", [nameof(Platform)]);
        }
    }
}
