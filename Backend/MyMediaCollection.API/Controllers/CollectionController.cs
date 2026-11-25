using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using MyMediaCollection.API.Data;
using MyMediaCollection.API.Models;
using MyMediaCollection.API.Services;

namespace MyMediaCollection.API.Controllers;

[ApiController]
[Route("api/collection")]
public sealed class CollectionController(CollectionRepository repository, TmdbTitleService titles, IgdbSourceService sources, BggExpansionService expansions, ILogger<CollectionController> logger) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<CollectionItem>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<IReadOnlyList<CollectionItem>>> GetAll(CancellationToken cancellationToken)
    {
        try
        {
            var items = await repository.GetAllAsync(cancellationToken);
            if (await titles.EnsureTitlesAsync(items, cancellationToken)) items = await repository.GetAllAsync(cancellationToken);
            if (await sources.EnsureUrlsAsync(items, cancellationToken)) items = await repository.GetAllAsync(cancellationToken);
            if (await expansions.EnsureDetailsAsync(items, cancellationToken)) items = await repository.GetAllAsync(cancellationToken);
            return Ok(items);
        }
        catch (SqliteException exception)
        {
            logger.LogError(exception, "Could not load the collection.");
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "The collection could not be loaded. Please try again later.");
        }
    }

    [HttpPut("{id:long:min(1)}")]
    [ProducesResponseType<CollectionItem>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<CollectionItem>> Update(long id, CreateCollectionItemRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var item = await repository.UpdateAsync(id, request, cancellationToken);
            if (item is null) return NotFound();
            return Ok(item);
        }
        catch (CollectionValidationException exception) { return BadRequest(new { message = exception.Message }); }
        catch (SqliteException exception)
        {
            logger.LogError(exception, "Could not update collection item {ItemId}.", id);
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "The collection item could not be updated. Please try again later.");
        }
    }

    [HttpDelete("{id:long:min(1)}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Delete(long id, CancellationToken cancellationToken)
    {
        try
        {
            if (!await repository.DeleteAsync(id, cancellationToken)) return NotFound();
            return NoContent();
        }
        catch (SqliteException exception)
        {
            logger.LogError(exception, "Could not delete collection item {ItemId}.", id);
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "The collection item could not be deleted. Please try again later.");
        }
    }

    [HttpPost]
    [ProducesResponseType<CollectionItem>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<CollectionItem>> Create(CreateCollectionItemRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var item = await repository.CreateAsync(request, cancellationToken);
            return StatusCode(StatusCodes.Status201Created, item);
        }
        catch (CollectionValidationException exception) { return BadRequest(new { message = exception.Message }); }
        catch (SqliteException exception)
        {
            logger.LogError(exception, "Could not save a collection item.");
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "The collection could not be saved. Please try again later.");
        }
    }
}
