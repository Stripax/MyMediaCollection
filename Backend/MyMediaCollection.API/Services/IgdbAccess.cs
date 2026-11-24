using System.Net;
using System.Text.Json;

namespace MyMediaCollection.API.Services;

public sealed class IgdbException(string code, int statusCode = 502) : Exception(code)
{
    public string Code { get; } = code;
    public int StatusCode { get; } = statusCode;
}

// Shared across requests: reuse app tokens and serialize IGDB requests below its rate limit.
public sealed class IgdbAccess(IHttpClientFactory clients, IConfiguration configuration)
{
    private readonly SemaphoreSlim tokenLock = new(1, 1);
    private readonly SemaphoreSlim requestLock = new(1, 1);
    private string? token;
    private DateTimeOffset expiresAt;
    private DateTimeOffset nextRequest;

    public async Task<string> GetTokenAsync(CancellationToken cancellationToken, string? rejectedToken = null)
    {
        if (string.IsNullOrWhiteSpace(configuration["Igdb:ClientId"]) || string.IsNullOrWhiteSpace(configuration["Igdb:ClientSecret"]))
            throw new IgdbException("igdb_not_configured", 503);
        await tokenLock.WaitAsync(cancellationToken);
        try
        {
            if (rejectedToken is not null && token == rejectedToken) token = null;
            if (token is not null && expiresAt > DateTimeOffset.UtcNow) return token;
            using var content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = configuration["Igdb:ClientId"]!,
                ["client_secret"] = configuration["Igdb:ClientSecret"]!,
                ["grant_type"] = "client_credentials"
            });
            using var response = await clients.CreateClient("IgdbOAuth").PostAsync(
                configuration["Igdb:TokenUrl"] ?? "https://id.twitch.tv/oauth2/token", content, cancellationToken);
            if (!response.IsSuccessStatusCode)
                throw new IgdbException(response.StatusCode == HttpStatusCode.TooManyRequests ? "igdb_rate_limited" : "igdb_credentials",
                    response.StatusCode == HttpStatusCode.TooManyRequests ? 429 : 502);
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            var root = document.RootElement;
            if (!root.TryGetProperty("access_token", out var value) || value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(value.GetString()) ||
                !root.TryGetProperty("expires_in", out var expiry) || expiry.ValueKind != JsonValueKind.Number || !expiry.TryGetInt32(out var seconds) || seconds <= 0)
                throw new IgdbException("igdb_credentials");
            token = value.GetString()!;
            expiresAt = DateTimeOffset.UtcNow.AddSeconds(Math.Max(1, seconds - Math.Min(60, seconds / 2)));
            return token;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { throw new IgdbException("igdb_unavailable"); }
        catch (Exception exception) when (exception is HttpRequestException or JsonException or InvalidOperationException)
        { throw new IgdbException("igdb_unavailable"); }
        finally { tokenLock.Release(); }
    }

    public async Task<HttpResponseMessage> SendAsync(HttpClient client, HttpRequestMessage request, CancellationToken cancellationToken)
    {
        await requestLock.WaitAsync(cancellationToken);
        try
        {
            var delay = nextRequest - DateTimeOffset.UtcNow;
            if (delay > TimeSpan.Zero) await Task.Delay(delay, cancellationToken);
            nextRequest = DateTimeOffset.UtcNow.AddMilliseconds(300);
            return await client.SendAsync(request, cancellationToken);
        }
        finally { requestLock.Release(); }
    }
}
