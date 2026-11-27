namespace MyMediaCollection.API.Models;

public sealed record CollectionVersion
{
    // Protect deletion against stale editors, including promotion into the original slot.
    public string DeletionToken => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
        System.Text.Encoding.UTF8.GetBytes(System.Text.Json.JsonSerializer.Serialize(new
        {
            Id, MediaFormat, Platform, Store, IsPhysical, IsCompleteBox,
            OwnedSeasons = OwnedSeasons.OrderBy(season => season.SeasonNumber).ToArray(), Info
        }))));
    // Zero identifies the original version stored on Collection.
    public long Id { get; init; }
    public long CollectionItemId { get; init; }
    public MediaFormat? MediaFormat { get; init; }
    public GamePlatform? Platform { get; init; }
    public GameStore? Store { get; init; }
    public bool? IsPhysical { get; init; }
    public bool IsCompleteBox { get; init; }
    public IReadOnlyList<OwnedSeason> OwnedSeasons { get; init; } = [];
    [System.Text.Json.Serialization.JsonIgnore]
    public string? OwnedSeasonsJson { get; init; }
    public string? Info { get; init; }
    public DateTime? CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }

    public static CollectionVersion Original(CollectionItem item) => new()
    {
        CollectionItemId = item.Id, MediaFormat = item.MediaFormat, Platform = item.Platform,
        Store = item.Store, IsPhysical = item.IsPhysical, IsCompleteBox = item.IsCompleteBox,
        OwnedSeasons = item.OwnedSeasons, Info = item.Info, CreatedAt = item.CreatedAt, UpdatedAt = item.UpdatedAt
    };
}
