import {Multiplayer} from './multiplayer.js';

// Same room interface as the Supabase adapter. The hosted version uses a
// credential-free, same-origin endpoint and keeps only one exchange in flight.
export class HostedMultiplayer extends Multiplayer {
 constructor(config,options){super(config,options);this.endpoint=config.roomEndpoint||'/api/room';this.fetcher=options.fetcher||fetch;this.commands=[];this.packet=null;this.roomStatus='lobby';this.errorAt=0;}
 async rpc(action,payload=null,packet=null){
  const response=await this.fetcher(this.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,code:this.code||'',nickname:this.nickname,token:this.token,payload,packet}),signal:AbortSignal.timeout(7000),cache:'no-store'});
  let data;try{data=await response.json();}catch{throw new Error('ONLINE_UNAVAILABLE');}
  if(!response.ok||data.error)throw new Error(data.error||'ONLINE_UNAVAILABLE');return data;
 }
 async connect(mode,nickname,code){
  this.nickname=nickname;this.code=code;this.token=localStorage.getItem(`cn-token:${code}:${nickname.toLowerCase()}`)||crypto.randomUUID();
  const room=await this.rpc(mode);this.code=room.code;this.seat=room.me==='a'?0:1;
  if(this.closed){try{await this.rpc('leave');}catch{}throw new Error('CONNECTION_CANCELLED');}
  localStorage.setItem(`cn-token:${room.code}:${nickname.toLowerCase()}`,this.token);localStorage.setItem('cn-last-room',JSON.stringify({code:room.code,nickname}));
  this.ready=true;this.accept(room);this.pollTimer=setTimeout(()=>this.poll(),30);return room;
 }
 accept(room){if(this.closed||room.version<this.version||(room.version===this.version&&room.serverNow<(this.serverNow||0)))return;if(room.status==='lobby'&&this.roomStatus!=='lobby'){this.packet=null;this.commands=[];}this.roomStatus=room.status;super.accept(room);}
 broadcast(value){if(this.closed)return;const packet={...value,epoch:this.epoch,sequence:++this.sequence};if(value.type==='command'){this.commands.push(packet);if(this.commands.length>8)this.commands.shift();}else this.packet=packet;}
 async poll(){
  if(this.closed||this.polling)return;this.polling=true;
  const command=this.commands[0],latest=command||this.packet;
  const packet=latest?{...latest,...(this.remoteEpoch?{ack:{epoch:this.remoteEpoch,sequence:this.latestRemote}}:{})}:null;
  try{
   const room=await this.rpc(this.roomStatus==='lobby'||!packet?'heartbeat':'exchange',null,packet);if(this.closed)return;this.ready=true;this.accept(room);
   if(room.peerPacket){this.receive(room.peerPacket);const ack=room.peerPacket.ack;if(command&&this.commands[0]===command&&ack?.epoch===this.epoch&&ack.sequence>=command.sequence)this.commands.shift();}
  }catch(error){
   this.ready=false;if(!this.closed&&performance.now()-this.errorAt>7000){this.errorAt=performance.now();this.onError(error);}
  }finally{this.polling=false;if(!this.closed)this.pollTimer=setTimeout(()=>this.poll(),this.roomStatus==='lobby'?650:80);}
 }
 async close(){this.closed=true;this.ready=false;clearTimeout(this.pollTimer);if(this.token&&this.code){try{await this.rpc('leave');}catch{}}}
}
