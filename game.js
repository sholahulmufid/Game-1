import {World,EMPTY_INPUT,PHYSICS} from './physics.js';
import {Renderer} from './renderer.js';
export const KEYMAPS=[{KeyA:'left',KeyD:'right',KeyW:'jump',Space:'jump',KeyE:'interact',KeyF:'pull'},{ArrowLeft:'left',ArrowRight:'right',ArrowUp:'jump',ArrowDown:'interact',Enter:'interact',ShiftRight:'pull'}];
export class CanvasGame {
 constructor(canvas,{local=true,seat=0,snapshot=null,onEvent=()=>{},onFrame=()=>{},audio=null}={}){
  this.local=local;this.seat=seat;this.world=new World(snapshot);this.renderer=new Renderer(canvas);this.onEvent=onEvent;this.onFrame=onFrame;this.audio=audio;
  this.inputs=[{...EMPTY_INPUT},{...EMPTY_INPUT}];this.paused=false;this.connected=true;this.running=false;this.display=null;this.last=0;this.accumulator=0;
  this.keydown=event=>this.key(event,true);this.keyup=event=>this.key(event,false);this.blur=()=>this.clearInputs();
  document.addEventListener('keydown',this.keydown);document.addEventListener('keyup',this.keyup);window.addEventListener('blur',this.blur);
 }
 key(event,pressed){
  if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)||document.querySelector('dialog[open]'))return;
  const indexes=this.local?[0,1]:[this.seat];
  for(const index of indexes){const map=this.local?KEYMAPS[index]:{...KEYMAPS[0],...KEYMAPS[1]};const action=map[event.code];if(action){event.preventDefault();this.inputs[index][action]=pressed;}}
  if(/^Digit[1-4]$/.test(event.code)){event.preventDefault();this.inputs[this.seat].emote=pressed?Number(event.code.at(-1)):0;}
 }
 setVirtual(action,pressed,index=this.seat){if(action in EMPTY_INPUT)this.inputs[index][action]=pressed;}
 clearInputs(){this.inputs=[{...EMPTY_INPUT},{...EMPTY_INPUT}];}
 remoteInput(input){this.inputs[1]=sanitizeInput(input);}
 start(){if(this.running)return;this.running=true;this.raf=requestAnimationFrame(t=>this.frame(t));}
 frame(t){
  if(!this.running)return;const dt=this.last?Math.min((t-this.last)/1000,.08):1/60;this.last=t;
  if(!this.paused&&this.connected){
   if(this.local||this.seat===0){this.accumulator+=dt;while(this.accumulator>=1/60){for(let i=0;i<2;i++)this.world.setInput(i,this.inputs[i]);this.world.step();this.accumulator-=1/60;}}
   else this.predict(dt);
  }else this.accumulator=0;
  if(this.display){for(let i=0;i<2;i++){const target=this.world.s.players[i],p=this.display[i];p.x+=(target.x-p.x)*Math.min(1,dt*14);p.y+=(target.y-p.y)*Math.min(1,dt*14);Object.assign(p,{animation:target.animation,facing:target.facing,grounded:target.grounded,emote:target.emote,emoteUntil:target.emoteUntil});}}
  this.renderer.draw(this.world,this.local?null:this.seat,this.display);
  for(const event of this.world.events.splice(0)){this.onEvent(event,this.world.s);this.audio?.event(event.type);}
  this.onFrame(this.world.s,this.inputs,t);this.raf=requestAnimationFrame(next=>this.frame(next));
 }
 predict(dt){
  if(this.world.s.status!=='playing')return;
  const p=this.world.s.players[this.seat];this.world.integrate(p,this.inputs[this.seat],Math.min(dt,1/30),this.world.platforms());
  p.animation=this.inputs[this.seat].pull&&p.grounded?'pull':!p.grounded?(p.vy<0?'jump':'fall'):Math.abs(p.vx)>12?'run':'idle';
  const other=this.world.s.players[1-this.seat],d=Math.hypot(p.x-other.x,p.y-other.y);if(d>PHYSICS.rope){p.x=other.x+(p.x-other.x)/d*PHYSICS.rope;p.y=other.y+(p.y-other.y)/d*PHYSICS.rope;}
 }
 apply(snapshot){
  const old=this.world.s,changed=old.level!==snapshot.level||old.checkpoint!==snapshot.checkpoint||old.stats.restarts!==snapshot.stats.restarts;
  const mine={...old.players[this.seat]};this.world.restore(snapshot);
  if(!changed&&snapshot.status==='playing'&&Math.hypot(mine.x-snapshot.players[this.seat].x,mine.y-snapshot.players[this.seat].y)<70){const target=this.world.s.players[this.seat];target.x=mine.x+(target.x-mine.x)*.4;target.y=mine.y+(target.y-mine.y)*.4;}
  if(changed||!this.display){this.display=structuredClone(this.world.s.players);this.renderer.initial=true;}
 }
 destroy(){this.running=false;cancelAnimationFrame(this.raf);document.removeEventListener('keydown',this.keydown);document.removeEventListener('keyup',this.keyup);window.removeEventListener('blur',this.blur);}
}
export function sanitizeInput(input={}){return {left:input.left===true,right:input.right===true,jump:input.jump===true,interact:input.interact===true,pull:input.pull===true,emote:Number.isInteger(input.emote)&&input.emote>=0&&input.emote<=4?input.emote:0};}
