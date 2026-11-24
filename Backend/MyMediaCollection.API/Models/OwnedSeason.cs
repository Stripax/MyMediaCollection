using System.ComponentModel.DataAnnotations;

namespace MyMediaCollection.API.Models;

public sealed record OwnedSeason : IValidatableObject
{
    [Range(1, 1000)]
    public int SeasonNumber { get; init; }
    public MediaFormat MediaFormat { get; init; }

    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (MediaFormat is not (Models.MediaFormat.Dvd or Models.MediaFormat.BluRay or Models.MediaFormat.UltraHdBluRay or Models.MediaFormat.Other))
            yield return new ValidationResult("Select a disc format for each owned season.", [nameof(MediaFormat)]);
    }
}

public sealed record TmdbSeason(int SeasonNumber, string Name, int? EpisodeCount);
