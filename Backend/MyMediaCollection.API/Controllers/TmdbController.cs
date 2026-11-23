using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using MyMediaCollection.API.Data;
using MyMediaCollection.API.Models;
using MyMediaCollection.API.Services;

namespace MyMediaCollection.API.Controllers;

[ApiController]
[Route("api/tmdb")]
public sealed class TmdbController(TmdbClient tmdb, CollectionRepository repository, ILogger<TmdbController> logger) : ControllerBase
{
    [HttpGet("search")]
    public async Task<ActionResult<TmdbSearchPage>> Search(
        [FromQuery, Required, StringLength(200, MinimumLength = 1)] string query,
        [FromQuery, Range(1, 2)] int mediaType,
        CancellationToken cancellationToken,
        [FromQuery, RegularExpression("^(fi-FI|en-US)$")] string language = "en-US",
        [FromQuery, Range(1, 500)] int page = 1)
    {
        if (string.IsNullOrWhiteSpace(query)) return BadRequest();
        try { return Ok(await tmdb.SearchAsync((MediaType)mediaType, query.Trim(), language, page, cancellationToken)); }
        catch (TmdbException exception) { return TmdbProblem(exception); }
    }

    [HttpPost("import")]
    public async Task<ActionResult<CollectionItem>> Import(TmdbImportRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var metadata = await tmdb.DetailsAsync(request.Item.MediaType, request.TmdbId, request.Language, cancellationToken);
            return StatusCode(201, await repository.CreateAsync(request.Item, cancellationToken, metadata));
        }
        catch (TmdbException exception) { return TmdbProblem(exception); }
        catch (SqliteException exception)
        {
            logger.LogError(exception, "Could not import a TMDB collection item.");
            return Problem(statusCode: 503, title: "The collection item could not be saved.");
        }
    }

    private ObjectResult TmdbProblem(TmdbException exception) => Problem(
        statusCode: exception.StatusCode, title: "TMDB request failed.",
        extensions: new Dictionary<string, object?> { ["code"] = exception.Code });
}
