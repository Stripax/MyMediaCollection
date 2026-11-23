# Backend

Run the API from the repository root:

```powershell
dotnet run --project Backend/MyMediaCollection.API --launch-profile http
```

The development API listens at `http://localhost:5157`. Start the client with
`npm run dev` in `Client`; Vite forwards `/api` requests to this address. Restart
Vite after changing its proxy configuration.

`GET /api/collection` returns all saved collection items as a JSON array, newest
ID first. An empty collection returns `[]`; a database error returns 503.
The client filters these items by the selected sidebar category and reloads the
list after a successful save.

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
`MediaFormat`: Dvd = 1, BluRay = 2, UltraHdBluRay = 3, BoardGame = 4,
CardGame = 5, Other = 99. Values 4 and 5 are only valid in the board and card
games category (`mediaType: 4`). Movies and TV series accept 1–3 or 99.

`Other = 99` is available in `MediaFormat`, `GamePlatform` and `GameStore`.
The client labels it Muu in Finnish and Other in English, including the table
and edit form. More specific details can be recorded in `Info`. Existing enum
numbers are unchanged and no database schema change is needed for Other.

Video games (`mediaType: 3`) use a separate numeric `platform` instead of a disc
format. Set `mediaFormat` to null or omit it for a video game:

```json
{
  "name": "Console game",
  "mediaType": 3,
  "mediaFormat": null,
  "platform": 9,
  "info": "PlayStation 5 edition"
}
```

`GamePlatform` values and console names are defined in
`MyMediaCollection.API/Models/GamePlatform.cs`; the corresponding client options
are in `Client/src/models/collection.ts`. Platforms 1–25 cover Xbox, PlayStation,
Nintendo and Sega consoles; PC is platform 26. PC games require `store`, a
numeric `GameStore` enum value: Steam = 1, GOG = 2, Epic Games Store = 3,
Microsoft Store = 4, EA app = 5, Ubisoft Store = 6, Battle.net = 7, itch.io = 8.

```json
{
  "name": "PC game",
  "mediaType": 3,
  "platform": 26,
  "store": 1
}
```

The store is only shown in the client when PC is selected. Console games and
other categories must omit `store` or set it to null. Changing a PC game to a
console or another category clears the store when saving. The table displays
the PC store alongside the platform, for example `PC · Steam`.
The API requires a defined platform for video games and rejects a disc format
on those items. Movies and TV series require a disc format and cannot set a
platform. Board and card games (`mediaType: 4`) require `mediaFormat` 4 (board
game), 5 (card game) or 99 (other game). They cannot set a platform or store.
This uses the existing MediaFormat column; no schema migration is required.
Existing items without a game type remain unchanged and display a dash until
a type is selected during editing. The category URL and MediaType value remain
unchanged; its visible name is Lauta- ja korttipelit / Board and card games.

The name is required (up to 300 characters); information is optional (up to
10,000 characters). Success returns HTTP 201 and the saved item with its ID.
Invalid input returns 400; a database error returns 503.

`PUT /api/collection/{id}` updates an existing item with the same JSON fields and
validation as POST. It returns HTTP 200 with the updated item, or 404 if it no
longer exists. `DELETE /api/collection/{id}` deletes that item and returns 204,
or 404 if it does not exist. Database errors return 503 for both operations.
The client asks for confirmation before sending DELETE and reloads the table
after either operation, preserving the selected category filter.

The connection string `ConnectionStrings:Collection` points to
`Data/MyMediaCollection.db`, relative to the API project's content root. The
database must already contain the manually managed `Collection` table with
`Id INTEGER PRIMARY KEY`, `Name TEXT NOT NULL`, `MediaType INTEGER NOT NULL`,
`MediaFormat INTEGER`, `Platform INTEGER`, `Store INTEGER`, and `Info TEXT`.
The API creates no databases or tables.
Run `MyMediaCollection.API/Data/Migrations/003-add-item-metadata.sql` once after
the first two migrations to add nullable `CreatedAt TEXT`, `UpdatedAt TEXT`, and
`UserId TEXT` columns. Existing items keep NULL for unknown historical metadata.
The local workspace database has this migration applied as well.

