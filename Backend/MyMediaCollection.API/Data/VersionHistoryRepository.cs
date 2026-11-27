using Dapper;
using Microsoft.Data.Sqlite;
using MyMediaCollection.API.Models;

namespace MyMediaCollection.API.Data;

public sealed class VersionHistoryRepository(IConfiguration configuration, IWebHostEnvironment environment)
{
    private SqliteConnection CreateConnection()
    {
        var settings = new SqliteConnectionStringBuilder(configuration.GetConnectionString("Collection")
            ?? throw new InvalidOperationException("The Collection connection string is missing."));
        if (!Path.IsPathRooted(settings.DataSource)) settings.DataSource = Path.Combine(environment.ContentRootPath, settings.DataSource);
        settings.Mode = SqliteOpenMode.ReadWrite;
        settings.ForeignKeys = true;
        return new SqliteConnection(settings.ToString());
    }

    public async Task<IReadOnlyList<VersionHistoryEntry>> GetAllAsync(CancellationToken cancellationToken)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        return (await connection.QueryAsync<VersionHistoryEntry>(new CommandDefinition(
            "SELECT Id, VersionNumber, Description, CreatedAt, UserId FROM VersionHistory ORDER BY Id DESC;",
            cancellationToken: cancellationToken))).AsList();
    }

    public async Task<VersionHistoryEntry> CreateAsync(CreateVersionHistoryRequest request, CancellationToken cancellationToken)
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        return await connection.QuerySingleAsync<VersionHistoryEntry>(new CommandDefinition(
            """
            INSERT INTO VersionHistory (VersionNumber, Description) VALUES (@VersionNumber, @Description)
            RETURNING Id, VersionNumber, Description, CreatedAt, UserId;
            """, new { VersionNumber = request.VersionNumber.Trim(), Description = request.Description.Trim() },
            cancellationToken: cancellationToken));
    }
}
