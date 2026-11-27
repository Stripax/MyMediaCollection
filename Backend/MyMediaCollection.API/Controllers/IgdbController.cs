using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using MyMediaCollection.API.Data;
using MyMediaCollection.API.Models;
using MyMediaCollection.API.Services;

namespace MyMediaCollection.API.Controllers;

[ApiController]
[Route("api/igdb")]
public sealed class IgdbController(IgdbClient igdb, CollectionRepository repository, ILogger<IgdbController> logger) : ControllerBase
{
    [HttpGet("search")]
    public async Task<ActionResult<IgdbSearchPage>> Search(
        [FromQuery, Required, StringLength(200, MinimumLength = 1)] string query,
        CancellationToken cancellationToken, [FromQuery, Range(1, 500)] int page = 1)
    {
        if (string.IsNullOrWhiteSpace(query) || query.Any(char.IsControl)) return BadRequest();
        try { return Ok(await igdb.SearchAsync(query.Trim(), page, cancellationToken)); }
        catch (IgdbException exception) { return IgdbProblem(exception); }
    }

    [HttpPost("import")]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CollectionItem>> Import(IgdbImportRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var metadata = await igdb.DetailsAsync(request.IgdbId, cancellationToken);
            return StatusCode(201, await repository.CreateAsync(request.Item, cancellationToken, igdbMetadata: metadata));
        }
        catch (DuplicateCollectionItemException exception) { return Conflict(new { code = "collection_duplicate", existingItemId = exception.ExistingItemId, name = exception.ExistingName }); }
        catch (IgdbException exception) { return IgdbProblem(exception); }
        catch (SqliteException exception)
        {
            logger.LogError(exception, "Could not import an IGDB collection item.");
            return Problem(statusCode: 503, title: "The collection item could not be saved.");
        }
    }

    private ObjectResult IgdbProblem(IgdbException exception) => Problem(statusCode: exception.StatusCode,
        title: "IGDB request failed.", extensions: new Dictionary<string, object?> { ["code"] = exception.Code });
}
