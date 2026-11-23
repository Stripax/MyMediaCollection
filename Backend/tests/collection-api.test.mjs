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
  const tmdbRequests = []
  const tmdbServer = createHttpServer((request, response) => {
    const address = new URL(request.url, 'http://localhost')
    tmdbRequests.push({ path: address.pathname, query: Object.fromEntries(address.searchParams), authorization: request.headers.authorization })
    response.setHeader('Content-Type', 'application/json')
    if (address.searchParams.get('query') === 'unauthorized') { response.writeHead(401); response.end('{}'); return }
    if (address.searchParams.get('query') === 'limited') { response.writeHead(429); response.end('{}'); return }
    if (address.pathname.endsWith('/404')) { response.writeHead(404); response.end('{}'); return }
    if (address.searchParams.get('query') === 'broken') { response.end('{bad json'); return }
    const tv = address.pathname.includes('/tv')
    const data = { id: 603, title: 'The Matrix', original_title: 'The Matrix', name: 'TV example', original_name: 'Original TV example', overview: 'TMDB overview', release_date: '1999-03-30', first_air_date: '2001-04-05', poster_path: '/matrix.jpg' }
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
    assert.deepEqual({ ...row }, { Id: item.id, Name: item.name, MediaType: 2, MediaFormat: 3, Platform: null, Store: null, Info: 'Line 1\nLine 2', CreatedAt: row.CreatedAt, UpdatedAt: null, UserId: null, TmdbMetadataId: null })
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
    assert.deepEqual(items[0], { id, name: 'Manually added item', mediaType: 4, mediaFormat: null, platform: null, store: null, info: null, createdAt: null, updatedAt: null, userId: null, tmdbMetadataId: null, tmdbId: null, posterPath: null })
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
    for (let store = 1; store <= 8; store++) {
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
  await t.test('rejects missing and invalid PC stores and stores on consoles or other categories', async () => {
    const before = database.prepare('SELECT * FROM Collection ORDER BY Id').all()
    for (const fields of [
      { mediaType: 3, platform: 26 },
      { mediaType: 3, platform: 26, store: 0 },
      { mediaType: 3, platform: 26, store: 999 },
      { mediaType: 3, platform: 26, store: 'Steam' },
      { mediaType: 3, platform: 9, store: 1 },
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
      id: created.id, name: "Muokattu O'Brien", mediaType: 2, mediaFormat: 3, platform: null, store: null, info: 'Edited\nInfo',
      createdAt: created.createdAt, updatedAt: updated.updatedAt, userId: null,
      tmdbMetadataId: null, tmdbId: null, posterPath: null,
    })
    assert.deepEqual({ ...database.prepare('SELECT * FROM Collection WHERE Id = ?').get(created.id) }, {
      Id: created.id, Name: "Muokattu O'Brien", MediaType: 2, MediaFormat: 3, Platform: null, Store: null, Info: 'Edited\nInfo',
      CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, UserId: null,
      TmdbMetadataId: null,
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
    const importItem = (mediaType, language = 'fi-FI') => fetch(`http://127.0.0.1:${port}/api/tmdb/import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdbId: 603, language, posterPath: '/untrusted.jpg', item: { name: 'My copy', mediaType, mediaFormat: 2, info: 'Own notes' } }),
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
    assert.match(metadata.FetchedAt, /Z$/)
    const copy = await (await importItem(1)).json()
    assert.notEqual(copy.id, item.id)
    assert.equal(copy.tmdbMetadataId, item.tmdbMetadataId)
    const series = await (await importItem(2)).json()
    assert.notEqual(series.tmdbMetadataId, item.tmdbMetadataId)
    const english = await (await importItem(1, 'en-US')).json()
    assert.notEqual(english.tmdbMetadataId, item.tmdbMetadataId)
    const edit = await fetch(`${url}/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Edited copy', mediaType: 1, mediaFormat: 3 }) })
    assert.equal(edit.status, 200)
    const updated = await edit.json()
    assert.equal(updated.tmdbMetadataId, item.tmdbMetadataId)
    assert.equal(updated.tmdbId, 603)
    assert.equal(updated.posterPath, '/matrix.jpg')
    const listed = (await (await fetch(url)).json()).find(entry => entry.id === item.id)
    assert.equal(listed.posterPath, '/matrix.jpg')
    assert.equal((await fetch(`${url}/${copy.id}`, { method: 'DELETE' })).status, 204)
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
