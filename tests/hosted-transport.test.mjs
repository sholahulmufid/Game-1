import test from 'node:test';
import assert from 'node:assert/strict';
import {HostedMultiplayer} from '../hosted-multiplayer.js';
import {handleRoomRequest} from '../online/lib/rooms.mjs';
import {localRoomDatabase} from '../scripts/d1-local.mjs';
import {World} from '../physics.js';

test('two HTTP clients join, ready, exchange inputs/world, acknowledge commands and reconnect',async()=>{
 const db=await localRoomDatabase(':memory:'),storage=new Map(),prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
 const hostPackets=[],guestPackets=[],errors=[],rooms=[];
 const fetcher=(url,init)=>handleRoomRequest(new Request('https://connected.test/api/room',init),db);
 const make=packets=>new HostedMultiplayer({roomEndpoint:'/api/room'},{fetcher,onRoom:r=>rooms.push(r),onPacket:p=>packets.push(p),onError:e=>errors.push(e)});
 const host=make(hostPackets),guest=make(guestPackets);let reconnect;
 const poll=async c=>{await c.poll();clearTimeout(c.pollTimer);};
 try{
  const room=await host.connect('create','Mochi','');clearTimeout(host.pollTimer);await guest.connect('join','Peach',room.code);clearTimeout(guest.pollTimer);
  await poll(host);assert.equal(host.ready,true,'lobby must use heartbeat instead of invalid exchange');
  await host.action('ready');await guest.action('ready');await poll(host);assert.equal(host.roomStatus,'playing');
  const world=new World();host.broadcast({type:'world',state:world.snapshot()});guest.broadcast({type:'input',input:{right:true}});await poll(guest);await poll(host);await poll(guest);
  assert.equal(hostPackets.at(-1).input.right,true);assert.equal(guestPackets.at(-1).state.level,0);
  guest.broadcast({type:'command',command:'next'});guest.broadcast({type:'input',input:{left:true}});await poll(guest);assert.equal(guest.commands.length,1,'server write alone is not peer acknowledgement');
  host.broadcast({type:'world',state:world.snapshot()});await poll(host);assert.equal(hostPackets.at(-1).command,'next');
  host.broadcast({type:'world',state:world.snapshot()});await poll(host);await poll(guest);assert.equal(guest.commands.length,0,'peer acknowledgement releases command');
  await poll(guest);host.broadcast({type:'world',state:world.snapshot()});await poll(host);assert.equal(hostPackets.at(-1).input.left,true);
  await guest.close();reconnect=make(guestPackets);await reconnect.connect('join','Peach',room.code);clearTimeout(reconnect.pollTimer);assert.equal(reconnect.seat,1);
  reconnect.broadcast({type:'input',input:{pull:true}});await poll(reconnect);host.broadcast({type:'world',state:world.snapshot()});await poll(host);assert.equal(hostPackets.at(-1).input.pull,true);assert.deepEqual(errors,[]);
 }finally{await host.close();await guest.close();await reconnect?.close();db.close();if(prior)Object.defineProperty(globalThis,'localStorage',prior);else delete globalThis.localStorage;}
});
test('stale room responses cannot roll a replayed lobby back into a playing exchange loop',()=>{
 const c=new HostedMultiplayer({}, {onRoom:()=>{},onPacket:()=>{},onError:()=>{},fetcher:()=>{}});c.accept({status:'playing',version:10,serverNow:10});c.packet={type:'world'};c.accept({status:'lobby',version:11,serverNow:11});c.accept({status:'playing',version:10,serverNow:12});assert.equal(c.roomStatus,'lobby');assert.equal(c.packet,null);
});
