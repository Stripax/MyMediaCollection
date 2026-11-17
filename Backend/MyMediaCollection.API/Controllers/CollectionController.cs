using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using MyMediaCollection.API.Data;
using MyMediaCollection.API.Models;

namespace MyMediaCollection.API.Controllers;

[ApiController]
[Route("api/collection")]
public sealed class CollectionController(CollectionRepository repository, ILogger<CollectionController> logger) : ControllerBase
{
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
        catch (SqliteException exception)
        {
            logger.LogError(exception, "Could not save a collection item.");
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "The collection could not be saved. Please try again later.");
        }
    }
}
