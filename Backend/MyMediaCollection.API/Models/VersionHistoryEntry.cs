using System.ComponentModel.DataAnnotations;

namespace MyMediaCollection.API.Models;

public sealed record VersionHistoryEntry(long Id, string VersionNumber, string Description, string CreatedAt, string? UserId);

public sealed class CreateVersionHistoryRequest
{
    [Required, StringLength(64)]
    public string VersionNumber { get; init; } = "";
    [Required, StringLength(20000)]
    public string Description { get; init; } = "";
}
