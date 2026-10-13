import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleRoomRequest } from '../online/lib/rooms.mjs';
import { World } from '../physics.js';

// SQLite executes the same SQL as D1, including unique constraints and atomic
// batches. Production tables come from the generated Drizzle migration.
function database() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE cn_rooms (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'lobby',
      version INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      current_level INTEGER NOT NULL DEFAULT 0, checkpoint INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0, snapshot TEXT,
      CHECK(status IN ('lobby','playing','complete')), CHECK(current_level BETWEEN 0 AND 6));
    CREATE TABLE cn_players (
      id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES cn_rooms(id) ON DELETE CASCADE,
      seat TEXT NOT NULL CHECK(seat IN ('a','b')), nickname TEXT NOT NULL, nickname_key TEXT NOT NULL,
      token_hash TEXT NOT NULL, ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1)),
      connected INTEGER NOT NULL DEFAULT 1 CHECK(connected IN (0,1)), last_seen INTEGER NOT NULL,
      packet TEXT, packet_epoch TEXT, packet_sequence INTEGER NOT NULL DEFAULT -1,
      UNIQUE(room_id,seat), UNIQUE(room_id,nickname_key), UNIQUE(room_id,token_hash));`);
  class Statement {
    constructor(sql, values = []) { this.sql = sql; this.values = values; }
    bind(...values) { return new Statement(this.sql, values); }
    async first() { return raw.prepare(this.sql).get(...this.values) || null; }
    async all() { return { results: raw.prepare(this.sql).all(...this.values) }; }
    async run() { const result = raw.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; }
  }
  return {
    raw,
    prepare(sql) { return new Statement(sql); },
    async batch(statements) {
      raw.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); raw.exec('COMMIT'); return result; }
      catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
  };
}

const person = nickname => ({ nickname, token: crypto.randomUUID() });
async function call(db, person, action, options = {}) {
  const response = await handleRoomRequest(new Request('https://connected.example/api/room', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...person, action, ...options }),
  }), db);
  return { status: response.status, body: await response.json() };
}
async function pair(db) {
  const host = person('Mochi'), guest = person('Peach');
  const created = await call(db, host, 'create');
  assert.equal(created.status, 200);
  const code = created.body.code;
  assert.equal((await call(db, guest, 'join', { code })).status, 200);
  return { host, guest, code };
}
async function start(db, players) {
  await call(db, players.host, 'ready', { code: players.code });
  const result = await call(db, players.guest, 'ready', { code: players.code });
  assert.equal(result.body.status, 'playing');
  return result.body;
}
const packet = (type, extra = {}, sequence = 1, epoch = 'epoch-test-001') => ({ type, epoch, sequence, ...extra });

test('hosted rooms reserve two seats, normalize names and keep identity hashes private', async () => {
  const db = database();
  const p = await pair(db);
  const hostRoom = await call(db, p.host, 'heartbeat', { code: p.code });
  assert.equal(hostRoom.body.me, 'a');
  assert.deepEqual(hostRoom.body.players.map(v => [v.id, v.nickname, v.character]), [['a', 'Mochi', 'nova'], ['b', 'Peach', 'echo']]);
  assert.equal((await call(db, person('Third'), 'join', { code: p.code })).body.error, 'ROOM_FULL');
  assert.equal((await call(db, person('mochi'), 'join', { code: p.code })).body.error, 'NAME_IN_USE');
  assert.equal((await call(db, person('x'), 'create')).body.error, 'INVALID_NICKNAME');
  const raw = db.raw.prepare('SELECT token_hash FROM cn_players WHERE seat = ?').get('a');
  assert.equal(raw.token_hash.length, 64);
  assert.notEqual(raw.token_hash, p.host.token);
  assert.ok(!JSON.stringify(hostRoom.body).includes('token'));
  assert.ok(!JSON.stringify(hostRoom.body).includes(raw.token_hash));
  assert.equal((await call(db, { ...p.host, token: crypto.randomUUID() }, 'save', { code: p.code, payload: new World().snapshot() })).status, 401);
});

test('readiness requires both connected players and guest cannot save authoritative checkpoints', async () => {
  const db = database();
  const p = await pair(db);
  assert.equal((await call(db, p.host, 'save', { code: p.code, payload: new World().snapshot() })).body.error, 'SESSION_NOT_STARTED');
  const first = await call(db, p.host, 'ready', { code: p.code });
  assert.equal(first.body.status, 'lobby');
  const second = await call(db, p.guest, 'ready', { code: p.code });
  assert.equal(second.body.status, 'playing');
  assert.equal((await call(db, p.guest, 'save', { code: p.code, payload: new World().snapshot() })).body.error, 'HOST_REQUIRED');
  const world = new World();
  world.s.players[0].x += 100;
  const saved = await call(db, p.host, 'save', { code: p.code, payload: world.persistence() });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.snapshot.players[0].x, world.s.checkpointState.positions[0].x);
  assert.equal(saved.body.snapshot.level, 0);
  assert.equal((await call(db, p.host, 'save', { code: p.code, payload: { level: 0, status: 'playing' } })).body.error, 'INVALID_SNAPSHOT');
});

test('HTTP exchange relays bounded input/world packets with server-assigned sender and stable room version', async () => {
  const db = database();
  const p = await pair(db);
  const room = await start(db, p);
  const snapshot = new World().snapshot();
  const worldPacket = packet('world', { state: snapshot, from: 'b' });
  assert.equal((await call(db, p.host, 'exchange', { code: p.code, packet: worldPacket })).status, 200);
  const guestExchange = await call(db, p.guest, 'exchange', { code: p.code, packet: packet('input', { input: { right: true, left: 1, emote: 3 }, from: 'a' }) });
  assert.equal(guestExchange.body.peerPacket.from, 'a');
  assert.equal(guestExchange.body.peerPacket.state.players[0].x, snapshot.players[0].x);
  assert.equal(guestExchange.body.version, room.version);
  const hostExchange = await call(db, p.host, 'exchange', { code: p.code, packet: { ...worldPacket, sequence: 2 } });
  assert.equal(hostExchange.body.peerPacket.from, 'b');
  assert.equal(hostExchange.body.peerPacket.input.right, true);
  assert.equal(hostExchange.body.peerPacket.input.left, false);
  assert.equal(hostExchange.body.version, room.version);
  const authority = await call(db, p.guest, 'exchange', { code: p.code, packet: worldPacket });
  assert.equal(authority.body.error, 'INVALID_PACKET');
  const malformed = structuredClone(snapshot);
  malformed.players[1].x = 999999;
  assert.equal((await call(db, p.host, 'exchange', { code: p.code, packet: packet('world', { state: malformed }, 3) })).body.error, 'INVALID_SNAPSHOT');
  assert.equal((await call(db, p.guest, 'exchange', { code: p.code, packet: packet('command', { command: 'delete' }, 3) })).body.error, 'INVALID_PACKET');
});

test('relay keeps newest packet within an epoch and supports reconnect with a fresh epoch', async () => {
  const db = database();
  const p = await pair(db);
  await start(db, p);
  await call(db, p.guest, 'exchange', { code: p.code, packet: packet('input', { input: { right: true } }, 10) });
  await call(db, p.guest, 'exchange', { code: p.code, packet: packet('input', { input: { left: true } }, 9) });
  const get = () => call(db, p.host, 'exchange', { code: p.code, packet: packet('world', { state: new World().snapshot() }) });
  assert.equal((await get()).body.peerPacket.sequence, 10);
  assert.equal((await get()).body.peerPacket.input.right, true);
  await call(db, p.guest, 'exchange', { code: p.code, packet: packet('input', { input: { left: true } }, 1, 'epoch-test-002') });
  assert.equal((await get()).body.peerPacket.epoch, 'epoch-test-002');
  assert.equal((await get()).body.peerPacket.input.left, true);
});

test('stale presence pauses the pair, reconnect retains seats and an active adventure cannot be hijacked', async () => {
  const db = database();
  const p = await pair(db);
  await start(db, p);
  await call(db, p.host, 'save', { code: p.code, payload: new World().persistence() });
  db.raw.prepare('UPDATE cn_players SET last_seen = ? WHERE seat = ?').run(Date.now() - 17_000, 'b');
  const stale = await call(db, p.host, 'heartbeat', { code: p.code });
  assert.equal(stale.body.players[1].connected, false);
  assert.equal((await call(db, person('New Echo'), 'join', { code: p.code })).body.error, 'ROOM_FULL');
  const resumed = await call(db, p.guest, 'join', { code: p.code });
  assert.equal(resumed.body.me, 'b');
  assert.equal(resumed.body.players[1].connected, true);
  assert.ok(resumed.body.snapshot);
  const left = await call(db, p.guest, 'leave', { code: p.code });
  assert.equal(left.body.players[1].connected, false);
  assert.equal((await call(db, p.guest, 'join', { code: p.code })).body.me, 'b');
});

test('an abandoned lobby seat can be reused, but host nickname and simultaneous capacity remain protected', async () => {
  const db = database();
  const p = await pair(db);
  await call(db, p.guest, 'leave', { code: p.code });
  const replacement = person('Berry');
  const result = await call(db, replacement, 'join', { code: p.code });
  assert.equal(result.status, 200);
  assert.equal(result.body.me, 'b');
  assert.equal(result.body.players[1].nickname, 'Berry');
  assert.equal((await call(db, p.guest, 'heartbeat', { code: p.code })).status, 401);
  const db2 = database();
  const host = person('Cloud');
  const created = await call(db2, host, 'create');
  const attempts = await Promise.all([call(db2, person('Pink'), 'join', { code: created.body.code }), call(db2, person('Lilac'), 'join', { code: created.body.code })]);
  assert.equal(attempts.filter(v => v.status === 200).length, 1);
  assert.equal(db2.raw.prepare('SELECT COUNT(*) AS total FROM cn_players').get().total, 2);
});

test('completion, host replay, expiry and request limits return clear API errors', async () => {
  const db = database();
  const p = await pair(db);
  await start(db, p);
  const world = new World();
  world.s.status = 'complete';
  assert.equal((await call(db, p.host, 'save', { code: p.code, payload: world.snapshot() })).body.error, 'INVALID_SNAPSHOT');
  world.load(6); world.s.status = 'complete';
  assert.equal((await call(db, p.host, 'save', { code: p.code, payload: world.snapshot() })).body.status, 'complete');
  assert.equal((await call(db, p.guest, 'replay', { code: p.code })).body.error, 'HOST_REQUIRED');
  const replay = await call(db, p.host, 'replay', { code: p.code });
  assert.equal(replay.body.status, 'lobby');
  assert.equal(replay.body.snapshot, null);
  assert.ok(replay.body.players.every(v => !v.ready));
  db.raw.prepare('UPDATE cn_rooms SET expires_at = ? WHERE code = ?').run(Date.now() - 1, p.code);
  assert.equal((await call(db, p.host, 'heartbeat', { code: p.code })).body.error, 'ROOM_EXPIRED');
  const oversized = await handleRoomRequest(new Request('https://connected.example/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(80000) }) }), db);
  assert.equal(oversized.status, 413);
  assert.equal((await handleRoomRequest(new Request('https://connected.example/api/room'), db)).status, 405);
  assert.equal((await handleRoomRequest(new Request('https://connected.example/api/room', { method: 'POST' }), db)).status, 415);
});
