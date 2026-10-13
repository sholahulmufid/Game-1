import test from 'node:test';
import assert from 'node:assert/strict';
import {Multiplayer,validSnapshot} from '../multiplayer.js';
import {World} from '../physics.js';
test('broadcast validates inputs, ignores stale packets and accepts a reconnected peer',()=>{
 const packets=[],host=new Multiplayer({}, {onRoom:()=>{},onPacket:p=>packets.push(p),onError:()=>{}});host.seat=0;
 const packet={type:'input',from:'b',epoch:'first',sequence:10,input:{right:true,left:'yes',emote:99}};host.receive(packet);
 assert.equal(packets.length,1);assert.equal(packets[0].input.right,true);assert.equal(packets[0].input.left,false);assert.equal(packets[0].input.emote,0);
 host.receive({...packet,sequence:9});host.receive({...packet,from:'a',sequence:11});assert.equal(packets.length,1);
 host.receive({...packet,epoch:'reconnected',sequence:1});assert.equal(packets.length,2);
 host.receive({...packet,sequence:12});assert.equal(packets.length,2,'old connection must stay retired');
});
test('host snapshots synchronize world objects, checkpoints and final result',()=>{
 const host=new World(),guest=new World(),packets=[],peer=new Multiplayer({}, {onRoom:()=>{},onPacket:p=>{packets.push(p);guest.restore(p.state);},onError:()=>{}});peer.seat=1;
 host.load(4);host.s.mechanisms.heavy.carried=true;host.s.checkpoint=1;
 peer.receive({type:'world',from:'a',epoch:'host',sequence:1,state:host.snapshot()});assert.equal(guest.s.mechanisms.heavy.carried,true);assert.equal(guest.s.checkpoint,1);
 host.load(6);host.s.status='complete';peer.receive({type:'world',from:'a',epoch:'host',sequence:2,state:host.snapshot()});assert.equal(guest.s.status,'complete');
 peer.receive({type:'world',from:'a',epoch:'host',sequence:3,state:{level:9}});assert.equal(packets.length,2);assert.equal(validSnapshot({players:[]}),false);
});
test('connection creates the channel, starts heartbeat and cleanly leaves',async()=>{
 const storage=new Map(),prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{value:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},configurable:true});
 const calls=[],sent=[],rooms=[];
 const response={code:'CN1234',me:'a',channel:'channel-id',eventId:'event-id',version:1,serverNow:1,players:[],status:'lobby'};
 const channel={on(){return this;},subscribe(callback){callback('SUBSCRIBED');},send(packet){sent.push(packet);return Promise.resolve('ok');}};
 const client={rpc:async(name,args)=>{calls.push(args.p_action);return {data:response,error:null};},channel:()=>channel,removeChannel:async()=>calls.push('remove-channel')};
 const connection=new Multiplayer({}, {clientFactory:()=>client,onRoom:r=>rooms.push(r),onPacket:()=>{},onError:()=>{}});
 try{await connection.connect('create','Alice','');assert.equal(connection.ready,true);assert.equal(connection.seat,0);connection.broadcast({type:'world',state:new World().snapshot()});assert.equal(sent[0].payload.from,'a');assert.ok(sent[0].payload.epoch);assert.deepEqual(calls.slice(0,2),['create','heartbeat']);await connection.close();assert.equal(connection.ready,false);assert.ok(calls.includes('leave'));assert.ok(calls.includes('remove-channel'));assert.ok(rooms.length>0);}
 finally{await connection.close();if(prior)Object.defineProperty(globalThis,'localStorage',prior);else delete globalThis.localStorage;}
});
test('cancelling during room creation does not open a late channel or lobby',async()=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>null,setItem:()=>{}},configurable:true});
 let release,channels=0,roomCallbacks=0;
 const client={rpc:async(name,args)=>args.p_action==='create'?await new Promise(resolve=>release=()=>resolve({data:{code:'CN1234',me:'a'},error:null})):{data:{},error:null},channel:()=>{channels++;}};
 const connection=new Multiplayer({}, {clientFactory:()=>client,onRoom:()=>roomCallbacks++,onPacket:()=>{},onError:()=>{}});
 try{const connecting=connection.connect('create','Alice','');await connection.close();release();await assert.rejects(connecting,/CONNECTION_CANCELLED/);assert.equal(channels,0);assert.equal(roomCallbacks,0);}
 finally{if(prior)Object.defineProperty(globalThis,'localStorage',prior);else delete globalThis.localStorage;}
});
