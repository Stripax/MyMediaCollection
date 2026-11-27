using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using MyMediaCollection.API.Data;
using MyMediaCollection.API.Models;

namespace MyMediaCollection.API.Controllers;

[ApiController]
[Route("api/version-history")]
public sealed class VersionHistoryController(VersionHistoryRepository repository, ILogger<VersionHistoryController> logger) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<VersionHistoryEntry>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<IReadOnlyList<VersionHistoryEntry>>> GetAll(CancellationToken cancellationToken)
    {
        try { return Ok(await repository.GetAllAsync(cancellationToken)); }
        catch (SqliteException exception)
        {
            logger.LogError(exception, "Could not load version history.");
            return Problem(statusCode: 503, title: "Version history could not be loaded.");
        }
    }

    [HttpPost]
    [ProducesResponseType<VersionHistoryEntry>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<VersionHistoryEntry>> Create(CreateVersionHistoryRequest request, CancellationToken cancellationToken)
    {
        try { return StatusCode(201, await repository.CreateAsync(request, cancellationToken)); }
        catch (SqliteException exception) when (exception.SqliteExtendedErrorCode == 2067)
        {
            return Conflict(new { code = "version_exists" });
        }
        catch (SqliteException exception)
        {
            logger.LogError(exception, "Could not save version history.");
            return Problem(statusCode: 503, title: "Version history could not be saved.");
        }
    }
}
