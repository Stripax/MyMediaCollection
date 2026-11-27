namespace MyMediaCollection.API.Models;

public sealed class DuplicateCollectionItemException(CollectionItem existing) : Exception("The item already exists in the collection.")
{
    public long ExistingItemId { get; } = existing.Id;
    public string ExistingName { get; } = existing.Name;
}
