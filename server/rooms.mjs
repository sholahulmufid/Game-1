// Private two-player rooms. All identities and game authority are checked here;
// browsers never receive the stored identity hash or write directly to D1.
const STALE_MS = 16_000;
const ROOM_MS = 24 * 60 * 60 * 1000;
const MAX_REQUEST_BYTES = 76_000;
const MAX_STATE_BYTES = 65_536;
const ACTIONS = new Set(['create', 'join', 'heartbeat', 'leave', 'ready', 'save', 'replay', 'exchange']);
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
class RoomError extends Error {
  constructor(code, status = 400) { super(code); this.status = status; }
}
const fail = (code, status) => { throw new RoomError(code, status); };
const query = (db, sql, values = []) => db.prepare(sql).bind(...values);
const changed = result => Number(result?.meta?.changes || 0);
const bytes = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
const bounded = (v, limit = 1e9) => Number.isFinite(v) && Math.abs(v) <= limit;
const point = p => p && bounded(p.x, 9999) && bounded(p.y, 9999);
const pair = value => Array.isArray(value) && value.length === 2;
const mechanism = m => m && ['plates', 'core', 'heavyDelivered', 'door'].every(k => typeof m[k] === 'boolean')
  && bounded(m.plateHold) && m.plateHold >= 0 && bounded(m.laserUntil) && m.laserUntil >= 0
  && Number.isInteger(m.switchMask) && m.switchMask >= 0 && m.switchMask <= 3
  && (m.coreCarrier === null || m.coreCarrier === 0 || m.coreCarrier === 1)
  && (m.corePos === null || point(m.corePos))
  && (m.heavy === null || point(m.heavy) && bounded(m.heavy.vx, 5000) && bounded(m.heavy.vy, 5000) && typeof m.heavy.carried === 'boolean');

export function validRoomSnapshot(s) {
  return Boolean(s && Number.isInteger(s.level) && s.level >= 0 && s.level <= 6
    && ['playing', 'levelComplete', 'complete', 'failed'].includes(s.status)
    && ['clock', 'time', 'levelTime'].every(k => bounded(s[k]) && s[k] >= 0)
    && ['revision', 'checkpoint'].every(k => Number.isSafeInteger(s[k]) && s[k] >= 0)
    && (s.collapseLeft === null || bounded(s.collapseLeft, 1000))
    && pair(s.players) && s.players.every((p, i) => point(p) && p.id === i
      && ['vx', 'vy', 'coyote', 'jumpBuffer', 'invincible'].every(k => bounded(p[k], 5000))
      && ['grounded', 'prevJump', 'prevInteract', 'hanging'].every(k => typeof p[k] === 'boolean')
      && [-1, 1].includes(p.facing) && ['idle', 'run', 'jump', 'fall', 'carry', 'pull'].includes(p.animation)
      && typeof p.emote === 'string' && p.emote.length <= 16 && bounded(p.emoteUntil))
    && s.stats && ['falls', 'rescues'].every(k => pair(s.stats[k]) && s.stats[k].every(v => Number.isInteger(v) && v >= 0))
    && Number.isInteger(s.stats.restarts) && s.stats.restarts >= 0
    && mechanism(s.mechanisms) && s.checkpointState && pair(s.checkpointState.positions)
    && s.checkpointState.positions.every(point) && mechanism(s.checkpointState.mechanisms)
    && bytes(s) <= MAX_STATE_BYTES);
}

function nickname(value) {
  if (typeof value !== 'string') fail('INVALID_NICKNAME');
  const name = value.trim().normalize('NFC');
  if ([...name].length < 2 || [...name].length > 20 || /[\x00-\x1f\x7f]/u.test(name)) fail('INVALID_NICKNAME');
  return name;
}

async function tokenHash(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/u.test(value)) fail('INVALID_IDENTITY', 401);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), v => v.toString(16).padStart(2, '0')).join('');
}

async function findRoom(db, code, now) {
  if (typeof code !== 'string' || !/^CN[A-F0-9]{4}$/u.test(code)) fail('ROOM_NOT_FOUND', 404);
  const room = await query(db, 'SELECT * FROM cn_rooms WHERE code = ?', [code]).first();
  if (!room) fail('ROOM_NOT_FOUND', 404);
  if (room.expires_at <= now) fail('ROOM_EXPIRED', 410);
  return room;
}

