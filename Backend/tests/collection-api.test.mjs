// Run after dotnet build: node --test Backend/tests/collection-api.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs'
import { createServer } from 'node:net'
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
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise((resolve) => listener.close(resolve))
  const project = fileURLToPath(new URL('../MyMediaCollection.API/', import.meta.url))
  const server = spawn('dotnet', [join(project, 'bin/Debug/net10.0/MyMediaCollection.API.dll')], {
    cwd: project,
    windowsHide: true,
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: 'Development',
      ASPNETCORE_URLS: `http://127.0.0.1:${port}`,
      Logging__EventLog__LogLevel__Default: 'None',
      ConnectionStrings__Collection: `Data Source=${databasePath};Pooling=False`,
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

  await t.test('persists enum numbers, Unicode and quoted text with a generated ID', async () => {
    const response = await post({ name: "  Yö — O'Brien  ", mediaType: 2, mediaFormat: 3, info: 'Line 1\nLine 2' })
    assert.equal(response.status, 201)
    const item = await response.json()
    assert.ok(item.id > 0)
    assert.equal(item.name, "Yö — O'Brien")
    assert.equal(item.mediaType, 2)
    assert.equal(item.mediaFormat, 3)
    const row = database.prepare('SELECT * FROM Collection WHERE Id = ?').get(item.id)
    assert.deepEqual({ ...row }, { Id: item.id, Name: item.name, MediaType: 2, MediaFormat: 3, Info: 'Line 1\nLine 2' })
  })
  await t.test('supports every enum value and optional information', async () => {
    for (const mediaType of [1, 2, 3, 4]) {
      for (const mediaFormat of [1, 2, 3]) {
        const response = await post({ name: 'Test', mediaType, mediaFormat })
        assert.equal(response.status, 201)
        assert.equal((await response.json()).info, null)
      }
    }
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
  })
})
