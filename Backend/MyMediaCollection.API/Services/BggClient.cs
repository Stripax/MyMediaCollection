using System.Net;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Extensions.Caching.Memory;
using MyMediaCollection.API.Models;

namespace MyMediaCollection.API.Services;

public sealed class BggClient(HttpClient http, IConfiguration configuration, IMemoryCache cache, BggRequestGate gate)
{
    public async Task<BggSearchPage> SearchAsync(string query, int page, CancellationToken cancellationToken)
    {
        var key = $"bgg-search:{query}";
        if (!cache.TryGetValue(key, out BggMetadata[]? results))
        {
            var document = await RequestAsync($"search?type=boardgame,boardgameexpansion&query={Uri.EscapeDataString(query)}", cancellationToken);
            results = document.Root!.Elements("item").Where(IsBoardGame).Select(Map)
                .GroupBy(item => item.BggId).Select(group => group.FirstOrDefault(item => item.IsExpansion == true) ?? group.First()).ToArray();
            cache.Set(key, results, TimeSpan.FromMinutes(10));
        }
        return new(page, results!.Length > page * 20, results.Skip((page - 1) * 20).Take(20).ToArray());
    }

    public async Task<BggMetadata> DetailsAsync(int id, CancellationToken cancellationToken)
    {
        var key = $"bgg-details:{id}";
        if (cache.TryGetValue(key, out BggMetadata? cached) && cached is not null) return cached;
        var document = await RequestAsync($"thing?id={id}", cancellationToken);
        var element = document.Root!.Elements("item").FirstOrDefault(item => (string?)item.Attribute("id") == id.ToString() && IsBoardGame(item));
        if (element is null) throw new BggException("bgg_not_found", 404);
        var metadata = Map(element);
        if (string.IsNullOrWhiteSpace(metadata.Title)) throw new BggException("bgg_unavailable");
        cache.Set(key, metadata, TimeSpan.FromHours(24));
        return metadata;
    }

    private async Task<XDocument> RequestAsync(string path, CancellationToken cancellationToken)
    {
        var token = configuration["Bgg:ApiKey"];
        if (string.IsNullOrWhiteSpace(token)) throw new BggException("bgg_not_configured", 503);
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, path);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/xml"));
            using var response = await gate.SendAsync(http, request, cancellationToken);
            if (response.StatusCode == HttpStatusCode.Accepted) throw new BggException("bgg_pending", 503);
            if (!response.IsSuccessStatusCode) throw response.StatusCode switch
            {
                HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => new BggException("bgg_credentials"),
                HttpStatusCode.TooManyRequests or HttpStatusCode.ServiceUnavailable => new BggException("bgg_rate_limited", 429),
                HttpStatusCode.NotFound => new BggException("bgg_not_found", 404),
                _ => new BggException("bgg_unavailable")
            };
            using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var reader = XmlReader.Create(stream, new XmlReaderSettings
            {
                Async = true, DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = 8_000_000
            });
            var document = await XDocument.LoadAsync(reader, LoadOptions.None, cancellationToken);
            if (document.Root?.Name != "items" || document.Root.Element("error") is not null) throw new BggException("bgg_unavailable");
            return document;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { throw new BggException("bgg_unavailable"); }
        catch (Exception exception) when (exception is HttpRequestException or XmlException or InvalidOperationException)
        { throw new BggException("bgg_unavailable"); }
    }

    private static bool IsBoardGame(XElement element) => (string?)element.Attribute("type") is "boardgame" or "boardgameexpansion";
    private static int? Number(XElement element, string name) => int.TryParse((string?)element.Element(name)?.Attribute("value"), out var value) && value > 0 ? value : null;
    private static BggMetadata Map(XElement element)
    {
        if (!long.TryParse((string?)element.Attribute("id"), out var id) || id <= 0) throw new BggException("bgg_unavailable");
        var title = element.Elements("name").FirstOrDefault(name => (string?)name.Attribute("type") == "primary") ?? element.Element("name");
        var overview = WebUtility.HtmlDecode(element.Element("description")?.Value ?? "");
        overview = Regex.Replace(overview, @"<br\s*/?>", "\n", RegexOptions.IgnoreCase);
        overview = Regex.Replace(overview, "<[^>]+>", "").Trim();
        return new()
        {
            BggId = id, Title = (string?)title?.Attribute("value") ?? "", Overview = overview,
            YearPublished = Number(element, "yearpublished"), ImageUrl = ImageUrl(element.Element("image")?.Value ?? element.Element("thumbnail")?.Value),
            MinPlayers = Number(element, "minplayers"), MaxPlayers = Number(element, "maxplayers"),
            PlayingTime = Number(element, "playingtime"), MinAge = Number(element, "minage"),
            IsExpansion = (string?)element.Attribute("type") == "boardgameexpansion",
            // Inbound expansion links point to games expanded by this item. Outbound
            // links list expansions for this item and must never become requirements.
            RequiredGames = element.Elements("link")
                .Where(link => (string?)link.Attribute("type") == "boardgameexpansion" && (string?)link.Attribute("inbound") == "true")
                .Select(link => new BggGameReference(long.TryParse((string?)link.Attribute("id"), out var linkedId) ? linkedId : 0, ((string?)link.Attribute("value") ?? "").Trim()))
                .Where(game => game.BggId > 0 && game.BggId != id && !string.IsNullOrWhiteSpace(game.Name))
                .DistinctBy(game => game.BggId).ToArray()
        };
    }

    private static string? ImageUrl(string? value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme is not ("https" or "http") ||
            uri.Host is not ("cf.geekdo-images.com" or "images.geekdo.com") || !string.IsNullOrEmpty(uri.UserInfo) || !uri.IsDefaultPort) return null;
        return new UriBuilder(uri) { Scheme = "https", Port = -1 }.Uri.AbsoluteUri;
    }
}

public sealed class BggException(string code, int statusCode = 502) : Exception(code)
{
    public string Code { get; } = code;
    public int StatusCode { get; } = statusCode;
}

public sealed class BggRequestGate(IConfiguration configuration)
{
    private readonly SemaphoreSlim requestLock = new(1, 1);
    private DateTimeOffset nextRequest;
    public async Task<HttpResponseMessage> SendAsync(HttpClient client, HttpRequestMessage request, CancellationToken cancellationToken)
    {
        await requestLock.WaitAsync(cancellationToken);
        try
        {
            var delay = nextRequest - DateTimeOffset.UtcNow;
            if (delay > TimeSpan.Zero) await Task.Delay(delay, cancellationToken);
            nextRequest = DateTimeOffset.UtcNow.AddMilliseconds(Math.Max(0, configuration.GetValue("Bgg:RequestIntervalMilliseconds", 5000)));
            return await client.SendAsync(request, cancellationToken);
        }
        finally { requestLock.Release(); }
    }
}