async function identity(db, room, name, hash) {
  const player = await query(db, 'SELECT * FROM cn_players WHERE room_id = ? AND token_hash = ? AND nickname_key = ?', [room.id, hash, name.toLocaleLowerCase('en-US')]).first();
  if (!player) fail('INVALID_IDENTITY', 401);
  return player;
}

async function responseRoom(db, roomId, playerId, now, includePacket = false) {
  const [room, rows] = await Promise.all([
    query(db, 'SELECT * FROM cn_rooms WHERE id = ?', [roomId]).first(),
    query(db, 'SELECT * FROM cn_players WHERE room_id = ? ORDER BY seat', [roomId]).all(),
  ]);
  const players = rows.results || [];
  const me = players.find(p => p.id === playerId);
  if (!room || !me) fail('INVALID_IDENTITY', 401);
  const peer = players.find(p => p.id !== playerId);
  const active = p => Boolean(p.connected && p.last_seen > now - STALE_MS);
  return {
    code: room.code, status: room.status, me: me.seat,
    players: players.map(p => ({ id: p.seat, nickname: p.nickname, character: p.seat === 'a' ? 'nova' : 'echo', ready: Boolean(p.ready), connected: active(p) })),
    version: room.version, serverNow: now,
    snapshot: room.snapshot ? JSON.parse(room.snapshot) : null,
    peerPacket: includePacket && peer && active(peer) && peer.packet ? JSON.parse(peer.packet) : null,
  };
}

async function create(db, name, hash, now) {
  const id = crypto.randomUUID(), playerId = crypto.randomUUID();
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = 'CN' + Array.from(crypto.getRandomValues(new Uint8Array(2)), v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    const inserted = await query(db, 'INSERT OR IGNORE INTO cn_rooms (id, code, status, version, created_at, expires_at) VALUES (?, ?, \'lobby\', 1, ?, ?)', [id, code, now, now + ROOM_MS]).run();
    if (!changed(inserted)) continue;
    await query(db, 'INSERT INTO cn_players (id, room_id, seat, nickname, nickname_key, token_hash, ready, connected, last_seen) VALUES (?, ?, \'a\', ?, ?, ?, 0, 1, ?)', [playerId, id, name, name.toLocaleLowerCase('en-US'), hash, now]).run();
    return responseRoom(db, id, playerId, now);
  }
  fail('ROOM_CREATION_FAILED', 503);
}

async function join(db, room, name, hash, now) {
  const key = name.toLocaleLowerCase('en-US');
  let player = await query(db, 'SELECT * FROM cn_players WHERE room_id = ? AND token_hash = ?', [room.id, hash]).first();
  if (player) {
    if (player.nickname_key !== key) fail('INVALID_IDENTITY', 401);
    await db.batch([
      query(db, 'UPDATE cn_players SET connected = 1, last_seen = ? WHERE id = ?', [now, player.id]),
      query(db, 'UPDATE cn_rooms SET version = version + 1 WHERE id = ?', [room.id]),
    ]);
    return responseRoom(db, room.id, player.id, now);
  }
  const named = await query(db, 'SELECT * FROM cn_players WHERE room_id = ? AND nickname_key = ?', [room.id, key]).first();
  if (named && (named.seat === 'a' || named.connected && named.last_seen > now - STALE_MS || room.status !== 'lobby')) fail('NAME_IN_USE', 409);
  if (room.status !== 'lobby') fail('ROOM_FULL', 409);
  const playerId = crypto.randomUUID();
  const occupied = await query(db, 'SELECT * FROM cn_players WHERE room_id = ? AND seat = \'b\'', [room.id]).first();
  let result;
  if (occupied) {
    result = await query(db, `UPDATE cn_players SET id = ?, nickname = ?, nickname_key = ?, token_hash = ?, ready = 0,
      connected = 1, last_seen = ?, packet = NULL, packet_epoch = NULL, packet_sequence = -1
      WHERE room_id = ? AND seat = 'b' AND (connected = 0 OR last_seen <= ?)
      AND EXISTS (SELECT 1 FROM cn_rooms WHERE id = ? AND status = 'lobby')
      AND NOT EXISTS (SELECT 1 FROM cn_players WHERE room_id = ? AND seat = 'a' AND nickname_key = ?)`,
    [playerId, name, key, hash, now, room.id, now - STALE_MS, room.id, room.id, key]).run();
  } else {
    result = await query(db, `INSERT OR IGNORE INTO cn_players (id, room_id, seat, nickname, nickname_key, token_hash, ready, connected, last_seen)
      SELECT ?, id, 'b', ?, ?, ?, 0, 1, ? FROM cn_rooms
      WHERE id = ? AND status = 'lobby'
      AND NOT EXISTS (SELECT 1 FROM cn_players WHERE room_id = ? AND nickname_key = ?)`,
    [playerId, name, key, hash, now, room.id, room.id, key]).run();
  }
  if (!changed(result)) fail('ROOM_FULL', 409);
  await query(db, 'UPDATE cn_rooms SET version = version + 1 WHERE id = ?', [room.id]).run();
  return responseRoom(db, room.id, playerId, now);
}

