import assert from 'node:assert/strict';
import { World } from '../physics.js';

// Run with: node scripts/verify-online.mjs https://your-game.example
// Identities are generated in memory and deliberately never logged or saved.
const supplied = process.argv[2] || 'http://127.0.0.1:4175';
const base = new URL(supplied);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
  throw new Error('Provide a plain HTTP(S) game URL without credentials, query parameters or a fragment.');
}
const endpoint = new URL('/api/room', base);
const suffix = crypto.randomUUID().slice(0, 6);
const host = { nickname: `Mochi${suffix}`, token: crypto.randomUUID() };
const guest = { nickname: `Peach${suffix}`, token: crypto.randomUUID() };
const third = { nickname: `Berry${suffix}`, token: crypto.randomUUID() };
const hostEpoch = crypto.randomUUID(), guestEpoch = crypto.randomUUID();
let code = '', guestJoined = false, checks = 0;
const pass = label => { checks++; console.log(`PASS ${label}`); };

async function request(person, action, options = {}, expected = 200) {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...person, action, code, ...options }),
    signal: AbortSignal.timeout(15000),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error(`${action}: API did not return JSON (${response.status}).`); }
  assert.equal(response.status, expected, `${action}: unexpected HTTP status (${data.error || 'no error code'}).`);
  if (expected === 200) {
    assert.equal(data.code, code || data.code, `${action}: room code changed.`);
    assert.ok(Array.isArray(data.players), `${action}: room players are missing.`);
    assert.ok(!JSON.stringify(data).includes(person.token), `${action}: identity was exposed.`);
  }
  return data;
}
const frame = (type, epoch, sequence, extra) => ({ type, epoch, sequence, ...extra });

try {
  const page = await fetch(base, { signal: AbortSignal.timeout(15000) });
  assert.equal(page.status, 200, 'Game page did not load.');
  assert.match(await page.text(), /CONNECTED/i, 'Game page does not identify CONNECTED.');
  pass('game page loads');

  const health = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
  assert.equal(health.status, 200, 'Room API health route did not load.');
  assert.equal((await health.json()).online, true, 'Room database is not enabled.');
  pass('room API is ready');

  const created = await request(host, 'create');
  code = created.code;
  assert.match(code, /^CN[A-F0-9]{4}$/);
  assert.equal(created.me, 'a');
  assert.equal(created.status, 'lobby');
  const joined = await request(guest, 'join');
  guestJoined = true;
  assert.equal(joined.me, 'b');
  assert.equal(joined.players.length, 2);
  assert.ok(joined.players.every(p => p.connected));
  pass('host creates a private room and guest joins');

  assert.equal((await request(host, 'ready')).status, 'lobby');
  const started = await request(guest, 'ready');
  assert.equal(started.status, 'playing');
  assert.ok(started.players.every(p => p.ready));
  pass('two ready players start together');

  const world = new World();
  const before = world.snapshot();
  await request(host, 'exchange', { packet: frame('world', hostEpoch, 1, { state: before }) });
  const guestResult = await request(guest, 'exchange', { packet: frame('input', guestEpoch, 1, { input: { right: true, jump: true, emote: 3 } }) });
  assert.equal(guestResult.peerPacket?.type, 'world');
  assert.equal(guestResult.peerPacket.from, 'a');
  assert.equal(guestResult.peerPacket.state.players[0].x, before.players[0].x);
  world.setInput(0, { right: true });
  world.setInput(1, { right: true, jump: true });
  for (let i = 0; i < 30; i++) world.step(1 / 60);
  const moved = world.snapshot();
  assert.ok(moved.players[0].x > before.players[0].x + 20, 'Nova did not move in simulation.');
  assert.ok(moved.players[1].x > before.players[1].x + 20, 'Echo did not move in simulation.');
  const hostResult = await request(host, 'exchange', { packet: frame('world', hostEpoch, 2, { state: moved }) });
  assert.equal(hostResult.peerPacket?.type, 'input');
  assert.equal(hostResult.peerPacket.from, 'b');
  assert.equal(hostResult.peerPacket.input.right, true);
  assert.equal(hostResult.peerPacket.input.jump, true);
  assert.equal(hostResult.peerPacket.input.emote, 3);
  const received = await request(guest, 'exchange', { packet: frame('input', guestEpoch, 2, { input: { left: true } }) });
  assert.equal(received.peerPacket.sequence, 2);
  assert.equal(received.peerPacket.state.players[0].x, moved.players[0].x);
  assert.equal(received.peerPacket.state.players[1].x, moved.players[1].x);
  assert.equal(received.version, started.version, 'Frame exchange changed shared lobby version.');
  pass('guest input and moving world reach both clients');

  const persisted = world.persistence();
  const saved = await request(host, 'save', { payload: persisted });
  assert.equal(saved.snapshot.level, persisted.level);
  assert.equal(saved.snapshot.players[0].x, persisted.checkpointState.positions[0].x);
  assert.equal(saved.snapshot.time, persisted.time);
  const deniedSave = await request(guest, 'save', { payload: persisted }, 403);
  assert.equal(deniedSave.error, 'HOST_REQUIRED');
  pass('host checkpoint persists and guest cannot overwrite it');

  const full = await request(third, 'join', {}, 409);
  assert.equal(full.error, 'ROOM_FULL');
  pass('a third unknown client is rejected');

  const left = await request(guest, 'leave');
  guestJoined = false;
  assert.equal(left.players.find(p => p.id === 'b').connected, false);
  const rejoined = await request(guest, 'join');
  guestJoined = true;
  assert.equal(rejoined.me, 'b');
  assert.equal(rejoined.players.find(p => p.id === 'b').connected, true);
  assert.equal(rejoined.snapshot.time, persisted.time);
  const newEpoch = crypto.randomUUID();
  await request(guest, 'exchange', { packet: frame('input', newEpoch, 1, { input: { pull: true } }) });
  const resumed = await request(host, 'exchange', { packet: frame('world', hostEpoch, 3, { state: moved }) });
  assert.equal(resumed.peerPacket.epoch, newEpoch);
  assert.equal(resumed.peerPacket.sequence, 1);
  assert.equal(resumed.peerPacket.input.pull, true);
  pass('Echo reconnects with its seat, checkpoint and a fresh packet epoch');
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  if (code) {
    let cleaned = true;
    for (const person of [guestJoined ? guest : null, host].filter(Boolean)) {
      try { await request(person, 'leave'); } catch { cleaned = false; }
    }
    if (cleaned) pass('verification clients leave the room');
    else { console.error('FAIL verification room cleanup'); process.exitCode = 1; }
  }
  console.log(`${checks} online checks passed for ${base.origin}.`);
}
