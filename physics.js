import {LEVELS,EMOTES} from './levels.js';
export const PHYSICS={gravity:1250,speed:225,jump:500,rope:260,bodyWidth:26,bodyHeight:36};
export const EMPTY_INPUT={left:false,right:false,jump:false,interact:false,pull:false,emote:0};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const box=p=>({x:p.x-13,y:p.y-18,w:26,h:36});
function body(id,spawn){return {id,...spawn,vx:0,vy:0,grounded:false,coyote:0,jumpBuffer:0,prevJump:false,prevInteract:false,prevEmote:0,facing:1,animation:'idle',hanging:false,emote:'',emoteUntil:0,invincible:0};}
function newMechanisms(level){return {plateHold:0,plates:!level.plates,core:!level.core,coreCarrier:null,corePos:level.core?{...level.core}:null,heavy:level.heavy?{...level.heavy,vx:0,vy:0,carried:false}:null,heavyDelivered:!level.heavy,switchMask:level.switches?0:3,laserUntil:0,door:!level.plates&&!level.core&&!level.heavy&&!level.switches};}
export class World {
 constructor(snapshot=null){
  this.events=[];this.inputs=[{...EMPTY_INPUT},{...EMPTY_INPUT}];
  this.s={level:0,status:'playing',clock:0,time:0,levelTime:0,collapseLeft:null,stats:{falls:[0,0],rescues:[0,0],restarts:0},checkpoint:0,revision:0};
  if(snapshot)this.restore(snapshot);else this.load(0);
 }
 get level(){return LEVELS[this.s.level];}
 notify(type,extra={}){this.events.push({type,...extra});}
 load(index){
  this.s.level=index;this.s.status='playing';this.s.levelTime=0;this.s.checkpoint=0;this.s.collapseLeft=LEVELS[index].collapse??null;
  this.s.players=LEVELS[index].spawn.map((p,i)=>body(i,p));this.s.mechanisms=newMechanisms(LEVELS[index]);
  this.s.checkpointState={positions:structuredClone(LEVELS[index].spawn),mechanisms:structuredClone(this.s.mechanisms)};
  this.s.revision++;this.notify('level');
 }
 restore(snapshot){this.s=structuredClone(snapshot);this.inputs=[{...EMPTY_INPUT},{...EMPTY_INPUT}];this.events=[];}
 snapshot(){return structuredClone(this.s);}
 persistence(){const s=this.snapshot();if(s.status==='playing'){s.players=s.checkpointState.positions.map((p,i)=>body(i,p));s.mechanisms=structuredClone(s.checkpointState.mechanisms);}return s;}
 platforms(){
  const l=this.level,m=this.s.mechanisms;
  return [...l.platforms,...(l.bridge&&m.core?[l.bridge]:[]),...(l.moving||[]).map(p=>({...p,[p.axis]:p[p.axis]+(Math.sin(this.s.levelTime*p.speed)*.5+.5)*p.range,moving:true})),...(!m.door?[{x:l.exit.x-9,y:l.exit.y,w:12,h:l.exit.h}]:[])];
 }
 restart(manual=false){
  const cp=this.s.checkpointState;
  this.s.players=cp.positions.map((p,i)=>({...body(i,p),invincible:1}));
  this.s.mechanisms=structuredClone(cp.mechanisms);this.s.status='playing';
  if(manual||this.s.collapseLeft<=0)this.s.collapseLeft=this.level.collapse??null;
  this.s.stats.restarts++;this.s.revision++;this.notify('restart');
 }
 next(){if(this.s.status!=='levelComplete')return;if(this.s.level===LEVELS.length-1){this.s.status='complete';this.notify('complete');}else this.load(this.s.level+1);}
 setInput(index,input){this.inputs[index]={...EMPTY_INPUT,...input};}
 collide(p,oldX,oldY,platforms){
  const w=13,h=18;p.grounded=false;
  // Axis-separable solid collisions; one-way moving platforms remain forgiving.
  for(const r of platforms){
   if(p.x+w>r.x&&p.x-w<r.x+r.w&&p.y+h>r.y&&p.y-h<r.y+r.h){
    if(oldY+h<=r.y+6&&p.vy>=0){p.y=r.y-h;p.vy=0;p.grounded=true;}
    else if(!r.moving&&oldY-h>=r.y+r.h-4&&p.vy<0){p.y=r.y+r.h+h;p.vy=0;}
    else if(!r.moving&&oldX+w<=r.x+4){p.x=r.x-w;p.vx=0;}
    else if(!r.moving&&oldX-w>=r.x+r.w-4){p.x=r.x+r.w+w;p.vx=0;}
    else if(p.y<r.y&&p.vy>=0){p.y=r.y-h;p.vy=0;p.grounded=true;}
   }
   if(Math.abs(p.y+h-r.y)<.6&&p.x+w>r.x&&p.x-w<r.x+r.w&&p.vy>=0){p.grounded=true;p.vy=0;}
  }
  p.x=clamp(p.x,13,this.level.width-13);
 }
 integrate(p,input,dt,platforms){
  const ox=p.x,oy=p.y,wasGrounded=p.grounded;
  p.coyote=wasGrounded?.11:Math.max(0,p.coyote-dt);
  if(input.jump&&!p.prevJump)p.jumpBuffer=.12;else p.jumpBuffer=Math.max(0,p.jumpBuffer-dt);
  const anchored=input.pull&&wasGrounded;
  const carrying=this.s.mechanisms.heavy?.carried;
  const target=((input.right?1:0)-(input.left?1:0))*(carrying?118:PHYSICS.speed)*(this.s.rope?.tension>.75?.88:1);
  p.vx=anchored?0:p.vx+(target-p.vx)*Math.min(1,dt*(wasGrounded?18:8));
  if(p.jumpBuffer>0&&p.coyote>0&&!anchored){p.vy=-PHYSICS.jump;p.jumpBuffer=0;p.coyote=0;p.grounded=false;this.notify('jump',{player:p.id});}
  p.vy=Math.min(850,p.vy+PHYSICS.gravity*dt);
  if(wasGrounded)for(const r of platforms.filter(r=>r.moving)){
   const original=this.level.moving.find(v=>v.y===r.y&&v.w===r.w);
   const delta=original?.axis==='x'?(Math.sin(this.s.levelTime*original.speed)-Math.sin((this.s.levelTime-dt)*original.speed))*.5*original.range:0;
   if(Math.abs(p.y+18-r.y)<1&&p.x+13>r.x-delta&&p.x-13<r.x-delta+r.w)p.x+=delta;
  }
  p.x+=p.vx*dt;this.collide(p,ox,oy,platforms);p.y+=p.vy*dt;this.collide(p,ox,oy,platforms);
  p.prevJump=Boolean(input.jump);if(Math.abs(p.vx)>10)p.facing=Math.sign(p.vx);
  p.invincible=Math.max(0,p.invincible-dt);
 }
 rope(dt,platforms){
  const [a,b]=this.s.players,inputs=this.inputs;
  let d=distance(a,b),dx=b.x-a.x,dy=b.y-a.y;
  const anchors=this.s.players.map((p,i)=>p.grounded&&inputs[i].pull);
  // Pull applies force before enforcing the hard maximum; tangent velocity is
  // retained so a suspended partner can swing around a grounded anchor.
  for(let i=0;i<2;i++)if(inputs[i].pull&&this.s.players[i].grounded&&d>55){
   const anchor=this.s.players[i],other=this.s.players[1-i],nx=(anchor.x-other.x)/d,ny=(anchor.y-other.y)/d;
   const support=platforms.find(r=>Math.abs(anchor.y+18-r.y)<2&&anchor.x>=r.x&&anchor.x<=r.x+r.w);
   // Holding Interact while descending pays out the rope until a core is caught.
   if(inputs[1-i].interact&&this.level.core&&!this.s.mechanisms.core&&this.s.mechanisms.coreCarrier===null)continue;
   if(support&&!other.grounded&&other.y>support.y-18){
    const edge=other.x>=anchor.x?support.x+support.w+17:support.x-17;
    other.vx+=(clamp((edge-other.x)*9,-180,180)-other.vx)*Math.min(1,dt*8);
    other.vy-=2200*dt;other.vy=Math.min(other.vy,-240);
   }else{other.vx+=nx*1250*dt;if(!other.grounded)other.vy+=ny*1950*dt;}
  }
  for(let iteration=0;iteration<6;iteration++){
   d=distance(a,b);if(d<=PHYSICS.rope+.01)break;dx=(b.x-a.x)/d;dy=(b.y-a.y)/d;
   const excess=d-PHYSICS.rope,wa=anchors[0]?0:anchors[1]?1:.5,wb=1-wa;
   const old=[{x:a.x,y:a.y},{x:b.x,y:b.y}];
   a.x+=dx*excess*wa;a.y+=dy*excess*wa;b.x-=dx*excess*wb;b.y-=dy*excess*wb;
   const speed=(b.vx-a.vx)*dx+(b.vy-a.vy)*dy;
   if(speed>0){a.vx+=dx*speed*wa;a.vy+=dy*speed*wa;b.vx-=dx*speed*wb;b.vy-=dy*speed*wb;}
   for(let i=0;i<2;i++)this.collide(this.s.players[i],old[i].x,old[i].y,platforms);
  }
  d=distance(a,b);const tension=clamp((d/PHYSICS.rope-.72)/.28,0,1);
  if(tension>.8&&(this.s.rope?.tension||0)<=.8&&this.s.clock-(this.lastTensionSound||0)>1){this.lastTensionSound=this.s.clock;this.notify('tension');}
  this.s.rope={length:d,tension};
  for(let i=0;i<2;i++){
   const p=this.s.players[i],other=this.s.players[1-i];
   if(!p.grounded&&p.y>other.y+80&&d>PHYSICS.rope*.9){if(!p.hanging){p.hanging=true;this.s.stats.falls[i]++;this.notify('hang',{player:i});}}
   if(p.hanging&&p.grounded){p.hanging=false;this.s.stats.rescues[1-i]++;this.notify('rescue',{player:1-i});}
  }
 }
 interactions(dt){
  const s=this.s,l=this.level,m=s.mechanisms,ps=s.players;
  if(l.plates&&!m.plates){
   const occupied=l.plates.map(plate=>ps.findIndex(p=>p.grounded&&p.x>=plate.x-5&&p.x<=plate.x+plate.w+5&&Math.abs(p.y+18-plate.y)<8));
   if(occupied.every(i=>i>=0)&&occupied[0]!==occupied[1])m.plateHold+=dt;else m.plateHold=Math.max(0,m.plateHold-dt*2);
   if(m.plateHold>=1){m.plates=true;s.revision++;this.notify('plates');}
  }
  if(l.core&&!m.core){
   if(m.coreCarrier===null){for(let i=0;i<2;i++)if(this.inputs[i].interact&&distance(ps[i],m.corePos)<47){m.coreCarrier=i;this.notify('pickup');break;}}
   else{
    const p=ps[m.coreCarrier];m.corePos={x:p.x,y:p.y-35};
    if(this.inputs[m.coreCarrier].interact&&distance(p,l.socket)<60){m.core=true;m.coreCarrier=null;s.revision++;this.notify('core');}
   }
  }
  if(l.heavy&&!m.heavyDelivered){
   const cell=m.heavy,near=ps.map(p=>Math.abs(p.x-cell.x)<94&&Math.abs(p.y-cell.y)<60);
   const opposite=(ps[0].x-cell.x)*(ps[1].x-cell.x)<0;
   cell.carried=near.every(Boolean)&&opposite&&this.inputs.every(i=>i.interact)&&ps.every(p=>p.grounded);
   if(cell.carried){cell.x=(ps[0].x+ps[1].x)/2;cell.y=(ps[0].y+ps[1].y)/2;cell.vy=0;cell.vx=(ps[0].vx+ps[1].vx)/2;}
   else{cell.vx*=Math.max(0,1-dt*6);cell.vy+=PHYSICS.gravity*dt;cell.x+=cell.vx*dt;const oldY=cell.y;cell.y+=cell.vy*dt;for(const r of this.platforms())if(cell.x+23>r.x&&cell.x-23<r.x+r.w&&oldY+19<=r.y+4&&cell.y+19>=r.y){cell.y=r.y-19;cell.vy=0;}}
   if(cell.carried&&distance(cell,l.generator)<48){m.heavyDelivered=true;cell.carried=false;s.revision++;this.notify('heavy');}
  }
  for(let i=0;i<2;i++){
   const p=ps[i],input=this.inputs[i];
   if(input.interact&&!p.prevInteract)for(let n=0;n<(l.switches||[]).length;n++){
    const sw=l.switches[n];if(sw.owner===(i===0?'a':'b')&&distance(p,sw)<48){m.laserUntil=s.clock+4;m.switchMask|=1<<n;s.revision++;this.notify('switch');}
   }
   if(input.emote&&input.emote!==p.prevEmote){p.emote=EMOTES[input.emote]||'';p.emoteUntil=s.clock+2;this.notify('emote');}
   p.prevInteract=Boolean(input.interact);p.prevEmote=input.emote;
   p.animation=m.heavy?.carried?'carry':input.pull&&p.grounded?'pull':!p.grounded?(p.vy<0?'jump':'fall'):Math.abs(p.vx)>12?'run':'idle';
  }
  const open=m.plates&&m.core&&m.heavyDelivered&&m.switchMask===3;
  if(open&&!m.door){m.door=true;s.revision++;this.notify('door');}
 }
 checkCheckpoint(){
  const s=this.s,m=s.mechanisms;
  for(let i=s.checkpoint;i<(this.level.checkpoints||[]).length;i++){
   const cp=this.level.checkpoints[i];
   const fulfilled=!cp.requires||cp.requires==='plates'&&m.plates||cp.requires==='core'&&m.core||cp.requires==='heavy'&&m.heavyDelivered||cp.requires==='switches'&&m.switchMask===3;
   if(fulfilled&&s.players.every(p=>p.grounded&&Math.abs(p.x-cp.x)<105&&Math.abs(p.y-cp.y)<45)){
    s.checkpoint=i+1;s.checkpointState={positions:[{x:cp.x-32,y:cp.y},{x:cp.x+32,y:cp.y}],mechanisms:structuredClone(m)};s.revision++;this.notify('checkpoint');
   }
  }
 }
 step(dt=1/60){
  if(this.s.status!=='playing')return;dt=clamp(dt,.001,1/30);const s=this.s;
  s.clock+=dt;s.time+=dt;s.levelTime+=dt;if(s.collapseLeft!==null){s.collapseLeft-=dt;if(s.collapseLeft<=0){s.status='failed';s.revision++;this.notify('collapse');return;}}
  const platforms=this.platforms();
  for(let i=0;i<2;i++)this.integrate(s.players[i],this.inputs[i],dt,platforms);
  this.rope(dt,platforms);this.interactions(dt);this.checkCheckpoint();
  let hit=false;
  for(let i=0;i<2;i++){
   const p=s.players[i],spikes=(this.level.spikes||[]).some(r=>overlaps(box(p),r));
   const laser=(this.level.lasers||[]).some(r=>overlaps(box(p),r))&&s.clock>s.mechanisms.laserUntil;
   if(p.y>this.level.height+40||p.invincible<=0&&(spikes||laser)){s.stats.falls[i]++;hit=true;}
  }
  if(hit){this.restart();return;}
  const exit=this.level.exit;
  if(s.mechanisms.door&&s.players.every(p=>p.x>=exit.x-7&&p.x<=exit.x+exit.w+7&&p.y+18>=exit.y&&p.y-18<=exit.y+exit.h)){
   s.status=s.level===LEVELS.length-1?'complete':'levelComplete';s.revision++;this.notify(s.status==='complete'?'complete':'mission');
  }
 }
}
export function rating(s){const falls=s.stats.falls.reduce((a,b)=>a+b,0),rescues=s.stats.rescues.reduce((a,b)=>a+b,0);if(falls<4&&s.stats.restarts<3)return 'Perfectly Connected';if(rescues>=4)return 'Never Let Go';if(falls>15)return 'Gravity’s Worst Enemy';return 'Chaotic Duo';}
