# MyMediaCollection

## Backend

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
`Backend/MyMediaCollection.API/Models/GamePlatform.cs`; the corresponding client options
are in `Client/src/models/collection.ts`. Platforms 1–25 cover Xbox, PlayStation,
Nintendo and Sega consoles; PC is platform 26. Digital PC games require `store`, a
numeric `GameStore` enum value: Steam = 1, GOG = 2, Epic Games Store = 3,
Microsoft Store = 4, EA app = 5, Ubisoft Store = 6, Battle.net = 7, itch.io = 8,
Xbox Store = 9 and PlayStation Store = 10. Other remains 99.

```json
{
  "name": "PC game",
  "mediaType": 3,
  "platform": 26,
  "store": 1
}
```

The Digital store field is shown for every video game. It is optional for
console games; digital PC games require it. Selecting a physical copy clears
and disables the field. Other categories omit `store` or set it to null.
The forms offer Xbox Store for Xbox platforms, PlayStation Store for PlayStation
platforms, and PC stores (Steam through itch.io) for PC. Other remains available
for each platform; unlisted platforms use Other, while the Other platform allows
the full store list. Changing platform clears an incompatible selected store;
changing to another category omits it when saving. The table
displays a selected store alongside any platform, for example `PC · Steam` or
`PlayStation 5 · PlayStation Store`.
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
Run `Backend/MyMediaCollection.API/Data/Migrations/003-add-item-metadata.sql` once after
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
`Backend/MyMediaCollection.API/Data/Migrations/001-add-platform.sql` once. It adds a
nullable column and preserves existing data. Games without a platform remain
unassigned until a console is selected when editing; old disc values are never
interpreted as platform values. For a database without Store, run
`Backend/MyMediaCollection.API/Data/Migrations/002-add-store.sql` once after the first
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

Run `Backend/MyMediaCollection.API/Data/Migrations/004-add-tmdb-metadata.sql` once after
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

## IGDB video game search and import

The **Add with IGDB search** button is available on All and Video games. It uses
the same search-dialog component as TMDB while keeping the workflows separate:
IGDB imports require the user's platform; digital PC copies also require a game store.
Manual addition remains available. IGDB's platform names are shown as reference;
they are not confused with the application's own platform enum values.
Searches retrieve the game title, overview, first release date, platforms and
cover. IGDB text is shown as returned (usually English), without claiming a
Finnish translation. The interface itself is localized.

IGDB authentication requires a Twitch application's **Client ID and Client
Secret**, not a TMDB-style API key. Set them locally on the backend:

```powershell
dotnet user-secrets set "Igdb:ClientId" "YOUR_TWITCH_CLIENT_ID" --project Backend/MyMediaCollection.API
dotnet user-secrets set "Igdb:ClientSecret" "YOUR_TWITCH_CLIENT_SECRET" --project Backend/MyMediaCollection.API
```

Start/restart the API with the Development launch profile after setting secrets.
For deployed environments use `Igdb__ClientId` and `Igdb__ClientSecret` in the
host's secret configuration. Neither value belongs in frontend files or Git.
The backend obtains an app token from Twitch, caches it until shortly before
expiry, and retries a rejected token once with a fresh token. IGDB requests are
serialized with at least 300 ms between starts to stay below the documented
four-requests-per-second limit. Credentials and tokens are never returned to
the browser; logging is disabled for the IGDB and OAuth HTTP clients.

Migration `Backend/MyMediaCollection.API/Data/Migrations/005-add-igdb-metadata.sql`
creates `IgdbMetadata` and the nullable `Collection.IgdbMetadataId` foreign key.
It has been applied to the local workspace database after a backup. Other
databases must run it once after migration 004 before starting the new API.
Existing collection items and TMDB links are preserved.

IGDB metadata is unique by IGDB game ID and stores the title, overview, release
date, cover image ID, platform names and UTC fetch time. It is stored in the
same transaction as the new collection item. Multiple console/PC copies can
share game metadata while retaining their own name, platform, store and notes.
Ordinary edits preserve the link; changing category through the API clears it.
Deleting a copy does not delete shared metadata. Covers are loaded over HTTPS
from IGDB's image CDN and are shown in the table and editor.

