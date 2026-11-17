# Backend

Run the API from the repository root:

```powershell
dotnet run --project Backend/MyMediaCollection.API --launch-profile http
```

The development API listens at `http://localhost:5157`. Start the client with
`npm run dev` in `Client`; Vite forwards `/api` requests to this address. Restart
Vite after changing its proxy configuration.

`POST /api/collection` accepts JSON such as:

```json
{
  "name": "Example movie",
  "mediaType": 1,
  "mediaFormat": 2,
  "info": "Optional notes"
}
```

`MediaType`: Movie = 1, TvSeries = 2, VideoGame = 3, BoardGame = 4.
`MediaFormat`: Dvd = 1, BluRay = 2, UltraHdBluRay = 3.

The name is required (up to 300 characters); information is optional (up to
10,000 characters). Success returns HTTP 201 and the saved item with its ID.
Invalid input returns 400; a database error returns 503.

The connection string `ConnectionStrings:Collection` points to
`Data/MyMediaCollection.db`, relative to the API project's content root. The
database must already contain the manually managed `Collection` table with
`Id INTEGER PRIMARY KEY`, `Name TEXT NOT NULL`, `MediaType INTEGER NOT NULL`,
`MediaFormat INTEGER`, and `Info TEXT`. The API creates no databases or tables.
Database files are excluded from version control. For a deployed client, configure
the web server to forward `/api` to this API over HTTPS.

Run integration tests from the repository root (requires Node.js with `node:sqlite`
and the Client's npm dependencies for the Vite proxy test):

```powershell
dotnet build Backend/MyMediaCollection.API
node --test Backend/tests/collection-api.test.mjs
```

Tests start the API against a temporary SQLite database. They do not write to the
application's database.
