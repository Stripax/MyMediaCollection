// Run after dotnet build: node --test Backend/tests/collection-api.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, rmdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

test('collection API stores and validates items in an isolated SQLite database', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'media-collection-test-'))
  const databasePath = join(directory, 'test.db')
  const database = new DatabaseSync(databasePath)
  // Fixture matches the manually managed application schema.
  database.exec(`CREATE TABLE Collection (
    Id INTEGER PRIMARY KEY, Name TEXT NOT NULL, MediaType INTEGER NOT NULL,
    MediaFormat INTEGER, Info TEXT
  )`)
  database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/001-add-platform.sql', import.meta.url), 'utf8'))
  database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/002-add-store.sql', import.meta.url), 'utf8'))
  await t.test('metadata migration preserves existing items without inventing historical dates or users', () => {
    const id = Number(database.prepare('INSERT INTO Collection (Name, MediaType, MediaFormat) VALUES (?, ?, ?)')
      .run('Existing item', 1, 2).lastInsertRowid)
    const before = { ...database.prepare('SELECT * FROM Collection WHERE Id = ?').get(id) }
    database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/003-add-item-metadata.sql', import.meta.url), 'utf8'))
    assert.deepEqual({ ...database.prepare('SELECT * FROM Collection WHERE Id = ?').get(id) }, {
      ...before, CreatedAt: null, UpdatedAt: null, UserId: null,
    })
    database.prepare('DELETE FROM Collection WHERE Id = ?').run(id)
  })
  database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/004-add-tmdb-metadata.sql', import.meta.url), 'utf8'))
  database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/005-add-igdb-metadata.sql', import.meta.url), 'utf8'))
  database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/006-add-physical-copy.sql', import.meta.url), 'utf8'))
  await t.test('name migration recognizes imported titles and preserves manual and renamed names', () => {
    const metadataId = Number(database.prepare("INSERT INTO TmdbMetadata (TmdbId,MediaType,Language,Title,OriginalTitle,Overview,FetchedAt) VALUES (9999,1,'fi-FI','Tappajahai','Jaws','','2026-01-01T00:00:00Z')").run().lastInsertRowid);
    database.prepare('INSERT INTO Collection (Name,MediaType,MediaFormat,TmdbMetadataId) VALUES (?,?,?,?)').run('Tappajahai',1,1,metadataId);
    database.prepare('INSERT INTO Collection (Name,MediaType,MediaFormat,TmdbMetadataId) VALUES (?,?,?,?)').run('My custom title',1,1,metadataId);
    database.prepare('INSERT INTO Collection (Name,MediaType,MediaFormat) VALUES (?,?,?)').run('Manual title',1,1);
    database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/007-add-custom-name.sql', import.meta.url), 'utf8'));
    assert.deepEqual(database.prepare('SELECT Name,IsNameCustom FROM Collection ORDER BY Id').all().map(row=>({...row})), [{Name:'Tappajahai',IsNameCustom:0},{Name:'My custom title',IsNameCustom:1},{Name:'Manual title',IsNameCustom:1}]);
    database.exec('DELETE FROM Collection; DELETE FROM TmdbMetadata;');
  })
  database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/008-add-tv-season-ownership.sql', import.meta.url), 'utf8'))
  database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/009-add-igdb-source-url.sql', import.meta.url), 'utf8'))
  database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/010-add-bgg-metadata.sql', import.meta.url), 'utf8'))
  database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/011-add-bgg-expansion-details.sql', import.meta.url), 'utf8'))
  database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/012-add-board-game-classification.sql', import.meta.url), 'utf8'))
  database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/013-add-media-collections.sql', import.meta.url), 'utf8'))
  database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/014-add-collection-versions.sql', import.meta.url), 'utf8'))
  database.exec(readFileSync(new URL('../MyMediaCollection.API/Data/Migrations/015-add-version-history.sql', import.meta.url), 'utf8'))
  const bggRequests = []
  const igdbRequests = []
  const tokenRequests = []
  let rejectNextToken = false
  const tmdbRequests = []
  const tmdbServer = createHttpServer((request, response) => {
    const address = new URL(request.url, 'http://localhost')
    if (address.pathname.startsWith('/bgg/')) {
      bggRequests.push({ path: address.pathname, query: Object.fromEntries(address.searchParams), authorization: request.headers.authorization })
      response.setHeader('Content-Type', 'application/xml')
      const query=address.searchParams.get('query')
      const statuses={unauthorized:401,limited:429,pending:202,unavailable:503}
      if (statuses[query]) { response.writeHead(statuses[query]); response.end(''); return }
      if (query==='broken') { response.end('<items><bad>'); return }
      if (query==='doctype') { response.end('<!DOCTYPE items [<!ENTITY leak SYSTEM "file:///not-readable">]><items>&leak;</items>'); return }
      if (address.pathname.endsWith('/search')) {
        if (query==='expansion') { response.end('<items><item type="boardgame" id="17"><name type="primary" value="Expansion"/></item><item type="boardgameexpansion" id="17"><name type="primary" value="Expansion"/></item></items>'); return }
        const results=query==='empty'?[]:Array.from({length:query==='paginated'?21:1},(_,i)=>`<item type="boardgame" id="${13+i}"><name type="primary" value="CATAN &amp; friends"/><yearpublished value="1995"/></item>`)
        response.end(`<items total="${results.length}">${results.join('')}</items>`); return
      }
      const id=Number(address.searchParams.get('id'))
      if (id===404) { response.end('<items/>'); return }
      if (id===17) { response.end('<items><item type="boardgameexpansion" id="17"><name type="primary" value="Expansion"/><link type="boardgameexpansion" id="13" value="Base &amp; game" inbound="true"/><link type="boardgameexpansion" id="18" value="Required expansion" inbound="true"/><link type="boardgameexpansion" id="13" value="Duplicate" inbound="true"/><link type="boardgameexpansion" id="19" value="Child expansion"/><link type="boardgameexpansion" id="20" value="Outbound false" inbound="false"/><link type="boardgameimplementation" id="21" value="Other relationship" inbound="true"/><link type="boardgameexpansion" id="-1" value="Invalid" inbound="true"/><link type="boardgameexpansion" id="17" value="Self" inbound="true"/><link type="boardgameexpansion" id="22" inbound="true"/></item></items>'); return }
      if (id===23) { response.end('<items><item type="boardgameexpansion" id="23"><name type="primary" value="No requirements listed"/></item></items>'); return }
      response.end(`<items><item type="boardgame" id="${id}"><name type="alternate" value="Alternate"/><name type="primary" value="CATAN &amp; friends"/><description>Game &amp;amp; description&amp;#10;&amp;lt;br/&amp;gt;Second line</description><yearpublished value="1995"/><image>${id===15?'https://untrusted.example/cover.jpg':'https://cf.geekdo-images.com/example/pic123.jpg'}</image><minplayers value="3"/><maxplayers value="4"/><playingtime value="90"/><minage value="10"/></item></items>`); return
    }
    if (address.pathname === '/oauth' || address.pathname === '/igdb/games') {
      let body = '';
      request.on('data', chunk => { body += chunk });
      request.on('end', () => {
        response.setHeader('Content-Type', 'application/json');
        if (address.pathname === '/oauth') {
          tokenRequests.push(Object.fromEntries(new URLSearchParams(body)));
          response.end(JSON.stringify({access_token: 'igdb-test-token-' + tokenRequests.length, expires_in: 3600, token_type: 'bearer'})); return;
        }
        igdbRequests.push({ body, clientId: request.headers['client-id'], authorization: request.headers.authorization });
        if (body.includes('search "unauthorized"') || rejectNextToken) { rejectNextToken = false; response.writeHead(401); response.end('{}'); return; }
        if (body.includes('search "limited"')) { response.writeHead(429); response.end('{}'); return; }
        if (body.includes('search "broken"')) { response.end('{broken json'); return; }
        if (body.includes('where id = 404;')) { response.end('[]'); return; }
        const id = Number(body.match(/where id = (\d+);/)?.[1] ?? 1942);
        const game = {id, name: 'IGDB canonical title', slug: 'game-example', summary: 'Game overview', first_release_date: 1000000000, cover: {image_id: 'igdb_cover'}, platforms: [{id: 6, name: 'PC (Microsoft Windows)'}, {id: 167, name: 'PlayStation 5'}]};
        response.end(JSON.stringify(body.includes('search "paginated"') ? Array.from({length: 21}, (_, index) => ({...game, id: 1942 + index})) : [game]));
      });
      return;
    }
    tmdbRequests.push({ path: address.pathname, query: Object.fromEntries(address.searchParams), authorization: request.headers.authorization })
    response.setHeader('Content-Type', 'application/json')
    if (address.searchParams.get('query') === 'unauthorized') { response.writeHead(401); response.end('{}'); return }
    if (address.searchParams.get('query') === 'limited') { response.writeHead(429); response.end('{}'); return }
    if (address.pathname.endsWith('/404')) { response.writeHead(404); response.end('{}'); return }
    if (address.searchParams.get('query') === 'broken') { response.end('{bad json'); return }
    const tv = address.pathname.includes('/tv')
    const localized = /\/(578|579|580)$/.test(address.pathname);
    if (address.pathname.endsWith('/580') && address.searchParams.get('language') === 'en-US') { response.writeHead(503); response.end('{}'); return; }
    const data = { id: localized ? Number(address.pathname.split('/').at(-1)) : 603, title: 'The Matrix', original_title: 'The Matrix', name: 'TV example', original_name: 'Original TV example', overview: 'TMDB overview', release_date: '1999-03-30', first_air_date: '2001-04-05', poster_path: '/matrix.jpg' }
    if (/\/(701|702|703)$/.test(address.pathname)) { data.id=Number(address.pathname.split('/').at(-1)); data.title=`Movie ${data.id}`; data.name=`Series ${data.id}`; data.poster_path=`/cover-${data.id}.jpg`; data.overview=`Overview ${data.id} ${address.searchParams.get('language')}`; }
    if (tv) Object.assign(data, {number_of_seasons:3,number_of_episodes:24,seasons:[{season_number:0,name:'Specials',episode_count:2},{season_number:1,name:'Season 1',episode_count:8},{season_number:2,name:'Season 2',episode_count:8},{season_number:3,name:'Season 3',episode_count:8}]});
    if (localized) { data.title = address.searchParams.get('language') === 'fi-FI' ? 'Tappajahai' : 'Jaws'; data.original_title = 'Jaws'; data.name = address.searchParams.get('language') === 'fi-FI' ? 'Fi-sarja' : 'English series'; data.original_name = 'Original series'; data.overview = address.searchParams.get('language') === 'fi-FI' ? 'Suomenkielinen yhteenveto' : 'English overview'; }
    response.end(JSON.stringify(address.pathname.includes('/search/') ? { page: 1, total_pages: 2, results: [{ ...data, ...(tv ? {} : { title: 'Matrix – hakutulos' }) }] } : data))
  })
  tmdbServer.listen(0, '127.0.0.1')
  await once(tmdbServer, 'listening')
  t.after(() => new Promise(resolve => tmdbServer.close(resolve)))
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise((resolve) => listener.close(resolve))
  const project = fileURLToPath(new URL('../MyMediaCollection.API/', import.meta.url))
  const server = spawn('dotnet', [process.env.COLLECTION_API_TEST_DLL ?? join(project, 'bin/Debug/net10.0/MyMediaCollection.API.dll')], {
    cwd: project,
    windowsHide: true,
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: 'Development',
      ASPNETCORE_URLS: `http://127.0.0.1:${port}`,
      Logging__EventLog__LogLevel__Default: 'None',
      ConnectionStrings__Collection: `Data Source=${databasePath};Pooling=False`,
      Tmdb__BaseUrl: `http://127.0.0.1:${tmdbServer.address().port}/3/`,
      Tmdb__ReadAccessToken: 'integration-test-token',
      Tmdb__ApiKey: '',
      Bgg__ApiKey: 'bgg-integration-token',
      Bgg__BaseUrl: `http://127.0.0.1:${tmdbServer.address().port}/bgg/`,
      Bgg__RequestIntervalMilliseconds: '0',
      Igdb__ClientId: 'test-client-id',
      Igdb__ClientSecret: 'test-client-secret',
      Igdb__TokenUrl: `http://127.0.0.1:${tmdbServer.address().port}/oauth`,
      Igdb__BaseUrl: `http://127.0.0.1:${tmdbServer.address().port}/igdb/`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  server.stdout.on('data', (data) => { logs += data })
  server.stderr.on('data', (data) => { logs += data })
  t.after(async () => {
    const exited = once(server, 'exit')
    if (server.exitCode === null) {
      server.kill()
      await exited
    }
    database.close()
    rmSync(databasePath)
    rmdirSync(directory)
  })
  const url = `http://127.0.0.1:${port}/api/collection`
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(url)
      ready = true
      break
    } catch {
      if (server.exitCode !== null) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  assert.ok(ready, `API did not start: ${logs}`)
  const post = (body) => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).catch((error) => { throw new Error(`API request failed: ${logs}`, { cause: error }) })

  await t.test('lists an empty collection as an empty array', async () => {
    const response = await fetch(url)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), [])
  })
  await t.test('manual movie and TV boxes store ordered contents and one shared format', async () => {
    for (const mediaType of [1, 2]) {
      const body = { name: 'Manual box', mediaType, mediaFormat: 2, isCollection: true,
        collectionContents: [{ name: ' First ' }, { name: 'Second' }] }
      const created = await post(body)
      assert.equal(created.status, 201)
      const item = await created.json()
      assert.equal(item.isCollection, true)
      assert.equal(item.isNameCustom, true)
      assert.deepEqual(item.collectionContents.map(entry => entry.name), ['First', 'Second'])
      const changed = await fetch(`${url}/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, mediaFormat: 3, collectionContents: [{ name: 'Second' }] }) })
      assert.equal(changed.status, 200)
      const saved = await changed.json()
      assert.equal(saved.mediaFormat, 3)
      assert.deepEqual(saved.collectionContents.map(entry => entry.name), ['Second'])
      assert.deepEqual(saved.ownedSeasons, [])
      const legacyEdit = await fetch(`${url}/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed box', mediaType, mediaFormat: 2 }) })
      assert.equal(legacyEdit.status, 200)
      assert.equal((await legacyEdit.json()).collectionContents.length, 1)
      assert.equal((await fetch(`${url}/${item.id}`, { method: 'DELETE' })).status, 204)
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM CollectionContents WHERE CollectionItemId=?').get(item.id).count, 0)
    }
    for (const extra of [{}, { collectionContents: [] }, { collectionContents: [{ name: ' ' }] },
      { collectionContents: [{ name: 'First' }], ownedSeasons: [{ seasonNumber: 1, mediaFormat: 2 }] }]) {
      assert.equal((await post({ name: 'Invalid box', mediaType: 2, mediaFormat: 2, isCollection: true, ...extra })).status, 400)
    }
  })

  await t.test('TMDB boxes import all members atomically and use the first member cover', async () => {
    const importBox = (body) => fetch(url.replace('/collection', '/tmdb/import'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const body = { tmdbId: 701, tmdbIds: [701, 702], language: 'fi-FI', useLocalizedName: true,
      item: { name: 'Own box name', mediaType: 1, mediaFormat: 2, isCollection: true } }
    const count = database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count
    const response = await importBox(body)
    assert.equal(response.status, 201)
    const item = await response.json()
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count, count + 1)
    assert.equal(item.name, 'Own box name')
    assert.equal(item.isNameCustom, true)
    assert.equal(item.tmdbId, 701)
    assert.equal(item.posterPath, '/cover-701.jpg')
    assert.deepEqual(item.collectionContents.map(entry => entry.tmdbId), [701, 702])
    for (const entry of item.collectionContents) {
      assert.equal(entry.sourceMetadata.title, `Movie ${entry.tmdbId}`)
      assert.equal(entry.sourceMetadata.overview, `Overview ${entry.tmdbId} fi-FI`)
      assert.deepEqual(entry.sourceMetadata.localizedOverviews, { fi: `Overview ${entry.tmdbId} fi-FI`, en: `Overview ${entry.tmdbId} en-US` })
    }
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM TmdbMetadata WHERE TmdbId IN (701,702)').get().count, 4)
    const updated = await fetch(`${url}/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body.item, collectionContents: [...item.collectionContents].reverse() }) })
    assert.equal(updated.status, 200)
    const reordered = await updated.json()
    assert.equal(reordered.posterPath, '/cover-702.jpg')
    const forged = await fetch(`${url}/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body.item, collectionContents: [{ name: 'Forged', tmdbId: 999 }] }) })
    assert.equal(forged.status, 502)
    const persisted = (await (await fetch(url)).json()).find(entry => entry.id === item.id)
    assert.deepEqual(persisted.collectionContents.map(entry => entry.tmdbId), [702, 701])
    assert.deepEqual(persisted.collectionContents.map(entry => entry.sourceMetadata.title), ['Movie 702', 'Movie 701'])
    assert.equal(persisted.sourceMetadata.title, 'Movie 702')
    const selectedCover = await fetch(`${url}/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body.item, coverTmdbId: 701, collectionContents: persisted.collectionContents }) })
    assert.equal(selectedCover.status, 200)
    assert.equal((await selectedCover.json()).posterPath, '/cover-701.jpg')
    const invalidCover = await fetch(`${url}/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body.item, coverTmdbId: 999, collectionContents: persisted.collectionContents }) })
    assert.equal(invalidCover.status, 400)
    const savedCover = (await (await fetch(url)).json()).find(entry => entry.id === item.id)
    assert.equal(savedCover.tmdbId, 701)
    assert.equal(savedCover.posterPath, '/cover-701.jpg')
    assert.equal(savedCover.sourceMetadata.title, 'Movie 701')
    assert.deepEqual(savedCover.collectionContents.map(entry => entry.tmdbId), [702, 701])
    for (const tmdbIds of [[], [701, 701], [702, 701], [701, 0]])
      assert.equal((await importBox({ ...body, tmdbIds })).status, 400)
    const failed = await importBox({ ...body, tmdbIds: [701, 404] })
    assert.equal(failed.status, 404)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count, count + 1)
    assert.equal((await fetch(`${url}/${item.id}`, { method: 'DELETE' })).status, 204)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM CollectionContents WHERE CollectionItemId=?').get(item.id).count, 0)
  })
  await t.test('attaches new TMDB members to an existing box atomically, including bilingual metadata and its selected cover', async () => {
    const imported = await fetch(url.replace('/collection', '/tmdb/import'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdbId: 701, tmdbIds: [701], language: 'fi-FI', item: { name: 'Existing box', mediaType: 1, mediaFormat: 2, isCollection: true } }) })
    assert.equal(imported.status, 201)
    const item = await imported.json()
    const count = database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count
    const update = { name: 'Existing box', mediaType: 1, mediaFormat: 2, isCollection: true, tmdbLanguage: 'fi-FI', coverTmdbId: 703,
      collectionContents: [{ name: 'First', tmdbId: 701 }, { name: 'Third', tmdbId: 703, posterPath: '/forged.jpg', sourceMetadata: { title: 'Forged' } }] }
    const saved = await fetch(`${url}/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) })
    assert.equal(saved.status, 200)
    const result = await saved.json()
    assert.equal(result.posterPath, '/cover-703.jpg')
    assert.deepEqual(result.collectionContents.map(entry => entry.tmdbId), [701, 703])
    assert.equal(result.collectionContents[1].sourceMetadata.title, 'Movie 703')
    assert.deepEqual(result.collectionContents[1].sourceMetadata.localizedOverviews, { fi: 'Overview 703 fi-FI', en: 'Overview 703 en-US' })
    const failed = await fetch(`${url}/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...update, name: 'Must not save', collectionContents: [...update.collectionContents, { name: 'Missing', tmdbId: 404 }] }) })
    assert.equal(failed.status, 404)
    const persisted = (await (await fetch(url)).json()).find(entry => entry.id === item.id)
    assert.equal(persisted.name, 'Existing box')
    assert.equal(persisted.tmdbId, 703)
    assert.equal(persisted.collectionContents.length, 2)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count, count)
    assert.equal((await fetch(`${url}/${item.id}`, { method: 'DELETE' })).status, 204)
  })

  await t.test('returns saved full metadata for every TV collection member in both languages', async () => {
    const response = await fetch(url.replace('/collection', '/tmdb/import'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdbId: 701, tmdbIds: [701, 702], language: 'fi-FI', item: { name: 'Series box', mediaType: 2, mediaFormat: 2, isCollection: true } }),
    })
    assert.equal(response.status, 201)
    const item = await response.json()
    const listed = (await (await fetch(url)).json()).find(entry => entry.id === item.id)
    for (const member of listed.collectionContents) {
      assert.equal(member.sourceMetadata.title, `Series ${member.tmdbId}`)
      assert.equal(member.sourceMetadata.numberOfSeasons, 3)
      assert.equal(member.sourceMetadata.numberOfEpisodes, 24)
      assert.equal(member.sourceMetadata.releaseDate, '2001-04-05')
      assert.equal(member.sourceMetadata.localizedOverviews.en, `Overview ${member.tmdbId} en-US`)
    }
    assert.equal((await fetch(`${url}/${item.id}`, { method: 'DELETE' })).status, 204)
  })
  await t.test('persists enum numbers, Unicode and quoted text with a generated ID', async () => {
    const response = await post({ name: "  Yö — O'Brien  ", mediaType: 2, mediaFormat: 3, info: 'Line 1\nLine 2' })
    assert.equal(response.status, 201)
    const item = await response.json()
    assert.ok(item.id > 0)
    assert.equal(item.name, "Yö — O'Brien")
    assert.equal(item.mediaType, 2)
    assert.equal(item.mediaFormat, 3)
    const row = database.prepare('SELECT * FROM Collection WHERE Id = ?').get(item.id)
    assert.ok(Number.isFinite(Date.parse(item.createdAt)))
    assert.equal(Date.parse(item.createdAt), Date.parse(row.CreatedAt))
    assert.deepEqual({ ...row }, { Id: item.id, Name: item.name, MediaType: 2, MediaFormat: 3, Platform: null, Store: null, Info: 'Line 1\nLine 2', CreatedAt: row.CreatedAt, UpdatedAt: null, UserId: null, TmdbMetadataId: null, IgdbMetadataId: null, BggMetadataId: null, IsPhysical: null, IsNameCustom: 1, IsCompleteBox: 0, BoardGameKind: null, BaseGamesJson: null, IsCollection: 0 })
  })
  await t.test('supports every enum value and optional information', async () => {
    for (const mediaType of [1, 2]) {
      for (const mediaFormat of [1, 2, 3]) {
        const response = await post({ name: 'Test', mediaType, mediaFormat })
        assert.equal(response.status, 201)
        assert.equal((await response.json()).info, null)
      }
    }
  })
  await t.test('lists persisted items newest first with numeric enums and nullable fields', async () => {
    const id = Number(database.prepare('INSERT INTO Collection (Name, MediaType) VALUES (?, ?)')
      .run('Manually added item', 4).lastInsertRowid)
    const response = await fetch(url)
    assert.equal(response.status, 200)
    const items = await response.json()
    assert.equal(items.length, Number(database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count))
    assert.deepEqual(items[0], { id, versions: items[0].versions, name: 'Manually added item', mediaType: 4, mediaFormat: null, platform: null, store: null, info: null, createdAt: null, updatedAt: null, userId: null, tmdbMetadataId: null, tmdbId: null, posterPath: null, igdbMetadataId: null, igdbId: null, coverImageId: null, bggMetadataId: null, bggId: null, bggImageUrl: null, boardGameKind: 1, baseGames: [], sourceMetadata: null, isPhysical: null, isNameCustom: true, localizedTitles: null, isCompleteBox: false, ownedSeasons: [], isCollection: false, collectionContents: [] })
    assert.ok(items.every((item, index) => index === 0 || items[index - 1].id > item.id))
    assert.equal(items.at(-1).name, "Yö — O'Brien")
    for (const item of items.slice(1)) {
      assert.equal(typeof item.mediaType, 'number')
      assert.equal(typeof item.mediaFormat, 'number')
    }
  })
  await t.test('persists console platforms separately from disc formats and supports editing games', async () => {
    for (let platform = 1; platform <= 25; platform++) {
      const response = await post({ name: `Console game ${platform}`, mediaType: 3, platform, mediaFormat: null })
      assert.equal(response.status, 201)
      const item = await response.json()
      assert.equal(item.platform, platform)
      assert.equal(item.mediaFormat, null)
      const row = database.prepare('SELECT Platform, MediaFormat FROM Collection WHERE Id = ?').get(item.id)
      assert.deepEqual({ ...row }, { Platform: platform, MediaFormat: null })
    }
    const latest = database.prepare('SELECT MAX(Id) AS id FROM Collection').get().id
    const edit = await fetch(`${url}/${latest}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'PS5 game', mediaType: 3, platform: 9 }),
    })
    assert.equal(edit.status, 200)
    assert.equal((await edit.json()).platform, 9)
    const list = await (await fetch(url)).json()
    assert.equal(list[0].platform, 9)
    assert.equal(list[0].mediaFormat, null)
    const convert = await fetch(`${url}/${latest}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Movie instead', mediaType: 1, mediaFormat: 2 }),
    })
    assert.equal(convert.status, 200)
    assert.deepEqual({ ...database.prepare('SELECT Platform, MediaFormat FROM Collection WHERE Id = ?').get(latest) }, { Platform: null, MediaFormat: 2 })
  })
  await t.test('creates and edits PC games with stores and clears the store when changing platforms', async () => {
    for (let store = 1; store <= 10; store++) {
      const response = await post({ name: `PC game ${store}`, mediaType: 3, platform: 26, store })
      assert.equal(response.status, 201)
      const item = await response.json()
      assert.equal(item.platform, 26)
      assert.equal(item.store, store)
      assert.equal(item.mediaFormat, null)
      assert.deepEqual({ ...database.prepare('SELECT Platform, Store, MediaFormat FROM Collection WHERE Id = ?').get(item.id) },
        { Platform: 26, Store: store, MediaFormat: null })
    }
    const id = database.prepare('SELECT MAX(Id) AS id FROM Collection').get().id
    const edit = await fetch(`${url}/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'GOG game', mediaType: 3, platform: 26, store: 2 }),
    })
    assert.equal(edit.status, 200)
    assert.equal((await edit.json()).store, 2)
    assert.equal((await (await fetch(url)).json())[0].store, 2)
    const consoleEdit = await fetch(`${url}/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Console edition', mediaType: 3, platform: 9 }),
    })
    assert.equal(consoleEdit.status, 200)
    assert.equal((await consoleEdit.json()).store, null)
    assert.equal(database.prepare('SELECT Store FROM Collection WHERE Id = ?').get(id).Store, null)
  })
  await t.test('creates, reads and edits Other formats, platforms and PC stores', async () => {
    for (const fields of [
      { mediaType: 1, mediaFormat: 99 },
      { mediaType: 2, mediaFormat: 99 },
      { mediaType: 3, platform: 99 },
      { mediaType: 3, platform: 26, store: 99 },
    ]) {
      const response = await post({ name: 'Other selection', ...fields })
      assert.equal(response.status, 201)
      const item = await response.json()
      assert.equal(item.mediaFormat, fields.mediaFormat ?? null)
      assert.equal(item.platform, fields.platform ?? null)
      assert.equal(item.store, fields.store ?? null)
      const edit = await fetch(`${url}/${item.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Edited Other selection', ...fields, info: 'Custom details' }),
      })
      assert.equal(edit.status, 200)
      const listed = (await (await fetch(url)).json()).find((row) => row.id === item.id)
      assert.equal(listed.name, 'Edited Other selection')
      assert.equal(listed.mediaFormat, fields.mediaFormat ?? null)
      assert.equal(listed.platform, fields.platform ?? null)
      assert.equal(listed.store, fields.store ?? null)
      assert.deepEqual({ ...database.prepare('SELECT MediaFormat, Platform, Store FROM Collection WHERE Id = ?').get(item.id) }, {
        MediaFormat: fields.mediaFormat ?? null, Platform: fields.platform ?? null, Store: fields.store ?? null,
      })
    }
  })
  await t.test('persists physical copy flags and console stores and supports changing the flag', async () => {
    for (const store of [9, 10]) {
      const response = await post({name: 'Console copy', mediaType: 3, platform: 9, store, isPhysical: true})
      assert.equal(response.status, 201)
      const item = await response.json()
      assert.equal(item.isPhysical, true)
      assert.equal(item.store, store)
      assert.equal(database.prepare('SELECT IsPhysical FROM Collection WHERE Id = ?').get(item.id).IsPhysical, 1)
      const edit = await fetch(`${url}/${item.id}`, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Digital copy',mediaType:3,platform:9,store,isPhysical:false})})
      assert.equal(edit.status, 200)
      assert.equal((await edit.json()).isPhysical, false)
      assert.equal(database.prepare('SELECT IsPhysical FROM Collection WHERE Id = ?').get(item.id).IsPhysical, 0)
      assert.equal((await (await fetch(url)).json()).find(entry=>entry.id===item.id).isPhysical, false)
    }
    const pc = await post({name:'Physical PC',mediaType:3,platform:26,isPhysical:true})
    assert.equal(pc.status,201)
    const item = await pc.json()
    assert.equal(item.isPhysical,true)
    assert.equal(item.store,null)
    for (const invalid of [{name:'Movie',mediaType:1,mediaFormat:2,isPhysical:true},{name:'Bad flag',mediaType:3,platform:9,isPhysical:'yes'}])
      assert.equal((await post(invalid)).status,400)
  })
  await t.test('rejects missing and invalid PC stores and stores on other categories', async () => {
    const before = database.prepare('SELECT * FROM Collection ORDER BY Id').all()
    for (const fields of [
      { mediaType: 3, platform: 26 },
      { mediaType: 3, platform: 26, store: 0 },
      { mediaType: 3, platform: 26, store: 999 },
      { mediaType: 3, platform: 26, store: 'Steam' },
      { mediaType: 3, platform: 9, store: 999 },
      { mediaType: 4, store: 1 },
      { mediaType: 1, mediaFormat: 1, store: 1 },
    ]) {
      const body = JSON.stringify({ name: 'Invalid', ...fields })
      assert.equal((await post({ name: 'Invalid', ...fields })).status, 400)
      const response = await fetch(`${url}/1`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
      assert.equal(response.status, 400)
    }
    assert.deepEqual(database.prepare('SELECT * FROM Collection ORDER BY Id').all(), before)
  })
  await t.test('creates and edits board, card and other games without a platform', async () => {
    for (const mediaFormat of [4, 5, 99]) {
      const response = await post({ name: 'Tabletop game', mediaType: 4, mediaFormat })
      assert.equal(response.status, 201)
      const item = await response.json()
      assert.equal(item.mediaFormat, mediaFormat)
      assert.equal(item.platform, null)
      assert.equal(database.prepare('SELECT MediaFormat FROM Collection WHERE Id = ?').get(item.id).MediaFormat, mediaFormat)
    }
    const created = await post({ name: 'Board game', mediaType: 4, mediaFormat: 4 })
    assert.equal(created.status, 201)
    const item = await created.json()
    assert.equal(item.mediaFormat, 4)
    assert.equal(item.platform, null)
    const edit = await fetch(`${url}/${item.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Edited card game', mediaType: 4, mediaFormat: 5, platform: null, info: 'Notes' }),
    })
    assert.equal(edit.status, 200)
    assert.deepEqual({ ...database.prepare('SELECT Name, MediaFormat, Platform, Info FROM Collection WHERE Id = ?').get(item.id) },
      { Name: 'Edited card game', MediaFormat: 5, Platform: null, Info: 'Notes' })
    const game = await (await post({ name: 'Game to reclassify', mediaType: 3, platform: 9 })).json()
    const convert = await fetch(`${url}/${game.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Reclassified other game', mediaType: 4, mediaFormat: 99 }),
    })
    assert.equal(convert.status, 200)
    assert.deepEqual({ ...database.prepare('SELECT MediaFormat, Platform FROM Collection WHERE Id = ?').get(game.id) },
      { MediaFormat: 99, Platform: null })
  })
  await t.test('rejects category mismatches, missing platforms and nonnumeric platform values', async () => {
    const before = database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count
    const invalid = [
      { mediaType: 3 },
      { mediaType: 3, platform: 0 },
      { mediaType: 3, platform: 999 },
      { mediaType: 3, platform: 'PC' },
      { mediaType: 3, platform: 'Steam' },
      { mediaType: 3, platform: 1, mediaFormat: 1 },
      { mediaType: 1, mediaFormat: 1, platform: 1 },
      { mediaType: 2, mediaFormat: null },
      { mediaType: 4, mediaFormat: 1 },
      { mediaType: 4 },
      { mediaType: 4, mediaFormat: null },
      { mediaType: 4, platform: 9 },
    ]
    for (const fields of invalid) {
      assert.equal((await post({ name: 'Invalid', ...fields })).status, 400)
      const edit = await fetch(`${url}/1`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Invalid', ...fields }),
      })
      assert.equal(edit.status, 400)
    }
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count, before)
  })
  await t.test('rejects invalid names and enums without inserting rows', async () => {
    const before = database.prepare('SELECT count(*) AS count FROM Collection').get().count
    for (const invalid of [
      { name: '' }, { name: '   ' }, { name: null }, { name: 'x'.repeat(301) },
      { mediaType: 0 }, { mediaType: 5 }, { mediaFormat: 0 }, { mediaFormat: 4 },
      { info: 'x'.repeat(10001) },
    ]) {
      const response = await post({ name: 'Valid', mediaType: 1, mediaFormat: 1, ...invalid })
      assert.equal(response.status, 400, JSON.stringify(invalid).slice(0, 100))
    }
    assert.equal(database.prepare('SELECT count(*) AS count FROM Collection').get().count, before)
  })
  await t.test('updates only the requested item and preserves its ID', async () => {
    const created = await (await post({ name: 'Before edit', mediaType: 1, mediaFormat: 1 })).json()
    const othersBefore = database.prepare('SELECT * FROM Collection WHERE Id != ? ORDER BY Id').all(created.id)
    const response = await fetch(`${url}/${created.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: "  Muokattu O'Brien  ", mediaType: 2, mediaFormat: 3, info: 'Edited\nInfo' }),
    })
    assert.equal(response.status, 200)
    const updated = await response.json()
    const row = database.prepare('SELECT * FROM Collection WHERE Id = ?').get(created.id)
    assert.equal(updated.createdAt, created.createdAt)
    assert.ok(Date.parse(updated.updatedAt) >= Date.parse(created.createdAt))
    assert.equal(Date.parse(updated.updatedAt), Date.parse(row.UpdatedAt))
    assert.deepEqual(updated, {
      id: created.id, versions: updated.versions, name: "Muokattu O'Brien", mediaType: 2, mediaFormat: 3, platform: null, store: null, info: 'Edited\nInfo',
      createdAt: created.createdAt, updatedAt: updated.updatedAt, userId: null,
      tmdbMetadataId: null, tmdbId: null, posterPath: null, igdbMetadataId: null, igdbId: null, coverImageId: null, bggMetadataId: null, bggId: null, bggImageUrl: null, boardGameKind: null, baseGames: [], sourceMetadata: null, isPhysical: null, isNameCustom: true, localizedTitles: null, isCompleteBox: false, ownedSeasons: [], isCollection: false, collectionContents: [],
    })
    assert.deepEqual({ ...database.prepare('SELECT * FROM Collection WHERE Id = ?').get(created.id) }, {
      Id: created.id, Name: "Muokattu O'Brien", MediaType: 2, MediaFormat: 3, Platform: null, Store: null, Info: 'Edited\nInfo',
      CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, UserId: null,
      TmdbMetadataId: null, IgdbMetadataId: null, BggMetadataId: null, IsPhysical: null, IsNameCustom: 1, IsCompleteBox: 0, BoardGameKind: null, BaseGamesJson: null, IsCollection: 0,
    })
    assert.deepEqual(database.prepare('SELECT * FROM Collection WHERE Id != ? ORDER BY Id').all(created.id), othersBefore)
  })
  await t.test('assigns timestamps on the server and preserves creation date and future ownership on edit', async () => {
    const start = Date.now()
    const forgedMetadata = { createdAt: '2000-01-01T00:00:00Z', updatedAt: '2000-01-01T00:00:00Z', userId: 'untrusted-user' }
    const createdResponse = await post({ name: 'Metadata test', mediaType: 1, mediaFormat: 1, ...forgedMetadata })
    assert.equal(createdResponse.status, 201)
    const created = await createdResponse.json()
    assert.ok(Date.parse(created.createdAt) >= start)
    assert.ok(Date.parse(created.createdAt) <= Date.now())
    assert.equal(created.updatedAt, null)
    assert.equal(created.userId, null)
    const before = database.prepare('SELECT CreatedAt FROM Collection WHERE Id = ?').get(created.id)
    assert.match(before.CreatedAt, /Z$/)
    // Simulate ownership populated by a future, trusted authentication implementation.
    database.prepare('UPDATE Collection SET UserId = ? WHERE Id = ?').run('future-user', created.id)
    const editStart = Date.now()
    const response = await fetch(`${url}/${created.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Metadata edited', mediaType: 1, mediaFormat: 2, ...forgedMetadata }),
    })
    assert.equal(response.status, 200)
    const updated = await response.json()
    assert.equal(updated.createdAt, created.createdAt)
    assert.ok(Date.parse(updated.updatedAt) >= editStart)
    assert.ok(Date.parse(updated.updatedAt) <= Date.now())
    assert.equal(updated.userId, 'future-user')
    const stored = database.prepare('SELECT CreatedAt, UpdatedAt, UserId FROM Collection WHERE Id = ?').get(created.id)
    assert.equal(stored.CreatedAt, before.CreatedAt)
    assert.match(stored.UpdatedAt, /Z$/)
    assert.equal(stored.UserId, 'future-user')
    const listed = (await (await fetch(url)).json()).find((item) => item.id === created.id)
    assert.equal(listed.createdAt, created.createdAt)
    assert.equal(listed.updatedAt, updated.updatedAt)
    assert.equal(listed.userId, 'future-user')
  })
  await t.test('rejects invalid edits and does not create a missing item', async () => {
    const created = await (await post({ name: 'Preserve me', mediaType: 2, mediaFormat: 2 })).json()
    const before = database.prepare('SELECT * FROM Collection ORDER BY Id').all()
    for (const invalid of [{ name: '   ' }, { mediaType: 5 }, { mediaFormat: 4 }, { name: 'x'.repeat(301) }, { info: 'x'.repeat(10001) }]) {
      const response = await fetch(`${url}/${created.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Valid', mediaType: 1, mediaFormat: 1, ...invalid }),
      })
      assert.equal(response.status, 400)
    }
    const missing = await fetch(`${url}/999999999`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Missing', mediaType: 1, mediaFormat: 1 }),
    })
    assert.equal(missing.status, 404)
    assert.deepEqual(database.prepare('SELECT * FROM Collection ORDER BY Id').all(), before)
  })
  await t.test('deletes only the requested item and reports missing items', async () => {
    const created = await (await post({ name: 'Delete me', mediaType: 1, mediaFormat: 1 })).json()
    const remaining = database.prepare('SELECT * FROM Collection WHERE Id != ? ORDER BY Id').all(created.id)
    const response = await fetch(`${url}/${created.id}`, { method: 'DELETE' })
    assert.equal(response.status, 204)
    assert.equal(await response.text(), '')
    assert.deepEqual(database.prepare('SELECT * FROM Collection ORDER BY Id').all(), remaining)
    assert.equal((await fetch(`${url}/${created.id}`, { method: 'DELETE' })).status, 404)
    const list = await (await fetch(url)).json()
    assert.ok(list.every((item) => item.id !== created.id))
  })
  await t.test('searches movies and TV with encoded queries and server-side credentials', async () => {
    for (const mediaType of [1, 2]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/tmdb/search?query=${encodeURIComponent('Matrix & yö')}&mediaType=${mediaType}&language=fi-FI&page=2`)
      assert.equal(response.status, 200)
      const result = await response.json()
      assert.equal(result.page, 2)
      assert.equal(result.totalPages, 2)
      assert.equal(result.results[0].tmdbId, 603)
      assert.equal(result.results[0].mediaType, mediaType)
      assert.equal(result.results[0].language, 'fi-FI')
      assert.equal(result.results[0].posterPath, '/matrix.jpg')
      const request = tmdbRequests.at(-1)
      assert.equal(request.path, mediaType === 1 ? '/3/search/movie' : '/3/search/tv')
      assert.equal(request.query.query, 'Matrix & yö')
      assert.equal(request.query.page, '2')
      assert.equal(request.query.include_adult, 'false')
      assert.equal(request.authorization, 'Bearer integration-test-token')
      assert.ok(!JSON.stringify(result).includes('integration-test-token'))
    }
  })
  await t.test('imports canonical metadata atomically, shares it across copies and preserves the link on edit', async () => {
    const importItem = (mediaType, language = 'fi-FI', mediaFormat = 2) => fetch(`http://127.0.0.1:${port}/api/tmdb/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdbId: 603, language, posterPath: '/untrusted.jpg', item: { name: 'My copy', mediaType, mediaFormat, info: 'Own notes' } }),
    })
    const first = await importItem(1)
    assert.equal(first.status, 201)
    const item = await first.json()
    assert.equal(item.tmdbId, 603)
    assert.equal(item.posterPath, '/matrix.jpg')
    assert.equal(item.name, 'My copy')
    assert.equal(item.info, 'Own notes')
    const metadata = database.prepare('SELECT * FROM TmdbMetadata WHERE Id = ?').get(item.tmdbMetadataId)
    assert.equal(metadata.Title, 'The Matrix')
    assert.equal(metadata.Overview, 'TMDB overview')
    assert.equal(metadata.ReleaseDate, '1999-03-30')
    assert.equal(item.sourceMetadata.title, metadata.Title)
    assert.equal(item.sourceMetadata.originalTitle, metadata.OriginalTitle)
    assert.equal(item.sourceMetadata.overview, metadata.Overview)
    assert.equal(item.sourceMetadata.releaseDate, '1999-03-30')
    assert.equal(item.sourceMetadata.language, 'fi-FI')
    assert.equal(item.sourceMetadata.source, 'TMDB')
    assert.deepEqual(item.sourceMetadata.platforms, [])
    assert.match(metadata.FetchedAt, /Z$/)
    const duplicate = await importItem(1)
    assert.equal(duplicate.status, 409)
    assert.equal((await duplicate.json()).existingItemId, item.id)
    assert.equal((await importItem(1, 'en-US')).status, 409)
    const copy = await (await importItem(1, 'fi-FI', 1)).json()
    assert.equal(copy.id, item.id)
    assert.equal(copy.versionAdded, true)
    assert.deepEqual(copy.versions.map(version => version.mediaFormat), [2,1])
    assert.equal(copy.tmdbMetadataId, item.tmdbMetadataId)
    const series = await (await importItem(2)).json()
    assert.notEqual(series.tmdbMetadataId, item.tmdbMetadataId)
    const english = await (await importItem(1, 'en-US', 99)).json()
    assert.equal(english.id, item.id)
    assert.equal(english.tmdbMetadataId, item.tmdbMetadataId)
    assert.deepEqual(english.versions.map(version => version.mediaFormat), [2,1,99])
    const edit = await fetch(`${url}/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Edited copy', mediaType: 1, mediaFormat: 3 }) })
    assert.equal(edit.status, 200)
    const updated = await edit.json()
    assert.equal(updated.tmdbMetadataId, item.tmdbMetadataId)
    assert.equal(updated.tmdbId, 603)
    assert.equal(updated.posterPath, '/matrix.jpg')
    assert.deepEqual(updated.sourceMetadata, { ...item.sourceMetadata, fetchedAt: updated.sourceMetadata.fetchedAt })
    const listed = (await (await fetch(url)).json()).find(entry => entry.id === item.id)
    assert.equal(listed.posterPath, '/matrix.jpg')
    assert.deepEqual(listed.sourceMetadata, updated.sourceMetadata)
    assert.equal((await fetch(`${url}/${series.id}`, { method: 'DELETE' })).status, 204)
    assert.ok(database.prepare('SELECT Id FROM TmdbMetadata WHERE Id = ?').get(item.tmdbMetadataId))
    const changeCategory = await fetch(`${url}/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Changed category', mediaType: 2, mediaFormat: 3 }) })
    assert.equal((await changeCategory.json()).tmdbMetadataId, null)
  })
  await t.test('validates imports and handles upstream failures without storing items', async () => {
    const before = database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count
    const tmdbUrl = `http://127.0.0.1:${port}/api/tmdb`
    for (const [query, status, code] of [['unauthorized', 502, 'tmdb_credentials'], ['limited', 429, 'tmdb_rate_limited'], ['broken', 502, 'tmdb_unavailable']]) {
      const response = await fetch(`${tmdbUrl}/search?query=${query}&mediaType=1`)
      assert.equal(response.status, status)
      const problem = await response.json()
      assert.equal(problem.code, code)
      assert.ok(!JSON.stringify(problem).includes('integration-test-token'))
    }
    for (const body of [
      { tmdbId: 603, item: { name: 'Game', mediaType: 3, platform: 9 } },
      { tmdbId: -1, item: { name: 'Movie', mediaType: 1, mediaFormat: 2 } },
      { tmdbId: 603, language: 'invalid', item: { name: 'Movie', mediaType: 1, mediaFormat: 2 } },
      { tmdbId: 603, item: { name: '', mediaType: 1, mediaFormat: 2 } },
    ]) {
      const response = await fetch(`${tmdbUrl}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      assert.equal(response.status, 400)
    }
    const missing = await fetch(`${tmdbUrl}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tmdbId: 404, item: { name: 'Missing', mediaType: 1, mediaFormat: 2 } }) })
    assert.equal(missing.status, 404)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count, before)
    for (const parameters of ['query=x&mediaType=3', 'query=x&mediaType=1&page=501', 'query=x&mediaType=1&language=invalid', 'query= &mediaType=1']) {
      assert.equal((await fetch(`${tmdbUrl}/search?${parameters}`)).status, 400)
    }
  })
  await t.test('stores both TMDB title languages and preserves explicit name overrides', async () => {
    const importTitle = (mediaType, name, useLocalizedName = true) => fetch(`http://127.0.0.1:${port}/api/tmdb/import`, {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tmdbId:578,language:'fi-FI',useLocalizedName,item:{name,mediaType,mediaFormat:2}}),
    })
    for (const mediaType of [1,2]) {
      const response = await importTitle(mediaType, mediaType === 1 ? 'Tappajahai' : 'Fi-sarja')
      assert.equal(response.status,201)
      const item = await response.json()
      assert.equal(item.isNameCustom,false)
      assert.deepEqual(item.localizedTitles,mediaType===1?{fi:'Tappajahai',en:'Jaws'}:{fi:'Fi-sarja',en:'English series'})
      assert.deepEqual(item.sourceMetadata.localizedOverviews,{fi:'Suomenkielinen yhteenveto',en:'English overview'})
      const storedOverviews=database.prepare('SELECT Language,Overview FROM TmdbMetadata WHERE TmdbId=578 AND MediaType=? ORDER BY Language').all(mediaType)
      assert.deepEqual(storedOverviews.map(row=>row.Overview),['English overview','Suomenkielinen yhteenveto'])
      const unchanged = await fetch(`${url}/${item.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:mediaType===1?'Jaws':'English series',mediaType,mediaFormat:3,info:'Own notes',nameWasEdited:false})})
      const saved = await unchanged.json()
      assert.equal(saved.name,item.name)
      assert.equal(saved.isNameCustom,false)
      assert.deepEqual(saved.sourceMetadata.localizedOverviews,item.sourceMetadata.localizedOverviews)
      const listed=(await (await fetch(url)).json()).find(entry=>entry.id===item.id)
      assert.deepEqual(listed.sourceMetadata.localizedOverviews,item.sourceMetadata.localizedOverviews)
      const renamed = await fetch(`${url}/${item.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'My chosen title',mediaType,mediaFormat:3,nameWasEdited:true})})
      const custom = await renamed.json()
      assert.equal(custom.name,'My chosen title')
      assert.equal(custom.isNameCustom,true)
      assert.deepEqual(custom.localizedTitles,item.localizedTitles)
    }
    const customImport = await (await importTitle(1,'My imported copy',false)).json()
    assert.equal(customImport.name,'My chosen title')
    assert.equal(customImport.versionAdded,true)
    assert.equal(customImport.isNameCustom,true)
  })
  await t.test('backfills missing legacy title translations without renaming stored items and caches them', async () => {
    const metadataId = Number(database.prepare("INSERT INTO TmdbMetadata (TmdbId,MediaType,Language,Title,OriginalTitle,Overview,FetchedAt) VALUES (579,1,'fi-FI','Tappajahai','Jaws','','2026-01-01T00:00:00Z')").run().lastInsertRowid)
    const id = Number(database.prepare('INSERT INTO Collection (Name,MediaType,MediaFormat,TmdbMetadataId,IsNameCustom) VALUES (?,?,?,?,?)').run('Tappajahai',1,2,metadataId,0).lastInsertRowid)
    const list = await (await fetch(url)).json()
    const item = list.find(entry=>entry.id===id)
    assert.deepEqual(item.localizedTitles,{fi:'Tappajahai',en:'Jaws'})
    assert.deepEqual(item.sourceMetadata.localizedOverviews,{fi:'',en:'English overview'})
    assert.equal(database.prepare('SELECT Name FROM Collection WHERE Id=?').get(id).Name,'Tappajahai')
    const requestsBefore = tmdbRequests.length
    await fetch(url)
    assert.equal(tmdbRequests.length,requestsBefore)
  })
  await t.test('keeps imports and collection reads usable when the secondary language is unavailable', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/tmdb/import`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tmdbId:580,language:'fi-FI',useLocalizedName:true,item:{name:'Tappajahai',mediaType:1,mediaFormat:2}})})
    assert.equal(response.status,201)
    const item = await response.json()
    assert.deepEqual(item.localizedTitles,{fi:'Tappajahai'})
    assert.deepEqual(item.sourceMetadata.localizedOverviews,{fi:'Suomenkielinen yhteenveto'})
    assert.equal(item.sourceMetadata.originalTitle,'Jaws')
    assert.equal((await fetch(url)).status,200)
    const requestsBefore = tmdbRequests.length
    assert.equal((await fetch(url)).status,200)
    assert.equal(tmdbRequests.length,requestsBefore)
  })
  await t.test('TMDB TV details include regular season and episode totals and exclude specials from ownership choices', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/tmdb/details?tmdbId=603&mediaType=2&language=fi-FI`)
    assert.equal(response.status,200)
    const details=await response.json()
    assert.equal(details.numberOfSeasons,3)
    assert.equal(details.numberOfEpisodes,24)
    assert.deepEqual(details.seasons.map(season=>season.seasonNumber),[1,2,3])
    assert.equal(details.seasons[0].episodeCount,8)
  })
  await t.test('stores season ownership with separate formats, handles complete boxes and updates it atomically', async () => {
    const response=await fetch(`http://127.0.0.1:${port}/api/tmdb/import`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tmdbId:603,language:'fi-FI',useLocalizedName:true,item:{name:'Series copy',mediaType:2,mediaFormat:2,isCompleteBox:false,ownedSeasons:[{seasonNumber:1,mediaFormat:1},{seasonNumber:3,mediaFormat:3}]}})})
    assert.equal(response.status,201)
    const item=await response.json()
    assert.equal(item.isCompleteBox,false)
    assert.deepEqual(item.ownedSeasons,[{seasonNumber:1,mediaFormat:1},{seasonNumber:3,mediaFormat:3}])
    assert.equal(item.sourceMetadata.numberOfSeasons,3)
    assert.equal(item.sourceMetadata.numberOfEpisodes,24)
    const update=body=>fetch(`${url}/${item.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Series copy',mediaType:2,mediaFormat:3,...body})})
    const partial=await update({isCompleteBox:false,ownedSeasons:[{seasonNumber:2,mediaFormat:2}]})
    assert.equal(partial.status,200)
    assert.deepEqual((await partial.json()).ownedSeasons,[{seasonNumber:2,mediaFormat:2}])
    const complete=await (await update({isCompleteBox:true})).json()
    assert.equal(complete.isCompleteBox,true)
    assert.deepEqual(complete.ownedSeasons,[{seasonNumber:1,mediaFormat:3},{seasonNumber:2,mediaFormat:2},{seasonNumber:3,mediaFormat:3}])
    const unboxed=await (await update({isCompleteBox:false})).json()
    assert.equal(unboxed.isCompleteBox,false)
    assert.deepEqual(unboxed.ownedSeasons,complete.ownedSeasons)
    const legacy=await (await update({info:'Unrelated edit'})).json()
    assert.deepEqual(legacy.ownedSeasons,complete.ownedSeasons)
    const listed=(await (await fetch(url)).json()).find(entry=>entry.id===item.id)
    assert.deepEqual(listed.ownedSeasons,complete.ownedSeasons)
    const before=database.prepare('SELECT * FROM Collection WHERE Id=?').get(item.id)
    const ownedBefore=database.prepare('SELECT * FROM CollectionSeasons WHERE CollectionItemId=? ORDER BY SeasonNumber').all(item.id)
    database.exec("CREATE TRIGGER RejectSeason BEFORE INSERT ON CollectionSeasons WHEN NEW.SeasonNumber=3 BEGIN SELECT RAISE(ABORT,'test failure'); END;")
    try {
      assert.equal((await update({name:'Must roll back',ownedSeasons:[{seasonNumber:3,mediaFormat:1}]})).status,503)
      assert.deepEqual(database.prepare('SELECT * FROM Collection WHERE Id=?').get(item.id),before)
      assert.deepEqual(database.prepare('SELECT * FROM CollectionSeasons WHERE CollectionItemId=? ORDER BY SeasonNumber').all(item.id),ownedBefore)
    } finally { database.exec('DROP TRIGGER RejectSeason') }
    for(const invalid of [
      {ownedSeasons:[{seasonNumber:0,mediaFormat:1}]},
      {ownedSeasons:[{seasonNumber:1001,mediaFormat:1}]},
      {ownedSeasons:[{seasonNumber:1,mediaFormat:4}]},
      {ownedSeasons:[{seasonNumber:1,mediaFormat:1},{seasonNumber:1,mediaFormat:2}]},
      {ownedSeasons:[null]},
      {mediaType:1,isCompleteBox:true},
      {mediaType:1,ownedSeasons:[{seasonNumber:1,mediaFormat:1}]},
    ]) assert.equal((await update(invalid)).status,400)
    assert.equal((await fetch(`${url}/${item.id}`,{method:'DELETE'})).status,204)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM CollectionSeasons WHERE CollectionItemId=?').get(item.id).count,0)
    const manual=await post({name:'Manual box',mediaType:2,mediaFormat:2,isCompleteBox:true,ownedSeasons:[{seasonNumber:1,mediaFormat:1},{seasonNumber:2,mediaFormat:2}]})
    assert.equal(manual.status,201)
    const box=await manual.json()
    assert.equal(box.isCompleteBox,true)
    assert.equal(box.ownedSeasons.length,2)
    assert.equal(box.sourceMetadata,null)
  })
  await t.test('IGDB searches with escaped APICalypse input, caches OAuth tokens and refreshes rejected tokens', async () => {
    const endpoint = `http://127.0.0.1:${port}/api/igdb/search`
    const query = 'Halo "; limit 500; \\ name'
    const response = await fetch(`${endpoint}?query=${encodeURIComponent(query)}&page=2`)
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.page, 2)
    assert.equal(data.results[0].igdbId, 1942)
    assert.equal(data.results[0].coverImageId, 'igdb_cover')
    assert.equal(data.results[0].releaseDate, '2001-09-09')
    assert.equal(data.results[0].sourceUrl, 'https://www.igdb.com/games/game-example')
    assert.deepEqual(data.results[0].platforms, ['PC (Microsoft Windows)', 'PlayStation 5'])
    assert.equal(tokenRequests.length, 1)
    assert.deepEqual(tokenRequests[0], {client_id: 'test-client-id', client_secret: 'test-client-secret', grant_type: 'client_credentials'})
    assert.equal(igdbRequests.at(-1).body, `search "${query.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"; fields name,slug,summary,first_release_date,cover.image_id,platforms.name; limit 21; offset 20;`)
    assert.equal(igdbRequests.at(-1).clientId, 'test-client-id')
    assert.equal(igdbRequests.at(-1).authorization, 'Bearer igdb-test-token-1')
    const next = await (await fetch(`${endpoint}?query=paginated`)).json()
    assert.equal(next.results.length, 20)
    assert.equal(next.hasNextPage, true)
    assert.equal(tokenRequests.length, 1)
    rejectNextToken = true
    assert.equal((await fetch(`${endpoint}?query=Halo`)).status, 200)
    assert.equal(tokenRequests.length, 2)
    assert.equal(igdbRequests.at(-1).authorization, 'Bearer igdb-test-token-2')
    assert.ok(!JSON.stringify(data).includes('igdb-test-token'))
  })
  await t.test('IGDB imports share canonical metadata, save console or PC copy details and preserve covers on edit', async () => {
    const importGame = (platform, store, isPhysical = false) => fetch(`http://127.0.0.1:${port}/api/igdb/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ igdbId: 1942, coverImageId: 'untrusted', item: {name: 'My game', mediaType: 3, platform, ...(store ? {store} : {}), isPhysical, info: 'Own edition'} }),
    })
    const response = await importGame(9, 10, true)
    assert.equal(response.status, 201)
    const item = await response.json()
    assert.equal(item.igdbId, 1942)
    const duplicate = await importGame(9, 10, true)
    assert.equal(duplicate.status, 409)
    assert.equal((await duplicate.json()).existingItemId, item.id)
    assert.equal(item.isPhysical, true)
    assert.equal(item.store, 10)
    assert.equal(item.coverImageId, 'igdb_cover')
    assert.equal(item.mediaFormat, null)
    assert.equal(item.tmdbMetadataId, null)
    const pc = await (await importGame(26, 1)).json()
    assert.equal(pc.igdbMetadataId, item.igdbMetadataId)
    assert.equal(pc.id, item.id)
    assert.equal(pc.versions.find(version => version.platform === 26).store, 1)
    const metadata = database.prepare('SELECT * FROM IgdbMetadata WHERE Id = ?').get(item.igdbMetadataId)
    assert.equal(metadata.Title, 'IGDB canonical title')
    assert.equal(metadata.Overview, 'Game overview')
    assert.equal(metadata.CoverImageId, 'igdb_cover')
    assert.equal(item.sourceMetadata.title, metadata.Title)
    assert.equal(item.sourceMetadata.source, 'IGDB')
    assert.equal(item.sourceMetadata.sourceUrl, 'https://www.igdb.com/games/game-example')
    assert.equal(database.prepare('SELECT SourceUrl FROM IgdbMetadata WHERE IgdbId=?').get(item.igdbId).SourceUrl, item.sourceMetadata.sourceUrl)
    assert.equal(item.sourceMetadata.overview, 'Game overview')
    assert.equal(item.sourceMetadata.releaseDate, '2001-09-09')
    assert.deepEqual(item.sourceMetadata.platforms, ['PC (Microsoft Windows)', 'PlayStation 5'])
    assert.equal(item.sourceMetadata.language, null)
    assert.match(metadata.FetchedAt, /Z$/)
    const edit = await fetch(`${url}/${item.id}`, {method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name:'Edited game', mediaType:3, platform:8})})
    assert.equal(edit.status, 200)
    const updated = await edit.json()
    assert.equal(updated.igdbMetadataId, item.igdbMetadataId)
    assert.equal(updated.coverImageId, 'igdb_cover')
    assert.equal(updated.sourceMetadata.title, 'IGDB canonical title')
    assert.equal(updated.sourceMetadata.overview, 'Game overview')
    assert.equal(updated.sourceMetadata.sourceUrl, item.sourceMetadata.sourceUrl)
    assert.equal((await (await fetch(url)).json()).find(entry => entry.id === item.id).coverImageId, 'igdb_cover')
    assert.ok(database.prepare('SELECT Id FROM IgdbMetadata WHERE Id = ?').get(pc.igdbMetadataId))
    const changeCategory = await fetch(`${url}/${pc.id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:'Changed', mediaType:1, mediaFormat:2})})
    assert.equal((await changeCategory.json()).igdbMetadataId, null)
  })
  await t.test('fills missing legacy IGDB links once without changing stored game details', async () => {
    const metadataId=Number(database.prepare("INSERT INTO IgdbMetadata (IgdbId,Title,Overview,PlatformsJson,FetchedAt) VALUES (1943,'Stored title','Stored overview','[]','2026-01-01T00:00:00Z')").run().lastInsertRowid)
    const itemId=Number(database.prepare('INSERT INTO Collection (Name,MediaType,Platform,IgdbMetadataId) VALUES (?,3,9,?)').run('Own name',metadataId).lastInsertRowid)
    const item=(await (await fetch(url)).json()).find(entry=>entry.id===itemId)
    assert.equal(item.sourceMetadata.sourceUrl,'https://www.igdb.com/games/game-example')
    assert.equal(item.sourceMetadata.title,'Stored title')
    assert.equal(item.sourceMetadata.overview,'Stored overview')
    assert.equal(item.name,'Own name')
    const requestsBefore=igdbRequests.length
    await fetch(url)
    assert.equal(igdbRequests.length,requestsBefore)
    database.prepare('UPDATE IgdbMetadata SET IgdbId=404,SourceUrl=NULL WHERE Id=?').run(metadataId)
    assert.equal((await fetch(url)).status,200)
    const failedRequests=igdbRequests.length
    assert.equal((await fetch(url)).status,200)
    assert.equal(igdbRequests.length,failedRequests)
    database.prepare('DELETE FROM Collection WHERE Id=?').run(itemId)
  })
  await t.test('IGDB failures, missing games and invalid copy details never save partial data', async () => {
    const endpoint = `http://127.0.0.1:${port}/api/igdb`
    const before = database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count
    for (const [query, status, code] of [['limited',429,'igdb_rate_limited'],['unauthorized',502,'igdb_credentials'],['broken',502,'igdb_unavailable']]) {
      const response = await fetch(`${endpoint}/search?query=${query}`)
      assert.equal(response.status,status)
      const error = await response.json()
      assert.equal(error.code,code)
      assert.ok(!JSON.stringify(error).includes('test-client-secret'))
    }
    for (const body of [
      {igdbId:1942,item:{name:'Movie',mediaType:1,mediaFormat:2}},
      {igdbId:1942,item:{name:'Game',mediaType:3}},
      {igdbId:1942,item:{name:'PC',mediaType:3,platform:26}},
      {igdbId:-1,item:{name:'Game',mediaType:3,platform:9}},
    ]) assert.equal((await fetch(`${endpoint}/import`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,400)
    const missing = await fetch(`${endpoint}/import`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({igdbId:404,item:{name:'Missing',mediaType:3,platform:9}})})
    assert.equal(missing.status,404)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count,before)
    for (const params of ['query=x&page=501','query=','query=%0Ax']) assert.equal((await fetch(`${endpoint}/search?${params}`)).status,400)
  })
  await t.test('BGG searches encode names, authenticate only on the server and paginate cached XML results', async () => {
    const endpoint=`http://127.0.0.1:${port}/api/bgg`
    const search=await fetch(`${endpoint}/search?query=${encodeURIComponent('CATAN & friends')}`)
    assert.equal(search.status,200)
    const page=await search.json()
    assert.equal(page.results[0].title,'CATAN & friends')
    assert.equal(page.results[0].bggId,13)
    assert.equal(page.results[0].yearPublished,1995)
    assert.equal(bggRequests.at(-1).query.query,'CATAN & friends')
    assert.equal(bggRequests.at(-1).authorization,'Bearer bgg-integration-token')
    assert.equal(bggRequests.at(-1).query.type,'boardgame,boardgameexpansion')
    const first=await (await fetch(`${endpoint}/search?query=paginated`)).json()
    assert.equal(first.results.length,20)
    assert.equal(first.hasNextPage,true)
    const requests=bggRequests.length
    const second=await (await fetch(`${endpoint}/search?query=paginated&page=2`)).json()
    assert.equal(second.results.length,1)
    assert.equal(second.hasNextPage,false)
    assert.equal(bggRequests.length,requests)
    assert.deepEqual((await (await fetch(`${endpoint}/search?query=empty`)).json()).results,[])
  })
  await t.test('BGG imports cache canonical details, preserve notes and links on edit, and share metadata', async () => {
    const endpoint=`http://127.0.0.1:${port}/api/bgg`
    const details=await (await fetch(`${endpoint}/details?bggId=13`)).json()
    assert.equal(details.title,'CATAN & friends')
    assert.equal(details.overview,'Game & description\n\nSecond line')
    assert.equal(details.minPlayers,3)
    assert.equal(details.maxPlayers,4)
    assert.equal(details.playingTime,90)
    assert.equal(details.minAge,10)
    const requests=bggRequests.length
    const importGame=(format=4,name='Own copy',id=13)=>fetch(`${endpoint}/import`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bggId:id,title:'Untrusted',imageUrl:'https://evil.test/image',item:{name,mediaType:4,mediaFormat:format,info:'Personal notes'}})})
    const response=await importGame()
    assert.equal(response.status,201)
    const item=await response.json()
    assert.equal(item.bggId,13)
    const duplicate = await importGame()
    assert.equal(duplicate.status, 409)
    assert.equal((await duplicate.json()).existingItemId, item.id)
    assert.equal(item.bggImageUrl,'https://cf.geekdo-images.com/example/pic123.jpg')
    assert.equal(item.sourceMetadata.source,'BGG')
    assert.equal(item.sourceMetadata.title,'CATAN & friends')
    assert.equal(item.sourceMetadata.yearPublished,1995)
    assert.equal(item.sourceMetadata.minPlayers,3)
    assert.equal(item.sourceMetadata.sourceUrl,'https://boardgamegeek.com/boardgame/13')
    assert.equal(item.info,'Personal notes')
    const card=await (await importGame(5)).json()
    assert.equal(card.bggMetadataId,item.bggMetadataId)
    assert.equal(card.mediaFormat,5)
    assert.equal(bggRequests.length,requests)
    const updated=await (await fetch(`${url}/${item.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Renamed copy',mediaType:4,mediaFormat:99,info:'Changed notes'})})).json()
    assert.equal(updated.bggMetadataId,item.bggMetadataId)
    assert.equal(updated.bggImageUrl,item.bggImageUrl)
    assert.deepEqual(updated.sourceMetadata,{...item.sourceMetadata,fetchedAt:updated.sourceMetadata.fetchedAt})
    const listed=(await (await fetch(url)).json()).find(entry=>entry.id===item.id)
    assert.equal(listed.name,'Renamed copy')
    assert.equal(listed.sourceMetadata.overview,details.overview)
    assert.equal((await fetch(`${url}/${item.id}`,{method:'DELETE'})).status,204)
    assert.ok(database.prepare('SELECT Id FROM BggMetadata WHERE Id=?').get(card.bggMetadataId))
    const changed=await (await fetch(`${url}/${card.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Changed category',mediaType:1,mediaFormat:2})})).json()
    assert.equal(changed.bggMetadataId,null)
    assert.equal(changed.bggId,null)
    assert.equal(changed.sourceMetadata,null)
    assert.equal((await (await fetch(`${endpoint}/details?bggId=15`)).json()).imageUrl,null)
    database.exec("CREATE TRIGGER BggImportFailure BEFORE INSERT ON Collection WHEN NEW.Name='Force BGG rollback' BEGIN SELECT RAISE(ABORT,'test failure'); END;")
    assert.equal((await importGame(4,'Force BGG rollback',16)).status,503)
    assert.equal(database.prepare('SELECT Id FROM BggMetadata WHERE BggId=16').get(),undefined)
    database.exec('DROP TRIGGER BggImportFailure')
  })
  await t.test('BGG expansions store only inbound required games and preserve them on edits and reads', async () => {
    const endpoint=`http://127.0.0.1:${port}/api/bgg`
    const search=await (await fetch(`${endpoint}/search?query=expansion`)).json()
    assert.equal(search.results.length,1)
    assert.equal(search.results[0].isExpansion,true)
    const base=await (await fetch(`${endpoint}/details?bggId=13`)).json()
    assert.equal(base.isExpansion,false)
    assert.deepEqual(base.requiredGames,[])
    const details=await (await fetch(`${endpoint}/details?bggId=17`)).json()
    const required=[{bggId:13,name:'Base & game',sourceUrl:'https://boardgamegeek.com/boardgame/13'},{bggId:18,name:'Required expansion',sourceUrl:'https://boardgamegeek.com/boardgame/18'}]
    assert.equal(details.isExpansion,true)
    assert.deepEqual(details.requiredGames,required)
    const response=await fetch(`${endpoint}/import`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bggId:17,isExpansion:false,requiredGames:[],item:{name:'My expansion',mediaType:4,mediaFormat:5,info:'Keep notes'}})})
    assert.equal(response.status,201)
    const item=await response.json()
    assert.equal(item.sourceMetadata.isExpansion,true)
    assert.deepEqual(item.sourceMetadata.requiredGames,required)
    const cached=database.prepare('SELECT IsExpansion,RequiredGamesJson FROM BggMetadata WHERE BggId=17').get()
    assert.equal(cached.IsExpansion,1)
    assert.equal(JSON.parse(cached.RequiredGamesJson).length,2)
    const edited=await (await fetch(`${url}/${item.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'My renamed expansion',mediaType:4,mediaFormat:4,info:'Own notes'})})).json()
    assert.deepEqual(edited.sourceMetadata.requiredGames,required)
    assert.equal(edited.sourceMetadata.isExpansion,true)
    const listed=(await (await fetch(url)).json()).find(entry=>entry.id===item.id)
    assert.deepEqual(listed.sourceMetadata.requiredGames,required)
    const unknown=await (await fetch(`${endpoint}/details?bggId=23`)).json()
    assert.equal(unknown.isExpansion,true)
    assert.deepEqual(unknown.requiredGames,[])
    // A legacy row starts unknown and is filled without rewriting personal or source data.
    database.prepare("UPDATE BggMetadata SET IsExpansion=NULL,RequiredGamesJson='[]',Title='Stored source title' WHERE BggId=17").run()
    const filled=(await (await fetch(url)).json()).find(entry=>entry.id===item.id)
    assert.equal(filled.sourceMetadata.isExpansion,true)
    assert.deepEqual(filled.sourceMetadata.requiredGames,required)
    assert.equal(filled.sourceMetadata.title,'Stored source title')
    assert.equal(filled.name,'My renamed expansion')
    assert.equal(filled.info,'Own notes')
    const requests=bggRequests.length
    await fetch(url)
    assert.equal(bggRequests.length,requests)
    database.prepare("UPDATE BggMetadata SET BggId=404,IsExpansion=NULL WHERE BggId=17").run()
    assert.equal((await fetch(url)).status,200)
    const failedRequests=bggRequests.length
    assert.equal((await fetch(url)).status,200)
    assert.equal(bggRequests.length,failedRequests)
    database.prepare('DELETE FROM Collection WHERE Id=?').run(item.id)
  })
  await t.test('BGG handles authentication, queued responses, invalid XML and validation without partial saves', async () => {
    const endpoint=`http://127.0.0.1:${port}/api/bgg`
    const before=database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count
    for (const [query,status,code] of [['unauthorized',502,'bgg_credentials'],['limited',429,'bgg_rate_limited'],['pending',503,'bgg_pending'],['unavailable',429,'bgg_rate_limited'],['broken',502,'bgg_unavailable'],['doctype',502,'bgg_unavailable']]) {
      const response=await fetch(`${endpoint}/search?query=${query}`)
      assert.equal(response.status,status)
      const problem=await response.json()
      assert.equal(problem.code,code)
      assert.ok(!JSON.stringify(problem).includes('bgg-integration-token'))
    }
    for (const params of ['query=','query=x&page=501','query=%0Ax']) assert.equal((await fetch(`${endpoint}/search?${params}`)).status,400)
    for (const item of [{name:'Movie',mediaType:1,mediaFormat:2},{name:'Wrong format',mediaType:4,mediaFormat:1}]) {
      assert.equal((await fetch(`${endpoint}/import`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bggId:13,item})})).status,400)
    }
    assert.equal((await fetch(`${endpoint}/details?bggId=0`)).status,400)
    assert.equal((await fetch(`${endpoint}/details?bggId=404`)).status,404)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count,before)
  })
  await t.test('stores manual tabletop classification and parent references, resolves renames and preserves old callers', async () => {
    const base=await (await post({name:'Manual base',mediaType:4,mediaFormat:4,boardGameKind:1})).json()
    assert.equal(base.boardGameKind,1)
    const response=await post({name:'Manual expansion',mediaType:4,mediaFormat:5,boardGameKind:2,baseGames:[{collectionItemId:base.id,name:'Forged name',bggId:99999},{name:'External base'}]})
    assert.equal(response.status,201)
    const item=await response.json()
    assert.equal(item.boardGameKind,2)
    assert.deepEqual(item.baseGames,[{collectionItemId:base.id,bggId:null,name:'Manual base'},{collectionItemId:null,bggId:null,name:'External base'}])
    assert.equal(JSON.parse(database.prepare('SELECT BaseGamesJson FROM Collection WHERE Id=?').get(item.id).BaseGamesJson).length,2)
    const edit=(id,body)=>fetch(`${url}/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    assert.equal((await edit(base.id,{name:'Renamed manual base',mediaType:4,mediaFormat:4})).status,200)
    let listed=(await (await fetch(url)).json()).find(entry=>entry.id===item.id)
    assert.equal(listed.baseGames[0].name,'Renamed manual base')
    const legacy=await (await edit(item.id,{name:'Edited expansion',mediaType:4,mediaFormat:5,info:'Personal notes'})).json()
    assert.equal(legacy.boardGameKind,2)
    assert.equal(legacy.baseGames.length,2)
    const invalid=await edit(item.id,{name:'Must roll back',mediaType:4,mediaFormat:4,boardGameKind:2,baseGames:[{collectionItemId:item.id}]})
    assert.equal(invalid.status,400)
    assert.equal(database.prepare('SELECT Name FROM Collection WHERE Id=?').get(item.id).Name,'Edited expansion')
    assert.equal((await fetch(`${url}/${base.id}`,{method:'DELETE'})).status,204)
    listed=(await (await fetch(url)).json()).find(entry=>entry.id===item.id)
    assert.equal(listed.baseGames[0].collectionItemId,null)
    assert.equal(listed.baseGames[0].name,'Manual base')
    const other=await (await edit(item.id,{name:'Other tabletop item',mediaType:4,mediaFormat:99,boardGameKind:99,baseGames:[]})).json()
    assert.equal(other.boardGameKind,99)
    assert.deepEqual(other.baseGames,[])
    const changed=await (await edit(item.id,{name:'Changed category',mediaType:1,mediaFormat:2})).json()
    assert.equal(changed.boardGameKind,null)
    assert.deepEqual(changed.baseGames,[])
  })
  await t.test('keeps BGG source defaults separate from user tabletop overrides and validates parent references', async () => {
    const imported=await fetch(`http://127.0.0.1:${port}/api/bgg/import`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bggId:23,item:{name:'Own copy',mediaType:4,mediaFormat:4}})})
    assert.equal(imported.status,201)
    const item=await imported.json()
    assert.equal(item.boardGameKind,2)
    assert.equal(item.sourceMetadata.isExpansion,true)
    const response=await fetch(`${url}/${item.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Override',mediaType:4,mediaFormat:4,boardGameKind:1,baseGames:[]})})
    assert.equal(response.status,200)
    const changed=await response.json()
    assert.equal(changed.boardGameKind,1)
    assert.equal(changed.sourceMetadata.isExpansion,true)
    assert.deepEqual(changed.baseGames,[])
    const movie=await (await post({name:'Movie parent',mediaType:1,mediaFormat:2})).json()
    const before=database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count
    for(const body of [
      {name:'Invalid enum',mediaType:4,mediaFormat:4,boardGameKind:3},
      {name:'Movie classification',mediaType:1,mediaFormat:2,boardGameKind:1},
      {name:'Not expansion',mediaType:4,mediaFormat:4,boardGameKind:1,baseGames:[{name:'Wrong'}]},
      {name:'Missing parent',mediaType:4,mediaFormat:4,boardGameKind:2,baseGames:[{collectionItemId:999999}]},
      {name:'Wrong parent category',mediaType:4,mediaFormat:4,boardGameKind:2,baseGames:[{collectionItemId:movie.id}]},
      {name:'Empty parent',mediaType:4,mediaFormat:4,boardGameKind:2,baseGames:[{name:' '}]},
    ]) assert.equal((await post(body)).status,400)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count,before)
  })
  await t.test('Other tabletop items can persist, edit and retain base game relationships without expansion classification', async () => {
    const base=await (await post({name:'Reference base',mediaType:4,mediaFormat:4,boardGameKind:1})).json()
    const response=await post({name:'Other related item',mediaType:4,mediaFormat:99,boardGameKind:99,baseGames:[{collectionItemId:base.id},{name:'Another base'}]})
    assert.equal(response.status,201)
    const item=await response.json()
    assert.equal(item.boardGameKind,99)
    assert.equal(item.baseGames[0].collectionItemId,base.id)
    assert.equal(item.baseGames[0].name,'Reference base')
    assert.equal(item.baseGames[1].name,'Another base')
    const edit=body=>fetch(`${url}/${item.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:item.name,mediaType:4,mediaFormat:99,...body})})
    for(const kind of [2,99]) {
      const changed=await edit({boardGameKind:kind})
      assert.equal(changed.status,200)
      const saved=await changed.json()
      assert.equal(saved.boardGameKind,kind)
      assert.deepEqual(saved.baseGames,item.baseGames)
    }
    const listed=(await (await fetch(url)).json()).find(entry=>entry.id===item.id)
    assert.equal(listed.boardGameKind,99)
    assert.deepEqual(listed.baseGames,item.baseGames)
    const renamed=await (await edit({baseGames:[{name:'New base name'}]})).json()
    assert.equal(renamed.baseGames[0].name,'New base name')
    const cleared=await (await edit({boardGameKind:1})).json()
    assert.deepEqual(cleared.baseGames,[])
  })
  await t.test('rejects normalized manual duplicates and serializes concurrent additions without partial saves', async () => {
    const before = database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count
    const responses = await Promise.all([
      post({name:'  ÄÄNI   duplicate test  ', mediaType:1, mediaFormat:2}),
      post({name:'A\u0308A\u0308ni duplicate test', mediaType:1, mediaFormat:2, info:'Different notes'}),
    ])
    assert.deepEqual(responses.map(response => response.status).sort(), [201,409])
    const item = await responses.find(response => response.status === 201).json()
    const duplicate = await responses.find(response => response.status === 409).json()
    assert.equal(duplicate.code, 'collection_duplicate')
    assert.equal(duplicate.existingItemId, item.id)
    assert.equal(duplicate.name, item.name)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count, before + 1)
    const edited = await fetch(`${url}/${item.id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:item.name,mediaType:1,mediaFormat:2,info:'An ordinary edit'})})
    assert.equal(edited.status,200)
    const ids = [item.id]
    for (const fields of [{mediaType:1, mediaFormat:3}, {mediaType:2, mediaFormat:2}]) {
      const response = await post({name:item.name,...fields})
      assert.equal(response.status,201)
      ids.push((await response.json()).id)
    }
    for (const id of new Set(ids)) assert.equal((await fetch(`${url}/${id}`,{method:'DELETE'})).status,204)
  })
  await t.test('merges game platforms and rejects the same platform regardless of store or copy type', async () => {
    const count = database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count
    const bodies = [
      {platform:26,store:1,isPhysical:false},
      {platform:4,store:9,isPhysical:false}, {platform:9,store:10,isPhysical:false},
    ].map(fields => ({name:'Unique ownership variant test',mediaType:3,...fields}))
    let item
    for (const body of bodies) {
      const response=await post(body)
      assert.equal(response.status,201)
      const saved=await response.json()
      if(item) { assert.equal(saved.id,item.id); assert.equal(saved.versionAdded,true) }
      item=saved
    }
    assert.deepEqual(item.versions.map(version=>version.platform),[26,4,9])
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count,count+1)
    for(const body of [...bodies,{...bodies[0],store:2},{...bodies[0],isPhysical:true,store:null}])
      assert.equal((await post({...body,info:'Not a different item'})).status,409)
    assert.equal((await fetch(`${url}/${item.id}`,{method:'DELETE'})).status,204)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM CollectionVersions WHERE CollectionItemId=?').get(item.id).count,0)
  })
  await t.test('uses provider IDs for imported titles and recognizes manual names against stored provider names', async () => {
    const importMovie = (id,name) => fetch(url.replace('/collection','/tmdb/import'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tmdbId:id,language:'fi-FI',item:{name,mediaType:1,mediaFormat:99}})})
    const first = await importMovie(701,'Same remake title')
    assert.equal(first.status,201)
    const item=await first.json()
    assert.equal((await importMovie(701,'A completely different custom title')).status,409)
    const remake=await importMovie(702,'Same remake title')
    assert.equal(remake.status,201)
    const second=await remake.json()
    assert.equal((await post({name:'  movie   701 ',mediaType:1,mediaFormat:99})).status,409)
    for(const id of [item.id,second.id]) assert.equal((await fetch(`${url}/${id}`,{method:'DELETE'})).status,204)
  })
  await t.test('detects duplicate boxes independently of member order and the chosen cover', async () => {
    const importBox = (ids,name) => fetch(url.replace('/collection','/tmdb/import'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tmdbId:ids[0],tmdbIds:ids,language:'fi-FI',item:{name,mediaType:1,mediaFormat:2,isCollection:true}})})
    const first=await importBox([701,702],'Duplicate box test')
    assert.equal(first.status,201)
    const item=await first.json()
    const duplicate=await importBox([702,701],'Another name for the same box')
    assert.equal(duplicate.status,409)
    assert.equal((await duplicate.json()).existingItemId,item.id)
    const single=await fetch(url.replace('/collection','/tmdb/import'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tmdbId:701,language:'fi-FI',item:{name:'Standalone member',mediaType:1,mediaFormat:2}})})
    assert.equal(single.status,201)
    const member=await single.json()
    for(const id of [item.id,member.id]) assert.equal((await fetch(`${url}/${id}`,{method:'DELETE'})).status,204)
  })
  await t.test('merges TV formats, preserves their seasons and rejects an already owned format', async () => {
    const body={name:'Unique season ownership test',mediaType:2,mediaFormat:2,ownedSeasons:[{seasonNumber:1,mediaFormat:2}]}
    const first=await post(body)
    assert.equal(first.status,201)
    const item=await first.json()
    assert.equal((await post({...body,mediaFormat:3})).status,409)
    assert.equal((await post({...body,ownedSeasons:[{seasonNumber:2,mediaFormat:2}]})).status,409)
    const response=await post({...body,mediaFormat:3,ownedSeasons:[{seasonNumber:1,mediaFormat:3}]})
    assert.equal(response.status,201)
    const saved=await response.json()
    assert.equal(saved.id,item.id)
    assert.deepEqual(saved.versions.map(version=>version.ownedSeasons),[[{seasonNumber:1,mediaFormat:2}],[{seasonNumber:1,mediaFormat:3}]])
    assert.equal((await fetch(`${url}/${item.id}`,{method:'DELETE'})).status,204)
  })
  await t.test('merges concurrent format additions and edits a selected version atomically', async () => {
    const count=database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count
    const bodies=[{name:'Concurrent formats',mediaType:1,mediaFormat:1,info:'DVD notes'},
      {name:'Concurrent formats',mediaType:1,mediaFormat:2,info:'Blu-ray notes'}]
    const responses=await Promise.all(bodies.map(body=>post(body)))
    assert.deepEqual(responses.map(response=>response.status),[201,201])
    const results=await Promise.all(responses.map(response=>response.json()))
    assert.equal(results[0].id,results[1].id)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count,count+1)
    const item=(await (await fetch(url)).json()).find(item=>item.id===results[0].id)
    assert.equal(item.versions.length,2)
    const extra=item.versions.find(version=>version.id>0)
    const original=item.versions.find(version=>version.id===0)
    const update=body=>fetch(`${url}/${item.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:item.name,mediaType:1,mediaFormat:3,versionId:extra.id,info:'UHD notes',...body})})
    const edited=await update({})
    assert.equal(edited.status,200)
    const saved=await edited.json()
    assert.deepEqual({...saved.versions.find(version=>version.id===0),updatedAt:original.updatedAt},original)
    assert.equal(saved.versions.find(version=>version.id===extra.id).info,'UHD notes')
    assert.equal(saved.versions.find(version=>version.id===extra.id).mediaFormat,3)
    const duplicate=await update({mediaFormat:original.mediaFormat,name:'Must roll back'})
    assert.equal(duplicate.status,409)
    assert.equal(database.prepare('SELECT Name FROM Collection WHERE Id=?').get(item.id).Name,item.name)
    const after=(await (await fetch(url)).json()).find(entry=>entry.id===item.id)
    assert.equal(after.versions.find(version=>version.id===extra.id).mediaFormat,3)
    assert.equal((await update({versionId:999999})).status,404)
    assert.equal((await post({name:item.name,mediaType:1,mediaFormat:3})).status,409)
    // A failing ownership insert rolls back both the provisional row and the merge.
    database.exec("CREATE TRIGGER RejectVersion BEFORE INSERT ON CollectionVersions BEGIN SELECT RAISE(ABORT,'test failure'); END;")
    const failed=await post({name:item.name,mediaType:1,mediaFormat:99})
    assert.equal(failed.status,503)
    database.exec('DROP TRIGGER RejectVersion')
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM Collection').get().count,count+1)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM CollectionVersions WHERE CollectionItemId=?').get(item.id).count,1)
    assert.equal((await fetch(`${url}/${item.id}`,{method:'DELETE'})).status,204)
  })

  await t.test('consolidates existing platform versions without losing notes or exact historical duplicates', async () => {
    const insert=database.prepare('INSERT INTO Collection (Name,MediaType,Platform,Info) VALUES (?,3,?,?)')
    const first=Number(insert.run('Existing Destiny 2',4,'Xbox notes').lastInsertRowid)
    const second=Number(insert.run('existing destiny 2',9,'PlayStation notes').lastInsertRowid)
    const historical=Number(insert.run('Historical exact duplicate',4,'First owned copy').lastInsertRowid)
    const historical2=Number(insert.run('Historical exact duplicate',4,'Second owned copy').lastInsertRowid)
    const consolidate=async()=>{
      const child=spawn('dotnet',[process.env.COLLECTION_API_TEST_DLL ?? join(project,'bin/Debug/net10.0/MyMediaCollection.API.dll'),'--consolidate-collection-versions'],{
        cwd:project,windowsHide:true,env:{...process.env,ConnectionStrings__Collection:`Data Source=${databasePath};Pooling=False`,Logging__EventLog__LogLevel__Default:'None'},stdio:['ignore','pipe','pipe'],
      })
      let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data)
      assert.equal((await once(child,'exit'))[0],0,output)
    }
    await consolidate()
    const listed=await (await fetch(url)).json()
    const combined=listed.find(item=>item.id===first)
    assert.deepEqual(combined.versions.map(version=>version.platform),[4,9])
    assert.deepEqual(combined.versions.map(version=>version.info),['Xbox notes','PlayStation notes'])
    assert.equal(listed.some(item=>item.id===second),false)
    assert.ok(listed.some(item=>item.id===historical))
    assert.ok(listed.some(item=>item.id===historical2))
    await consolidate()
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM CollectionVersions WHERE CollectionItemId=?').get(first).count,1)
    for(const id of [first,historical,historical2]) assert.equal((await fetch(`${url}/${id}`,{method:'DELETE'})).status,204)
  })

  await t.test('deletes individual game platforms, promotes the original and protects the last version and stale requests', async () => {
    let item
    for(const fields of [{platform:4,isPhysical:true,info:'Xbox notes'},
      {platform:9,isPhysical:false,store:10,info:'PS notes'},
      {platform:26,isPhysical:false,store:1,info:'PC notes'}]) {
      const response=await post({name:'Delete platform test',mediaType:3,...fields})
      assert.equal(response.status,201)
      item=await response.json()
    }
    const originalId=item.id
    const remove=(version,override={})=>fetch(`${url}/${item.id}/versions/${version.id}`,{method:'DELETE',headers:{'If-Match':`"${version.deletionToken}"`},...override})
    const original=item.versions.find(version=>version.id===0)
    const pc=item.versions.find(version=>version.platform===26)
    assert.equal((await remove(pc,{headers:{}})).status,400)
    assert.equal((await remove(pc,{headers:{'If-Match':'"stale-token"'}})).status,412)
    const another=await (await post({name:'Another game for version scope',mediaType:3,platform:1,isPhysical:true})).json()
    const foreign=await fetch(`${url}/${another.id}/versions/${pc.id}`,{method:'DELETE',headers:{'If-Match':`"${pc.deletionToken}"`}})
    assert.equal(foreign.status,404)
    const removedPc=await remove(pc)
    assert.equal(removedPc.status,200)
    item=await removedPc.json()
    assert.deepEqual(item.versions.map(version=>version.platform),[4,9])
    const removedOriginal=await remove(original)
    assert.equal(removedOriginal.status,200)
    item=await removedOriginal.json()
    assert.equal(item.id,originalId)
    assert.equal(item.name,'Delete platform test')
    assert.equal(item.platform,9)
    assert.equal(item.store,10)
    assert.equal(item.isPhysical,false)
    assert.equal(item.info,'PS notes')
    assert.equal(item.versions.length,1)
    assert.equal(item.versions[0].id,0)
    assert.equal((await remove(original)).status,412)
    const last=await remove(item.versions[0])
    assert.equal(last.status,409)
    assert.equal((await last.json()).code,'collection_last_version')
    assert.ok(database.prepare('SELECT Id FROM Collection WHERE Id=?').get(originalId))
    const readded=await post({name:item.name,mediaType:3,platform:4,isPhysical:true})
    assert.equal(readded.status,201)
    assert.equal((await readded.json()).id,originalId)
    for(const id of [originalId,another.id]) assert.equal((await fetch(`${url}/${id}`,{method:'DELETE'})).status,204)
  })

  await t.test('promotes remaining TV ownership and preserves metadata atomically when a format is deleted', async () => {
    const importSeries=fields=>fetch(url.replace('/collection','/tmdb/import'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tmdbId:703,language:'fi-FI',item:{name:'TV version deletion',mediaType:2,...fields}})})
    const first=await importSeries({mediaFormat:2,ownedSeasons:[{seasonNumber:1,mediaFormat:2}],info:'Blu-ray notes'})
    assert.equal(first.status,201)
    const original=await first.json()
    const second=await importSeries({mediaFormat:3,isCompleteBox:true,info:'UHD complete box'})
    assert.equal(second.status,201)
    const before=await second.json()
    const remove=()=>fetch(`${url}/${before.id}/versions/0`,{method:'DELETE',headers:{'If-Match':`"${before.versions[0].deletionToken}"`}})
    database.exec("CREATE TRIGGER RejectPromotion BEFORE INSERT ON CollectionSeasons WHEN NEW.SeasonNumber=3 BEGIN SELECT RAISE(ABORT,'test failure'); END;")
    assert.equal((await remove()).status,503)
    database.exec('DROP TRIGGER RejectPromotion')
    const afterFailure=(await (await fetch(url)).json()).find(item=>item.id===before.id)
    const {versionAdded,...persistedBefore}=before
    assert.equal(versionAdded,true)
    assert.deepEqual(afterFailure,persistedBefore)
    const response=await remove()
    assert.equal(response.status,200)
    const saved=await response.json()
    assert.equal(saved.id,original.id)
    assert.equal(saved.createdAt,original.createdAt)
    assert.equal(saved.tmdbMetadataId,original.tmdbMetadataId)
    assert.equal(saved.posterPath,original.posterPath)
    assert.equal(saved.name,original.name)
    assert.equal(saved.mediaFormat,3)
    assert.equal(saved.isCompleteBox,true)
    assert.equal(saved.info,'UHD complete box')
    assert.deepEqual(saved.ownedSeasons,[1,2,3].map(seasonNumber=>({seasonNumber,mediaFormat:3})))
    assert.equal(saved.versions.length,1)
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM CollectionVersions WHERE CollectionItemId=?').get(saved.id).count,0)
    assert.equal((await fetch(`${url}/${saved.id}`,{method:'DELETE'})).status,204)
  })

  await t.test('stores version history with server timestamps and reserved user IDs, newest additions first', async () => {
    const historyUrl=url.replace('/collection','/version-history')
    assert.deepEqual(await (await fetch(historyUrl)).json(),[])
    const entries=[]
    for(const [versionNumber,description] of [['  1.0.0  ',' First release\nSecond line '],['0.9.0','Historical release added later']]) {
      const response=await fetch(historyUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({versionNumber,description,userId:'untrusted-user',createdAt:'2000-01-01T00:00:00Z'})})
      assert.equal(response.status,201)
      const entry=await response.json()
      assert.equal(entry.versionNumber,versionNumber.trim())
      assert.equal(entry.description,description.trim())
      assert.equal(entry.userId,null)
      assert.ok(Date.parse(entry.createdAt)>Date.parse('2026-01-01'))
      const stored=database.prepare('SELECT * FROM VersionHistory WHERE Id=?').get(entry.id)
      assert.equal(stored.UserId,null)
      assert.equal(stored.VersionNumber,entry.versionNumber)
      entries.push(entry)
    }
    assert.deepEqual(await (await fetch(historyUrl)).json(),entries.reverse())
  })

  await t.test('rejects empty, oversized and duplicate version history without partial writes', async () => {
    const historyUrl=url.replace('/collection','/version-history')
    const count=database.prepare('SELECT COUNT(*) AS count FROM VersionHistory').get().count
    for(const body of [{},{versionNumber:' ',description:'Valid'},{versionNumber:'2.0',description:'  '},
      {versionNumber:'x'.repeat(65),description:'Valid'},{versionNumber:'2.0',description:'x'.repeat(20001)}]) {
      const response=await fetch(historyUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      assert.equal(response.status,400)
    }
    const duplicate=await fetch(historyUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({versionNumber:' 1.0.0 ',description:'Must not replace the old entry'})})
    assert.equal(duplicate.status,409)
    assert.equal((await duplicate.json()).code,'version_exists')
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM VersionHistory').get().count,count)
    assert.equal(database.prepare("SELECT Description FROM VersionHistory WHERE VersionNumber='1.0.0'").get().Description,'First release\nSecond line')
    database.exec('ALTER TABLE VersionHistory RENAME TO UnavailableVersionHistory')
    assert.equal((await fetch(historyUrl)).status,503)
    assert.equal((await fetch(historyUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({versionNumber:'2',description:'Valid'})})).status,503)
    database.exec('ALTER TABLE UnavailableVersionHistory RENAME TO VersionHistory')
  })

  await t.test('forwards client /api requests through the Vite proxy', async () => {
    const { createServer: createViteServer } = await import('../../Client/node_modules/vite/dist/node/index.js')
    const client = fileURLToPath(new URL('../../Client/', import.meta.url))
    const vite = await createViteServer({
      root: client,
      configFile: join(client, 'vite.config.ts'),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, proxy: { '/api': `http://127.0.0.1:${port}` } },
    })
    try {
      await vite.listen()
      const proxyPort = vite.httpServer.address().port
      const response = await fetch(`http://127.0.0.1:${proxyPort}/api/collection`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Via client proxy', mediaType: 1, mediaFormat: 2 }),
      })
      assert.equal(response.status, 201)
      const item = await response.json()
      assert.equal(database.prepare('SELECT Name FROM Collection WHERE Id = ?').get(item.id).Name, 'Via client proxy')
      const list = await fetch(`http://127.0.0.1:${proxyPort}/api/collection`)
      assert.equal(list.status, 200)
      assert.equal((await list.json())[0].id, item.id)
    } finally {
      await vite.close()
    }
  })
  await t.test('returns a controlled error if the manually managed table is missing', async () => {
    database.exec('ALTER TABLE Collection RENAME TO UnavailableCollection')
    const response = await post({ name: 'Test', mediaType: 1, mediaFormat: 1 })
    assert.equal(response.status, 503)
    const problem = await response.json()
    assert.equal(problem.status, 503)
    assert.ok(!JSON.stringify(problem).includes('INSERT INTO'))
    const list = await fetch(url)
    assert.equal(list.status, 503)
    assert.ok(!JSON.stringify(await list.json()).includes('SELECT'))
    const update = await fetch(`${url}/1`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', mediaType: 1, mediaFormat: 1 }),
    })
    assert.equal(update.status, 503)
    assert.equal((await fetch(`${url}/1`, { method: 'DELETE' })).status, 503)
  })
})