function packetForSeat(packet, player) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)
    || typeof packet.epoch !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/u.test(packet.epoch)
    || !Number.isSafeInteger(packet.sequence) || packet.sequence < 1 || bytes(packet) > MAX_STATE_BYTES) fail('INVALID_PACKET');
  const base = { from: player.seat, epoch: packet.epoch, sequence: packet.sequence, type: packet.type };
  if(packet.ack&&typeof packet.ack.epoch==='string'&&/^[A-Za-z0-9_-]{8,128}$/u.test(packet.ack.epoch)&&Number.isSafeInteger(packet.ack.sequence)&&packet.ack.sequence>=0)base.ack={epoch:packet.ack.epoch,sequence:packet.ack.sequence};
  if (player.seat === 'a') {
    if (packet.type !== 'world') fail('HOST_REQUIRED', 403);
    if (!validRoomSnapshot(packet.state)) fail('INVALID_SNAPSHOT');
    return { ...base, state: packet.state };
  }
  if (packet.type === 'input') {
    const input = packet.input;
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_PACKET');
    return { ...base, input: {
      left: input.left === true, right: input.right === true, jump: input.jump === true,
      interact: input.interact === true, pull: input.pull === true,
      emote: Number.isInteger(input.emote) && input.emote >= 0 && input.emote <= 4 ? input.emote : 0,
    } };
  }
  if (packet.type === 'command' && ['restart', 'next'].includes(packet.command)) return { ...base, command: packet.command };
  fail('INVALID_PACKET');
}

