using System.ComponentModel.DataAnnotations;

namespace MyMediaCollection.API.Models;

public enum BoardGameKind { BaseGame = 1, Expansion = 2, Other = 99 }

public sealed record BoardGameReference
{
    [Range(1, long.MaxValue)]
    public long? CollectionItemId { get; init; }
    [Range(1, int.MaxValue)]
    public long? BggId { get; init; }
    [StringLength(300)]
    public string Name { get; init; } = "";
}

public sealed class CollectionValidationException(string message) : Exception(message);