The API assigns `CreatedAt` on insertion and `UpdatedAt` on each successful edit.
Timestamps are stored in UTC ISO 8601 format. A newly added item has no
`UpdatedAt` until it is edited; edits preserve `CreatedAt`. GET, POST and PUT
responses include `createdAt`, `updatedAt` and `userId` (nullable).
These fields are server managed and cannot be assigned through POST or PUT.
`UserId` is a nullable text identifier reserved for future authentication, not a
username supplied by the client. It remains NULL for newly added items until
authentication is implemented; updates preserve any existing ownership value.
There is no users table, foreign key or user-based access filtering yet. The
user identifier type and foreign key should be finalized with authentication.

For an existing database without the Platform column, run
`MyMediaCollection.API/Data/Migrations/001-add-platform.sql` once. It adds a
nullable column and preserves existing data. Games without a platform remain
unassigned until a console is selected when editing; old disc values are never
interpreted as platform values. For a database without Store, run
`MyMediaCollection.API/Data/Migrations/002-add-store.sql` once after the first
migration. Both columns are nullable and existing data is preserved. The local
workspace database has already been updated. Restart and rebuild the backend
after updating the source code.
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

## TMDB search and import

Manual addition remains available for every category. The separate **Add with
TMDB search** dialog is available on All, Movies and TV series. Search results
use the selected UI language (`fi-FI` or `en-US`), support pagination, and let
the user choose a title before entering their copy's format and personal notes.
The item name is prefilled but can be changed. Search alone saves nothing.

Run `MyMediaCollection.API/Data/Migrations/004-add-tmdb-metadata.sql` once after
migration 003. It adds `TmdbMetadata` and the nullable `Collection.TmdbMetadataId`
foreign key. This migration has been applied to the local workspace database;
its existing items are preserved and remain unlinked. Restart/rebuild the API
after a source update. Migrations are explicit and are not run at startup.

`TmdbMetadata` stores the TMDB ID, media type, language, localized and original
titles, overview, release/first-air date, poster path and UTC fetch timestamp.
The combination of TMDB ID, media type and language is unique: multiple copies
can share metadata, while a movie and a TV series with the same numeric ID
remain distinct. Metadata and the new collection item are saved in one
transaction. Regular editing preserves the link and personal fields remain
separate from TMDB metadata. Changing category through the API clears the link.
Deleting a copy does not remove metadata used by other copies.

Set credentials on the **backend only**, using .NET user secrets from the
repository root (replace the placeholder locally):

```powershell
dotnet user-secrets set "Tmdb:ApiKey" "YOUR_TMDB_API_KEY" --project Backend/MyMediaCollection.API
```

Alternatively set `Tmdb:ReadAccessToken` to TMDB's API Read Access Token. When
both are present, the read access token takes precedence. Environment variables
`Tmdb__ApiKey` and `Tmdb__ReadAccessToken` are also supported. Do not place
credentials in Client files, `VITE_` variables or tracked settings. User secrets
are loaded in Development. Use the hosting environment's secret configuration
for deployment. No real credential is included in this repository.

`GET /api/tmdb/search?query=Matrix&mediaType=1&language=fi-FI&page=1`
returns normalized results. `mediaType` is 1 (movie) or 2 (TV series).
`POST /api/tmdb/import` accepts:

```json
{
  "tmdbId": 603,
  "language": "fi-FI",
  "item": {
    "name": "The Matrix",
    "mediaType": 1,
    "mediaFormat": 2,
    "info": "My copy's notes"
  }
}
```

The backend fetches canonical details from TMDB before saving; it does not trust
poster paths or metadata supplied by the browser. API responses contain
`tmdbMetadataId`, `tmdbId` and `posterPath` (null for manual items). Posters use
TMDB's HTTPS image CDN and are shown beside the item name. Image bytes are not
stored in SQLite. The UI includes TMDB's logo and attribution notice.

Missing credentials return 503 with code `tmdb_not_configured`; invalid
credentials, network errors and timeouts return a controlled error. Search or
import failure leaves manual addition available and does not save a partial
item. HttpClient URL logging is disabled for this client because API-key
authentication uses a query parameter.

Integration tests use a local mock TMDB server and test credentials. The
server-side `Tmdb:BaseUrl` setting exists for this isolated setup; leave it unset
in normal use so requests go to `https://api.themoviedb.org/3/`.

References: [TMDB authentication](https://developer.themoviedb.org/docs/authentication-application),
[images](https://developer.themoviedb.org/docs/image-basics), and
[attribution](https://developer.themoviedb.org/docs/faq).
