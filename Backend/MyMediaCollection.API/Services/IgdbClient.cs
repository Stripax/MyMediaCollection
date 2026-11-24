using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using MyMediaCollection.API.Models;

namespace MyMediaCollection.API.Services;

public sealed class IgdbClient(HttpClient http, IgdbAccess access, IConfiguration configuration)
{
    private const string Fields = "fields name,slug,summary,first_release_date,cover.image_id,platforms.name;";
    private const int PageSize = 20;

    public async Task<IgdbSearchPage> SearchAsync(string query, int page, CancellationToken cancellationToken)
    {
        // Escape the APICalypse string literal; browser input never becomes query syntax.
        var escaped = query.Replace("\\", "\\\\").Replace("\"", "\\\"");
        using var document = await QueryAsync($"search \"{escaped}\"; {Fields} limit {PageSize + 1}; offset {(page - 1) * PageSize};", cancellationToken);
        var rows = document.RootElement.EnumerateArray().ToList();
        return new(page, rows.Count > PageSize, rows.Take(PageSize).Select(Map).ToList());
    }

    public async Task<IgdbMetadata> DetailsAsync(int id, CancellationToken cancellationToken)
    {
        using var document = await QueryAsync($"{Fields} where id = {id}; limit 1;", cancellationToken);
        if (document.RootElement.GetArrayLength() == 0) throw new IgdbException("igdb_not_found", 404);
        var item = Map(document.RootElement[0]);
        if (item.IgdbId != id) throw new IgdbException("igdb_unavailable");
        return item;
    }

    private async Task<JsonDocument> QueryAsync(string query, CancellationToken cancellationToken)
    {
        try
        {
            var token = await access.GetTokenAsync(cancellationToken);
            for (var attempt = 0; attempt < 2; attempt++)
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, "games") { Content = new StringContent(query, Encoding.UTF8, "text/plain") };
                request.Headers.Add("Client-ID", configuration["Igdb:ClientId"]);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                using var response = await access.SendAsync(http, request, cancellationToken);
                if (response.StatusCode == HttpStatusCode.Unauthorized && attempt == 0)
                { token = await access.GetTokenAsync(cancellationToken, token); continue; }
                if (!response.IsSuccessStatusCode)
                    throw response.StatusCode switch
                    {
                        HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => new IgdbException("igdb_credentials"),
                        HttpStatusCode.TooManyRequests => new IgdbException("igdb_rate_limited", 429),
                        _ => new IgdbException("igdb_unavailable")
                    };
                var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
                if (document.RootElement.ValueKind == JsonValueKind.Array) return document;
                document.Dispose();
                throw new IgdbException("igdb_unavailable");
            }
            throw new IgdbException("igdb_credentials");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { throw new IgdbException("igdb_unavailable"); }
        catch (Exception exception) when (exception is HttpRequestException or JsonException or InvalidOperationException)
        { throw new IgdbException("igdb_unavailable"); }
    }

    private static IgdbMetadata Map(JsonElement item)
    {
        static string Text(JsonElement root, string key) => root.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString()! : "";
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("id", out var identifier) || identifier.ValueKind != JsonValueKind.Number || !identifier.TryGetInt64(out var id) || id <= 0)
            throw new IgdbException("igdb_unavailable");
        var cover = item.TryGetProperty("cover", out var image) && image.ValueKind == JsonValueKind.Object ? Text(image, "image_id") : "";
        var slug = Text(item, "slug");
        string? releaseDate = null;
        if (item.TryGetProperty("first_release_date", out var date) && date.ValueKind == JsonValueKind.Number && date.TryGetInt64(out var timestamp) && timestamp is >= -62135596800 and <= 253402300799)
            releaseDate = DateTimeOffset.FromUnixTimeSeconds(timestamp).ToString("yyyy-MM-dd");
        return new()
        {
            IgdbId = id, Title = Text(item, "name"), Overview = Text(item, "summary"), ReleaseDate = releaseDate,
            CoverImageId = Regex.IsMatch(cover, "^[A-Za-z0-9_-]+$") ? cover : null,
            SourceUrl = Regex.IsMatch(slug, "^[A-Za-z0-9-]+$") ? $"https://www.igdb.com/games/{slug}" : null,
            Platforms = item.TryGetProperty("platforms", out var platforms) && platforms.ValueKind == JsonValueKind.Array
                ? platforms.EnumerateArray().Where(p => p.ValueKind == JsonValueKind.Object).Select(p => Text(p, "name")).Where(n => n.Length > 0).ToList() : []
        };
    }
}
