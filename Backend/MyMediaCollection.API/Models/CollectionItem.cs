namespace MyMediaCollection.API.Models;

public sealed record CollectionItem(
    long Id, string Name, MediaType MediaType, MediaFormat MediaFormat, string? Info);
