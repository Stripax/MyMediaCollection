using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;
using MyMediaCollection.API.Models;

namespace MyMediaCollection.API.Services;

public sealed class TmdbException(string code, int statusCode) : Exception(code)
{
    public string Code { get; } = code;
    public int StatusCode { get; } = statusCode;
}

public sealed class TmdbClient(HttpClient http, IConfiguration configuration)
{
    private static string Kind(MediaType type) => type == MediaType.Movie ? "movie" : "tv";

    public async Task<TmdbSearchPage> SearchAsync(MediaType type, string query, string language, int page, CancellationToken cancellationToken)
    {
        using var document = await GetAsync($"search/{Kind(type)}?query={Uri.EscapeDataString(query)}&language={language}&page={page}&include_adult=false", cancellationToken);
        var root = document.RootElement;
        if (!root.TryGetProperty("results", out var entries) || entries.ValueKind != JsonValueKind.Array ||
            !root.TryGetProperty("total_pages", out var total) || !total.TryGetInt32(out var totalPages))
            throw new TmdbException("tmdb_unavailable", 502);
        var results = entries.EnumerateArray()
            .Where(item => !item.TryGetProperty("adult", out var adult) || adult.ValueKind != JsonValueKind.True)
            .Select(item => Map(item, type, language)).ToList();
        return new(page, Math.Clamp(totalPages, 0, 500), results);
    }

    public async Task<TmdbMetadata> DetailsAsync(MediaType type, int id, string language, CancellationToken cancellationToken)
    {
        using var document = await GetAsync($"{Kind(type)}/{id}?language={language}", cancellationToken);
        if (document.RootElement.TryGetProperty("adult", out var adult) && adult.ValueKind == JsonValueKind.True)
            throw new TmdbException("tmdb_not_found", 404);
        var item = Map(document.RootElement, type, language);
        if (item.TmdbId != id) throw new TmdbException("tmdb_unavailable", 502);
        return item;
    }

    private async Task<JsonDocument> GetAsync(string path, CancellationToken cancellationToken)
    {
        var token = configuration["Tmdb:ReadAccessToken"];
        var apiKey = configuration["Tmdb:ApiKey"];
        if (string.IsNullOrWhiteSpace(token) && string.IsNullOrWhiteSpace(apiKey))
            throw new TmdbException("tmdb_not_configured", 503);
        using var request = new HttpRequestMessage(HttpMethod.Get,
            string.IsNullOrWhiteSpace(token) ? $"{path}&api_key={Uri.EscapeDataString(apiKey!)}" : path);
        if (!string.IsNullOrWhiteSpace(token)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        try
        {
            using var response = await http.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
                throw response.StatusCode switch
                {
                    HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => new TmdbException("tmdb_credentials", 502),
                    HttpStatusCode.TooManyRequests => new TmdbException("tmdb_rate_limited", 429),
                    HttpStatusCode.NotFound => new TmdbException("tmdb_not_found", 404),
                    _ => new TmdbException("tmdb_unavailable", 502)
                };
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        { throw new TmdbException("tmdb_unavailable", 502); }
        catch (Exception exception) when (exception is HttpRequestException or JsonException or InvalidOperationException or KeyNotFoundException)
        { throw new TmdbException("tmdb_unavailable", 502); }
    }

    private static TmdbMetadata Map(JsonElement item, MediaType type, string language)
    {
        static string Text(JsonElement value, string key) => value.TryGetProperty(key, out var field) && field.ValueKind == JsonValueKind.String ? field.GetString()! : "";
        var poster = Text(item, "poster_path");
        if (!item.TryGetProperty("id", out var identifier) || !identifier.TryGetInt64(out var id) || id <= 0)
            throw new TmdbException("tmdb_unavailable", 502);
        var date = Text(item, type == MediaType.Movie ? "release_date" : "first_air_date");
        return new()
        {
            TmdbId = id, MediaType = type, Language = language,
            Title = Text(item, type == MediaType.Movie ? "title" : "name"),
            OriginalTitle = Text(item, type == MediaType.Movie ? "original_title" : "original_name"),
            Overview = Text(item, "overview"), ReleaseDate = date.Length > 0 ? date : null,
            PosterPath = Regex.IsMatch(poster, @"^/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$", RegexOptions.IgnoreCase) ? poster : null
        };
    }
}
