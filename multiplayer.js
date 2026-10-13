import {sanitizeInput} from './game.js';
export class Multiplayer {
 constructor(config,{onRoom,onPacket,onError,clientFactory=null}){this.config=config;this.onRoom=onRoom;this.onPacket=onPacket;this.onError=onError;this.clientFactory=clientFactory;this.closed=false;this.ready=false;this.version=-1;this.sequence=0;this.latestRemote=-1;this.epoch=crypto.randomUUID();this.remoteEpoch=null;this.retiredEpochs=new Set();}
 async connect(mode,nickname,code){
  const createClient=this.clientFactory||(await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm')).createClient;
  if(this.closed)throw new Error('CONNECTION_CANCELLED');
  this.client=createClient(this.config.supabaseUrl,this.config.supabaseKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  this.nickname=nickname;this.code=code;this.token=localStorage.getItem(`cn-token:${code}:${nickname.toLowerCase()}`)||crypto.randomUUID();
  const room=await this.rpc(mode);this.code=room.code;this.seat=room.me==='a'?0:1;
  if(this.closed){try{await this.rpc('leave');}catch{}throw new Error('CONNECTION_CANCELLED');}
  localStorage.setItem(`cn-token:${room.code}:${nickname.toLowerCase()}`,this.token);localStorage.setItem('cn-last-room',JSON.stringify({code:room.code,nickname}));
  this.channel=this.client.channel(`connected:${room.channel}`,{config:{broadcast:{self:false,ack:false}}})
   .on('broadcast',{event:'frame'},({payload})=>this.receive(payload))
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'cn_room_events',filter:`id=eq.${room.eventId}`},()=>this.refresh());
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('REALTIME_TIMEOUT')),12000);
   this.channel.subscribe(status=>{
    if(status==='SUBSCRIBED'){clearTimeout(timer);this.ready=true;resolve();}
    if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){this.ready=false;this.onError(new Error('REALTIME_TIMEOUT'));}
   });
  });
  if(this.closed){await this.client.removeChannel(this.channel);throw new Error('CONNECTION_CANCELLED');}
  this.accept(room);this.heartbeat=setInterval(()=>this.refresh(),4000);await this.refresh();return room;
 }
 async rpc(action,payload=null){const {data,error}=await this.client.rpc('cn_command',{p_code:this.code||'',p_nickname:this.nickname,p_token:this.token,p_action:action,p_payload:payload});if(error)throw new Error(error.message);return data;}
 receive(payload){
  if(this.closed||!payload||payload.from!==(this.seat===0?'b':'a')||typeof payload.epoch!=='string'||!Number.isSafeInteger(payload.sequence)||this.retiredEpochs.has(payload.epoch))return;
  if(payload.epoch!==this.remoteEpoch){if(this.remoteEpoch)this.retiredEpochs.add(this.remoteEpoch);this.remoteEpoch=payload.epoch;this.latestRemote=-1;}
  if(payload.sequence<=this.latestRemote)return;this.latestRemote=payload.sequence;
  if(payload.type==='input'&&this.seat===0)this.onPacket({...payload,input:sanitizeInput(payload.input)});
  if(payload.type==='world'&&this.seat===1&&validSnapshot(payload.state))this.onPacket(payload);
  if(payload.type==='command'&&this.seat===0&&['restart','next'].includes(payload.command))this.onPacket(payload);
 }
 accept(room){if(this.closed||room.version<this.version||(room.version===this.version&&room.serverNow<(this.serverNow||0)))return;this.version=room.version;this.serverNow=room.serverNow;this.onRoom(room);}
 async refresh(){if(this.closed||this.refreshing)return;this.refreshing=true;try{this.accept(await this.rpc('heartbeat'));}catch(error){if(!this.closed)this.onError(error);}finally{this.refreshing=false;}}
 async action(action,payload){this.accept(await this.rpc(action,payload));}
 broadcast(packet){if(!this.ready||this.closed)return;this.channel.send({type:'broadcast',event:'frame',payload:{...packet,from:this.seat===0?'a':'b',epoch:this.epoch,sequence:++this.sequence}}).catch(()=>this.onError(new Error('REALTIME_TIMEOUT')));}
 async save(snapshot){if(this.saving||this.closed||this.seat!==0)return;this.saving=true;try{await this.action('save',snapshot);}catch(error){this.onError(error);}finally{this.saving=false;}}
 async close(){this.closed=true;this.ready=false;clearInterval(this.heartbeat);if(this.client){try{await this.rpc('leave');}catch{}if(this.channel)await this.client.removeChannel(this.channel);}}
}
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<10000&&Math.abs(p.y)<10000;
const pair=v=>Array.isArray(v)&&v.length===2;
const mechanism=m=>m&&['plates','core','heavyDelivered','door'].every(k=>typeof m[k]==='boolean')&&Number.isFinite(m.plateHold)&&Number.isFinite(m.laserUntil)&&Number.isInteger(m.switchMask)&&m.switchMask>=0&&m.switchMask<=3&&(m.coreCarrier===null||m.coreCarrier===0||m.coreCarrier===1)&&(m.corePos===null||point(m.corePos))&&(m.heavy===null||point(m.heavy)&&Number.isFinite(m.heavy.vx)&&Number.isFinite(m.heavy.vy)&&typeof m.heavy.carried==='boolean');
export function validSnapshot(s){return Boolean(s&&Number.isInteger(s.level)&&s.level>=0&&s.level<=6&&['playing','levelComplete','complete','failed'].includes(s.status)&&['clock','time','levelTime','revision','checkpoint'].every(k=>Number.isFinite(s[k])&&s[k]>=0)&&(s.collapseLeft===null||Number.isFinite(s.collapseLeft))&&pair(s.players)&&s.players.every(p=>point(p)&&['vx','vy','coyote','jumpBuffer','invincible'].every(k=>Number.isFinite(p[k]))&&typeof p.grounded==='boolean')&&s.stats&&['falls','rescues'].every(k=>pair(s.stats[k])&&s.stats[k].every(v=>Number.isInteger(v)&&v>=0))&&Number.isInteger(s.stats.restarts)&&s.stats.restarts>=0&&mechanism(s.mechanisms)&&s.checkpointState&&pair(s.checkpointState.positions)&&s.checkpointState.positions.every(point)&&mechanism(s.checkpointState.mechanisms));}
