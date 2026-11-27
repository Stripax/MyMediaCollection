using MyMediaCollection.API.Data;
using MyMediaCollection.API.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddScoped<CollectionRepository>();
builder.Services.AddScoped<VersionHistoryRepository>();
builder.Services.AddMemoryCache();
builder.Services.AddScoped<TmdbTitleService>();
builder.Services.AddScoped<IgdbSourceService>();
builder.Services.AddSingleton<IgdbAccess>();
builder.Services.AddSingleton<BggRequestGate>();
builder.Services.AddScoped<BggExpansionService>();
builder.Services.AddHttpClient<BggClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Bgg:BaseUrl"] ?? "https://boardgamegeek.com/xmlapi2/");
    client.Timeout = TimeSpan.FromSeconds(20);
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false }).RemoveAllLoggers();
builder.Services.AddHttpClient("IgdbOAuth", client => client.Timeout = TimeSpan.FromSeconds(10)).RemoveAllLoggers();
builder.Services.AddHttpClient<IgdbClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Igdb:BaseUrl"] ?? "https://api.igdb.com/v4/");
    client.Timeout = TimeSpan.FromSeconds(10);
}).RemoveAllLoggers();
builder.Services.AddHttpClient<TmdbClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Tmdb:BaseUrl"] ?? "https://api.themoviedb.org/3/");
    client.Timeout = TimeSpan.FromSeconds(10);
}).RemoveAllLoggers(); // API-key authentication uses a query parameter; never log request URLs.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Explicit, one-off maintenance after migration 014; never changes data on startup.
if (args.Contains("--consolidate-collection-versions"))
{
    using var scope = app.Services.CreateScope();
    var merged = await scope.ServiceProvider.GetRequiredService<CollectionRepository>().ConsolidateVersionsAsync(CancellationToken.None);
    Console.WriteLine($"Merged {merged} collection rows into existing items.");
    return;
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseAuthorization();

app.MapControllers();

app.Run();
