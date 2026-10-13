import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../physics.js';
const HOST='11111111-1111-4111-8111-111111111111',GUEST='22222222-2222-4222-8222-222222222222',THIRD='33333333-3333-4333-8333-333333333333';
test('private room lifecycle, host authority, checkpoint save, reconnect and expiration',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon; create role authenticated;');
  const sql=(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8')).replace('alter publication supabase_realtime add table public.cn_room_events;','');await db.exec(sql);
  const rpc=async(code,name,token,action,payload=null)=>{
   const {rows}=await db.query('select public.cn_command($1,$2,$3,$4,$5) as result',[code,name,token,action,payload===null?null:JSON.stringify(payload)]);return rows[0].result;
  };
  await db.exec('set role anon');
  const a=await rpc('','Alice',HOST,'create');assert.match(a.code,/^CN[0-9A-F]{4}$/);assert.equal(a.me,'a');assert.equal(a.status,'lobby');assert.ok(a.channel);
  assert.ok(!JSON.stringify(a).includes(HOST),'secret player tokens must not be returned');
  await assert.rejects(db.query('select * from public.cn_players'),/permission denied/);
  await assert.rejects(rpc(a.code,'Alice',THIRD,'join'),/NAME_IN_USE/);
  const b=await rpc(a.code,'Bob',GUEST,'join');assert.equal(b.me,'b');assert.equal(b.players.length,2);
  await assert.rejects(rpc(a.code,'Carol',THIRD,'join'),/ROOM_FULL/);
  assert.equal((await rpc(a.code,'Alice',HOST,'ready')).status,'lobby');
  assert.equal((await rpc(a.code,'Bob',GUEST,'ready')).status,'playing');
  await assert.rejects(rpc(a.code,'Alice',THIRD,'heartbeat'),/INVALID_IDENTITY/);
  const w=new World();w.load(2);w.s.checkpoint=1;const snapshot=w.persistence();
  await assert.rejects(rpc(a.code,'Bob',GUEST,'save',snapshot),/HOST_REQUIRED/);
  await assert.rejects(rpc(a.code,'Alice',HOST,'save',{...snapshot,level:99}),/INVALID_SNAPSHOT/);
  const saved=await rpc(a.code,'Alice',HOST,'save',snapshot);assert.equal(saved.snapshot.level,2);assert.equal(saved.snapshot.checkpoint,1);
  await rpc(a.code,'Bob',GUEST,'leave');assert.equal((await rpc(a.code,'Alice',HOST,'heartbeat')).players.find(p=>p.id==='b').connected,false);
  const rejoin=await rpc(a.code,'Bob',THIRD,'join');assert.equal(rejoin.me,'b');assert.equal(rejoin.snapshot.level,2);
  w.load(6);w.s.status='complete';assert.equal((await rpc(a.code,'Alice',HOST,'save',w.persistence())).status,'complete');
  await assert.rejects(rpc(a.code,'Bob',THIRD,'replay'),/HOST_REQUIRED/);
  const replay=await rpc(a.code,'Alice',HOST,'replay');assert.equal(replay.status,'lobby');assert.equal(replay.snapshot,null);assert.ok(replay.players.every(p=>!p.ready));
  await db.exec('reset role');await db.query("update public.cn_players set last_seen=now()-interval '1 minute' where nickname='Bob'");await db.exec('set role anon');
  assert.equal((await rpc(a.code,'Alice',HOST,'heartbeat')).players.find(p=>p.id==='b').connected,false);
  await db.exec('reset role');await db.query("update public.cn_rooms set expires_at=now()-interval '1 minute' where room_code=$1",[a.code]);await db.exec('set role anon');
  await assert.rejects(rpc(a.code,'Alice',HOST,'heartbeat'),/ROOM_EXPIRED/);
 }finally{await db.close();}
});
