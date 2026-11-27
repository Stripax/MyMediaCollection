using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using MyMediaCollection.API.Data;
using MyMediaCollection.API.Models;
using MyMediaCollection.API.Services;

namespace MyMediaCollection.API.Controllers;

[ApiController]
[Route("api/bgg")]
public sealed class BggController(BggClient bgg, CollectionRepository repository, ILogger<BggController> logger) : ControllerBase
{
    [HttpGet("search")]
    public async Task<ActionResult<BggSearchPage>> Search([FromQuery, Required, StringLength(200, MinimumLength = 1)] string query,
        CancellationToken cancellationToken, [FromQuery, Range(1, 500)] int page = 1)
    {
        if (string.IsNullOrWhiteSpace(query) || query.Any(char.IsControl)) return BadRequest();
        try { return Ok(await bgg.SearchAsync(query.Trim(), page, cancellationToken)); }
        catch (BggException exception) { return BggProblem(exception); }
    }

    [HttpGet("details")]
    public async Task<ActionResult<BggMetadata>> Details([FromQuery, Range(1, int.MaxValue)] int bggId, CancellationToken cancellationToken)
    {
        try { return Ok(await bgg.DetailsAsync(bggId, cancellationToken)); }
        catch (BggException exception) { return BggProblem(exception); }
    }

    [HttpPost("import")]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<CollectionItem>> Import(BggImportRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var metadata = await bgg.DetailsAsync(request.BggId, cancellationToken);
            return StatusCode(201, await repository.CreateAsync(request.Item, cancellationToken, bggMetadata: metadata));
        }
        catch (DuplicateCollectionItemException exception) { return Conflict(new { code = "collection_duplicate", existingItemId = exception.ExistingItemId, name = exception.ExistingName }); }
        catch (CollectionValidationException exception) { return BadRequest(new { message = exception.Message }); }
        catch (BggException exception) { return BggProblem(exception); }
        catch (SqliteException exception)
        {
            logger.LogError(exception, "Could not import a BGG collection item.");
            return Problem(statusCode: 503, title: "The collection item could not be saved.");
        }
    }

    private ObjectResult BggProblem(BggException exception) => Problem(statusCode: exception.StatusCode,
        title: "BGG request failed.", extensions: new Dictionary<string, object?> { ["code"] = exception.Code });
}