`GET /api/igdb/search?query=Halo&page=1` returns `page`, `hasNextPage`, and up to
20 normalized results. `POST /api/igdb/import` accepts:

```json
{
  "igdbId": 1942,
  "item": {
    "name": "My game",
    "mediaType": 3,
    "mediaFormat": null,
    "platform": 9,
    "info": "My copy's notes"
  }
}
```

For digital PC use `platform: 26` and supply `store`. The server re-fetches canonical
IGDB details before saving and does not trust metadata sent by the browser.
Collection responses include nullable `igdbMetadataId`, `igdbId` and
`coverImageId`. Controlled error codes distinguish missing configuration (503),
credentials/network errors (502), rate limiting (429), and missing games (404).
Search input is length-limited and escaped as an APICalypse string literal.

Tests use local IGDB/OAuth mocks. The server-only `Igdb:BaseUrl` and
`Igdb:TokenUrl` settings support that isolation; leave them unset in normal use.
Live IGDB requests require real credentials and are not part of automated tests.
See [IGDB documentation](https://api-docs.igdb.com/) and
[Twitch client credentials](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow).

## Stored source details in the editor

Collection GET, POST/import and PUT responses include nullable `sourceMetadata`.
For linked items it contains the source (`TMDB` or `IGDB`), source title,
original title when available, overview, release/first-air date, data language,
source platform names and UTC retrieval timestamp. Manual items return null.
These values are read from the existing metadata tables; no additional schema
migration or external API call is needed to open the editor. Metadata is loaded
in batches for the linked IDs, rather than making a request for every row.

The editor shows this information read-only, separately from the user's name,
format/platform/store and personal notes. Source text is displayed as stored,
while labels and date formatting follow the UI language. Unknown dates and
missing overviews have localized placeholders. Saving personal changes does not
overwrite the cached source metadata.

## Physical video game copies

Migration `Backend/MyMediaCollection.API/Data/Migrations/006-add-physical-copy.sql` adds
nullable `IsPhysical INTEGER`, constrained to 0/1 or NULL. It has been applied to
the local database after a backup, preserving existing rows and leaving their
historical copy type unknown (NULL). Run it once after migration 005 in other
databases before starting this version of the API.

Video game addition, IGDB import and editing have a **Physical copy** checkbox.
`isPhysical: true` denotes a physical copy and false a digital copy. New game
requests without the field default to false; historical NULL values appear
unchecked in the editor and are recorded as the selected checkbox value when
saved. Non-game items keep NULL and cannot set this field through the API.
The flag is stored with the user's collection copy, not the shared IGDB record.

All video games can select any defined store or Other. The store may be cleared
for a console or physical PC game. Digital PC games require one. The new console
store enum values are 9 (Xbox Store) and 10 (PlayStation Store); existing enum
values are unchanged. Regular POST/PUT and IGDB import all use the same rules.

## Localized TMDB item names

Migration `Backend/MyMediaCollection.API/Data/Migrations/007-add-custom-name.sql` adds
`Collection.IsNameCustom`. The local database has been migrated after a backup;
other databases must run it once after migration 006. Existing manual and
renamed items default to custom names. A linked movie/TV item whose stored name
exactly matches its cached TMDB title is classified as automatic. Existing names
and other collection data are not rewritten by the migration.

TMDB imports fetch both `fi-FI` and `en-US` details and reuse the existing
`TmdbMetadata` table's unique TMDB ID/media type/language key. No separate
translation table is needed. `useLocalizedName` on the TMDB import request states
whether the user kept the suggested name. When omitted, the backend compares
the supplied name with the primary source title. A custom name is kept in
`Collection.Name`; language selection never overwrites this stored field.

Collection responses include `isNameCustom` and nullable `localizedTitles`,
for example `{ "fi": "Tappajahai", "en": "Jaws" }`. Automatic TMDB movie/TV
names follow the UI language, falling back to the original title, then another
available translation, then the stored name. Manual items, renamed copies and
IGDB items always display their stored name. Search matches the stored name,
both cached TMDB titles and the original title, combined with category filtering.

The edit form opens with the displayed name and sends `nameWasEdited` for linked
TMDB items. False preserves both the stored name and its custom/automatic state
when saving unrelated changes. True marks the new name as custom. API callers
that omit this flag mark a changed name as custom through the normal comparison.

On collection load, the backend fills missing Finnish/English details for
existing TMDB links using the configured credentials, with up to three parallel
requests. Successful translations are persisted. Missing credentials skip this
work; TMDB errors preserve collection access and use cached/original names.
Failed translation attempts have a two-minute retry delay (five minutes for
empty translations). Changing the UI language uses cached titles and makes no
new API request. Secondary-language failures do not block a primary-language
import. Both languages' overviews are also persisted in the existing metadata
rows and returned as `sourceMetadata.localizedOverviews`. The editor displays the
overview in the UI language, falling back to the other language when unavailable,
or the no-overview message when neither exists. Legacy responses without this
dictionary use the original overview. The source-language row is hidden.

## TV seasons, episodes and ownership

Migration `Backend/MyMediaCollection.API/Data/Migrations/008-add-tv-season-ownership.sql`
adds nullable TMDB season/episode totals and cached season details, the
`Collection.IsCompleteBox` flag, and `CollectionSeasons`. The migration has been
applied locally after a backup, preserving existing collection and source data.
Run it once after migration 007 for other databases before starting the API.
Existing items start without an inferred complete box or owned seasons.

TMDB TV details include `numberOfSeasons`, `numberOfEpisodes`, and `seasons`
(season number, localized name and episode count). Search selection retrieves
these through `GET /api/tmdb/details?tmdbId=603&mediaType=2&language=fi-FI` before
showing ownership choices. Season 0 (specials) is excluded from regular-season
choices. Cached source details show the totals in the editor. Collection loading
fills missing totals for older linked series using the existing TMDB retry and
credential handling; source totals are never inferred from user ownership.

Manual addition, TMDB import and editing can set TV-only fields:

```json
{
  "name": "My series",
  "mediaType": 2,
  "mediaFormat": 2,
  "isCompleteBox": false,
  "ownedSeasons": [
    { "seasonNumber": 1, "mediaFormat": 1 },
    { "seasonNumber": 3, "mediaFormat": 3 }
  ]
}
```

The default format is retained on the collection item; each owned season has its
own DVD/Blu-ray/4K UHD Blu-ray/Other format. The table displays distinct owned
formats and a Complete box marker where selected. With a complete box, all known
regular seasons are included on save, preserving explicit per-season formats and
using the default for missing ones. Manual series can enter a season count to
build selection choices without requiring TMDB. That count is a form aid, not
TMDB metadata; the owned season rows and complete-box flag are persisted.

Unchecked seasons are not stored. Unchecking one season clears the complete-box
checkbox; clearing the checkbox alone retains individual selections. Existing
selections are restored when editing. Old API callers that omit both ownership
fields preserve existing ownership on unrelated edits. Supplying an empty
`ownedSeasons` list explicitly clears the selections. Clearing only the box flag
preserves existing seasons. Ownership fields are rejected for non-TV categories.
Season numbers must be unique and between 1 and 1000; only disc-format enums are
allowed. Item updates and season replacements share a transaction, and deleting
an item cascades to its owned season rows. Shared TMDB metadata remains intact.

## Cover links to source pages

Table and editor covers open the item's TMDB movie/TV page or IGDB game page in
a new tab. TMDB URLs use the stored ID and category. IGDB URLs use the validated
slug provided by IGDB, never a name guessed from the editable collection title.
Migration `009-add-igdb-source-url.sql` adds `IgdbMetadata.SourceUrl`; apply it
once after migration 008 before running the updated API. Existing game links
are filled on collection loading when IGDB credentials are configured, without
changing stored titles or other metadata. Successful links are persisted;
failed attempts retry after two minutes and missing slugs after five minutes.
The collection remains accessible if IGDB is unavailable. Manual items without
a source link keep a plain image. Links support keyboard focus and announce
the source and new tab in both UI languages.

## BoardGameGeek search and import

BGG search is available in All and Board/card games alongside manual addition.
The integration uses the authenticated XML API2 (`search` and `thing`) and keeps
the application token on the backend. Configure the approved application's token
from the repository root, then restart the backend:

```powershell
dotnet user-secrets set "Bgg:ApiKey" "YOUR_BGG_APPLICATION_TOKEN" --project Backend/MyMediaCollection.API
```

For deployment, use the environment variable `Bgg__ApiKey`. Never put this token
in a frontend `.env` file or committed application settings. See the official
[BGG authentication guide](https://boardgamegeek.com/using_the_xml_api) and
[XML API2 reference](https://boardgamegeek.com/wiki/page/BGG_XML_API2).

Apply `Backend/MyMediaCollection.API/Data/Migrations/010-add-bgg-metadata.sql` once after
migration 009 before running the updated API. It creates `BggMetadata` and a
nullable `Collection.BggMetadataId` reference. Existing items remain unchanged.
The local database is backed up before applying this migration. No automatic
schema changes happen on application startup.

Endpoints:

- `GET /api/bgg/search?query=Catan&page=1`: board games and expansions, including
  card games catalogued by BGG, paginated locally at 20 results per page.
- `GET /api/bgg/details?bggId=13`: primary title, description, publication year,
  cover, player range, play time and suggested age.
- `POST /api/bgg/import`: `{ "bggId": 13, "item": { "name": "CATAN",
  "mediaType": 4, "mediaFormat": 4, "info": "Own notes" } }`.

The client selects board game (4), card game (5) or other (99) explicitly; BGG's
board-game category does not reliably distinguish physical card games. Source
details are read-only and separate from the collection name and personal notes.
BGG descriptions are displayed as plain text, usually English. Covers link to
the BGG item in the table and editor, with the existing tooltip and hover styles.
BGG attribution is shown in the import dialog and tables containing BGG items.

Imports obtain canonical details from BGG or its server cache rather than trusting
browser-supplied metadata. Metadata is shared between copies, saved atomically
with collection items, and preserved on edits. Changing category detaches the
link; deleting a copy leaves shared metadata intact. Only BGG image hosts are
accepted. XML external entities and DTDs are disabled and document size is limited.

Outgoing BGG calls are serialized with a five-second minimum spacing; search
results are cached for ten minutes and details for 24 hours in backend memory.
BGG's queued response (202), authentication errors, throttling and malformed XML
produce controlled form/snackbar errors without partial saves. Cancellation is
forwarded. For isolated tests, `Bgg:BaseUrl` and
`Bgg:RequestIntervalMilliseconds` can point to the local mock with a zero delay;
production defaults to `https://boardgamegeek.com/xmlapi2/` and 5000 ms.

### BGG expansions and required games

Migration `011-add-bgg-expansion-details.sql` adds nullable `IsExpansion` and
`RequiredGamesJson` to `BggMetadata`. Apply it after migration 010; existing
entries start with unknown classification rather than being assumed base games.
On collection loading, missing classifications are fetched using the existing
BGG credentials, cache and request spacing. Only the expansion fields are
updated, preserving source titles, descriptions and personal copy details.
Failures keep the collection accessible and retry after two minutes.

Search and details expose `isExpansion` from the XML item type
`boardgameexpansion`. Required games come from `link type="boardgameexpansion"`
with `inbound="true"`; outgoing links describe expansions for the item and are
excluded. IDs and names are validated and deduplicated, self-links are ignored,
and BGG URLs are generated from IDs. More than one required game can be listed,
including another expansion. An empty list means BGG lists no requirements;
the UI does not infer that the expansion is independently playable.

The import preview shows the source classification and required-game links.
The editor uses the source values as defaults for the editable collection
classification and base games described below. BGG source metadata itself is
preserved. The classification is separate from board/card/other format.

Table required-game badges have no underline. A BGG ID match anywhere in the
loaded collection opens that copy's editor, including when its row is hidden by
search. Renamed copies are matched by BGG ID rather than title. If several
copies share an ID, the first in collection order is selected. When no copy
exists, the badge opens the BGG page in a new tab. Saving through this editor
refreshes the collection and focus returns to the badge after closing.

### Editable tabletop classification and base games

Migration `012-add-board-game-classification.sql` adds nullable
`Collection.BoardGameKind` and `Collection.BaseGamesJson`; apply it after
migration 011. Existing manual tabletop items default to Base game, while BGG
items retain source defaults until the user saves their own selection.

Manual creation and editing expose a classification dropdown between Name and
Game type: Base game (1), Expansion (2), Other (99). For expansions and Other items, users can
select one or more required games from the collection or enter names manually.
The editor no longer duplicates the classification in the read-only BGG panel.
Table badges follow these editable values, including manually added games.

API requests may supply `boardGameKind` and `baseGames`, for example:

```json
{
  "name": "My expansion",
  "mediaType": 4,
  "mediaFormat": 5,
  "boardGameKind": 2,
  "baseGames": [
    { "collectionItemId": 20 },
    { "name": "A game outside my collection" }
  ]
}
```

Each reference can contain `collectionItemId`, `bggId`, and `name`. Selected
collection references are validated server-side and their names and BGG IDs
come from the stored item. Self-reference, missing items and non-tabletop
references are rejected atomically. Parent renames are reflected on reads;
deleting a parent leaves its saved name and BGG reference available. Parent
deletion never deletes an expansion. Typed names without a BGG ID are plain
tags; collection references open the item editor, and BGG references open the
source page when no owned copy exists.

Omitting the new fields preserves existing choices for older clients. An empty
`baseGames` array clears relationships. Switching to Base game clears
the relationships; switching between Expansion and Other preserves them.
Other items can represent accessories such as figure packs without being marked
as expansions. Switching categories clears tabletop-specific choices.
BGG imports default to provider values, and future provider backfills do not
overwrite user selections. Personal classification and reference saves share
the collection transaction.

### Movie and TV collections

Apply `013-add-media-collections.sql` after migration 012. It adds
`Collection.IsCollection` and the ordered `CollectionContents` table, preserving
existing items as ordinary titles. Back up the database before applying it.

The **Collection** checkbox before Name enables a movie or TV box. A box is one
collection row with its own name and one shared disc format. Manual creation
accepts `isCollection: true` and `collectionContents: [{ "name": "First movie" }]`.
The editor supports changing member names and adding or removing members.
In TMDB import and the editor, drag a member's handle to reorder the contents,
or focus the handle and use the up/down arrow keys. The first member supplies
the cover and TMDB link; the ordered contents are saved with the box.
Click a member's name in TMDB import, or its **Details** button in the editor,
to inspect that member's TMDB information without changing the order.
In the editor, the inspected member also supplies the preview cover, which fades
when the selection changes. Saving sends `coverTmdbId` with the contents and
uses that member's cover and source link in the table. Reopening the editor
retains this choice. The cover must belong to a saved member; omitting
`coverTmdbId` retains the first-member behavior for older API callers.
Each member's saved metadata, including Finnish and English overviews and TV
season/episode counts, is returned in `collectionContents[].sourceMetadata`.
Reordering the contents keeps this information attached to the correct member.
TV boxes do not use individual season ownership or per-season formats.

TMDB imports accept `tmdbIds: [701, 702]` alongside `tmdbId: 701` and
`item.isCollection: true`. Search and select titles repeatedly, then enter a
name for the box. The first selected title supplies its cover and source link.
All titles must belong to the selected category, and the ordered selection is
saved with their TMDB references. The box name remains user-defined when the
interface language changes. Search also matches its member names.

Imports fetch primary metadata for all members before saving; a failed lookup
leaves no partial box. Changes to the item and contents share one transaction.
In the editor, **Add an item to the collection** opens the same TMDB search
dialog in member selection mode. It adds the selected title to the draft box,
using the box's shared format, without creating a separate collection row.
Existing TMDB members cannot be selected again. Canceling the editor discards
the draft member. On save, the API fetches canonical metadata for new TMDB IDs
in `collectionContents`, using `tmdbLanguage` (`fi-FI` or `en-US`, default `en-US`)
and the other supported language. Metadata and box changes are saved together;
a failed primary lookup leaves the box unchanged. Client-supplied posters and
metadata are ignored when saving. No new database migration is needed.
Omitting collection fields preserves an
existing box for older API callers. Turning collection mode off clears the
member list, and deleting a box cascades to its contents while keeping shared
TMDB metadata.
