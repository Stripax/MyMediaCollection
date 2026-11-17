using System.ComponentModel.DataAnnotations;

namespace MyMediaCollection.API.Models;

public sealed class CreateCollectionItemRequest
{
    [Required, StringLength(300)]
    public string Name { get; init; } = string.Empty;

    [EnumDataType(typeof(MediaType))]
    public MediaType MediaType { get; init; }

    [EnumDataType(typeof(MediaFormat))]
    public MediaFormat MediaFormat { get; init; }

    [StringLength(10000)]
    public string? Info { get; init; }
}