async function command(db, body, now) {
  const action = body.action;
  if (!ACTIONS.has(action)) fail('INVALID_ACTION');
  const name = nickname(body.nickname), hash = await tokenHash(body.token);
  if (action === 'create') return create(db, name, hash, now);
  const room = await findRoom(db, typeof body.code === 'string' ? body.code.trim().toUpperCase() : body.code, now);
  if (action === 'join') return join(db, room, name, hash, now);
  const player = await identity(db, room, name, hash);
  if (action === 'leave') {
    await db.batch([
      query(db, 'UPDATE cn_players SET connected = 0, ready = 0, packet = NULL WHERE id = ?', [player.id]),
      query(db, 'UPDATE cn_rooms SET version = version + 1 WHERE id = ?', [room.id]),
    ]);
  } else if (action === 'ready') {
    if (room.status !== 'lobby') fail('SESSION_ALREADY_STARTED', 409);
    await db.batch([
      query(db, 'UPDATE cn_players SET ready = CASE WHEN ready = 1 THEN 0 ELSE 1 END, connected = 1, last_seen = ? WHERE id = ? AND EXISTS (SELECT 1 FROM cn_rooms WHERE id = ? AND status = \'lobby\')', [now, player.id, room.id]),
      query(db, `UPDATE cn_rooms SET version = version + 1,
        status = CASE WHEN (SELECT COUNT(*) FROM cn_players WHERE room_id = ? AND ready = 1 AND connected = 1 AND last_seen > ?) = 2 THEN 'playing' ELSE 'lobby' END
        WHERE id = ? AND status = 'lobby'`, [room.id, now - STALE_MS, room.id]),
    ]);
  } else if (action === 'save') {
    if (player.seat !== 'a') fail('HOST_REQUIRED', 403);
    const state = body.payload;
    if (!validRoomSnapshot(state) || state.status === 'complete' && state.level !== 6) fail('INVALID_SNAPSHOT');
    const result = await query(db, `UPDATE cn_rooms SET snapshot = ?, current_level = ?, checkpoint = ?, revision = ?,
      status = ?, version = version + 1
      WHERE id = ? AND (status = 'playing' OR (status = 'complete' AND ? = 'complete'))
      AND current_level <= ? AND revision <= ?`,
    [JSON.stringify(state), state.level, state.checkpoint, state.revision, state.status === 'complete' ? 'complete' : 'playing', room.id, state.status, state.level, state.revision]).run();
    if (!changed(result)) fail(room.status === 'lobby' ? 'SESSION_NOT_STARTED' : 'STALE_SNAPSHOT', 409);
    await query(db, 'UPDATE cn_players SET connected = 1, last_seen = ? WHERE id = ?', [now, player.id]).run();
  } else if (action === 'replay') {
    if (player.seat !== 'a') fail('HOST_REQUIRED', 403);
    if (room.status !== 'complete') fail('SESSION_NOT_COMPLETE', 409);
    await db.batch([
      query(db, 'UPDATE cn_players SET ready = 0, packet = NULL, packet_epoch = NULL, packet_sequence = -1 WHERE room_id = ? AND EXISTS (SELECT 1 FROM cn_rooms WHERE id = ? AND status = \'complete\')', [room.id, room.id]),
      query(db, 'UPDATE cn_rooms SET status = \'lobby\', snapshot = NULL, current_level = 0, checkpoint = 0, revision = 0, version = version + 1 WHERE id = ? AND status = \'complete\'', [room.id]),
    ]);
  } else if (action === 'exchange') {
    if (room.status === 'lobby') fail('SESSION_NOT_STARTED', 409);
    const packet = packetForSeat(body.packet, player);
    await query(db, `UPDATE cn_players SET connected = 1, last_seen = ?,
      packet = CASE WHEN packet_epoch IS NULL OR packet_epoch <> ? OR packet_sequence < ? THEN ? ELSE packet END,
      packet_sequence = CASE WHEN packet_epoch IS NULL OR packet_epoch <> ? OR packet_sequence < ? THEN ? ELSE packet_sequence END,
      packet_epoch = CASE WHEN packet_epoch IS NULL OR packet_epoch <> ? OR packet_sequence < ? THEN ? ELSE packet_epoch END
      WHERE id = ?`, [now, packet.epoch, packet.sequence, JSON.stringify(packet), packet.epoch, packet.sequence, packet.sequence, packet.epoch, packet.sequence, packet.epoch, player.id]).run();
  } else {
    await db.batch([
      query(db, 'UPDATE cn_rooms SET version = version + 1 WHERE id = ? AND EXISTS (SELECT 1 FROM cn_players WHERE id = ? AND connected = 0)', [room.id, player.id]),
      query(db, 'UPDATE cn_players SET connected = 1, last_seen = ? WHERE id = ?', [now, player.id]),
    ]);
  }
  return responseRoom(db, room.id, player.id, now, action === 'exchange');
}

export async function handleRoomRequest(request, db) {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  if (!db) return json({ error: 'ONLINE_UNAVAILABLE' }, 503);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'JSON_REQUIRED' }, 415);
  try {
    if (Number(request.headers.get('Content-Length')) > MAX_REQUEST_BYTES) fail('REQUEST_TOO_LARGE', 413);
    // Bound the stream before materializing text, including chunked requests
    // without a Content-Length header.
    const reader = request.body?.getReader(), decoder = new TextDecoder();
    let raw = '', size = 0;
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_REQUEST_BYTES) { await reader.cancel(); fail('REQUEST_TOO_LARGE', 413); }
          raw += decoder.decode(chunk.value, { stream: true });
        }
        raw += decoder.decode();
      } finally { reader.releaseLock(); }
    }
    let body;
    try { body = JSON.parse(raw); } catch { fail('INVALID_JSON'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('INVALID_JSON');
    return json(await command(db, body, Date.now()));
  } catch (error) {
    if (error instanceof RoomError) return json({ error: error.message }, error.status);
    return json({ error: 'ROOM_SERVICE_UNAVAILABLE' }, 503);
  }
}
