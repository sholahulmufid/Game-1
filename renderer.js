import {CHARACTERS,LEVELS} from './levels.js';
import {PHYSICS} from './physics.js';
const lerp=(a,b,t)=>a+(b-a)*t;
const P={ink:'#695378',muted:'#89708f',cream:'#fff8ef',rose:'#ef9cbb',lilac:'#c5b5e7',mint:'#b6e1cf',sky:'#acdceb',danger:'#f07183'};
function rect(ctx,x,y,w,h,color,r=0){ctx.fillStyle=color;if(r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}else ctx.fillRect(x,y,w,h);}
function text(ctx,str,x,y,size=12,color=P.ink,align='center'){ctx.font=`700 ${size}px "Nunito","Arial Rounded MT Bold",sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(str,x,y);}
function circle(ctx,x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
function heart(ctx,x,y,size,color){ctx.save();ctx.translate(x,y);ctx.scale(size/20,size/20);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,9);ctx.bezierCurveTo(-3,5,-12,0,-9,-6);ctx.bezierCurveTo(-7,-11,-2,-10,0,-6);ctx.bezierCurveTo(2,-10,7,-11,9,-6);ctx.bezierCurveTo(12,0,3,5,0,9);ctx.fill();ctx.restore();}
function star(ctx,x,y,size,color){ctx.fillStyle=color;ctx.beginPath();for(let i=0;i<10;i++){const angle=-Math.PI/2+i*Math.PI/5,r=i%2?size*.43:size;const px=x+Math.cos(angle)*r,py=y+Math.sin(angle)*r;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.closePath();ctx.fill();}
function cloud(ctx,x,y,size,color){rect(ctx,x-size*.7,y,size*1.4,size*.35,color,size*.15);circle(ctx,x-size*.36,y,size*.25,color);circle(ctx,x,y-size*.1,size*.35,color);circle(ctx,x+size*.4,y+size*.02,size*.23,color);}
export class Renderer {
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.camera={x:0,y:0,scale:1};this.initial=true;}
 resize(){const bounds=this.canvas.getBoundingClientRect(),w=bounds.width||1100,h=bounds.height||600,dpr=Math.min(globalThis.devicePixelRatio||1,2);if(this.canvas.width!==Math.floor(w*dpr)||this.canvas.height!==Math.floor(h*dpr)){this.canvas.width=Math.floor(w*dpr);this.canvas.height=Math.floor(h*dpr);}return {w,h,dpr};}
 draw(world,focus=null,visualPlayers=null){
  const {w,h,dpr}=this.resize(),ctx=this.ctx;if(!ctx)return;
  const s=world.s,l=LEVELS[s.level],ps=visualPlayers||s.players,c=this.camera;
  const ratio=Math.min(w/(w<700?680:950),h/565),apart=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y),scale=ratio*(apart>220?.93:1);
  const target=focus===null?{x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2}:ps[focus];
  const tx=Math.max(0,Math.min(l.width-w/scale,target.x-w/scale*.45)),ty=Math.max(0,Math.min(l.height-h/scale,target.y-h/scale*.57));
  c.scale=this.initial?scale:lerp(c.scale,scale,.08);c.x=this.initial?tx:lerp(c.x,tx,.09);c.y=this.initial?ty:lerp(c.y,ty,.08);this.initial=false;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#faf0f5');gradient.addColorStop(.55,'#f6f0fd');gradient.addColorStop(1,'#ffefe7');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  // Soft laboratory windows, clouds, and little stars sit behind the playable world.
  for(let i=0;i<8;i++){
   const x=i*255*c.scale-c.x*c.scale*.32,y=88*c.scale-c.y*c.scale*.12;
   rect(ctx,x+20,y,174*c.scale,214*c.scale,'#e9dcef',30*c.scale);rect(ctx,x+24,y+4,166*c.scale,206*c.scale,'#fff9fc',27*c.scale);
   rect(ctx,x+35,y+15,144*c.scale,178*c.scale,i%2?'#edf6f5':'#f1eafb',22*c.scale);
   cloud(ctx,x+95*c.scale,y+125*c.scale,49*c.scale,'#ffffffb0');star(ctx,x+142*c.scale,y+55*c.scale,8*c.scale,'#decbed');
   rect(ctx,x+15,y+218*c.scale,184*c.scale,10*c.scale,'#e7d7e9',5*c.scale);
  }
  for(let i=0;i<17;i++){const x=(i*137+55-c.x*c.scale*.18)%Math.max(w+100,1),y=(i*73+34)%Math.max(h*.8,1);star(ctx,x,y,i%3===0?4:2.5,i%2?'#d5bfe480':'#efc3d380');}
  ctx.save();ctx.translate(-c.x*c.scale,-c.y*c.scale);ctx.scale(c.scale,c.scale);
  rect(ctx,38,125,197,34,'#fffaf7c9',17);star(ctx,55,142,6,P.rose);text(ctx,`CONNECTION LAB  ·  ${String(s.level+1).padStart(2,'0')}`,70,147,11,P.muted,'left');
  for(const r of world.platforms()){
   rect(ctx,r.x,r.y,r.w,r.h,P.ink,6);rect(ctx,r.x+1,r.y+3,Math.max(0,r.w-2),Math.max(0,r.h-3),r.moving?'#d0bdea':'#d1c3de',5);
   rect(ctx,r.x,r.y,r.w,8,r.moving?'#f9d2e1':'#c0e5d6',4);rect(ctx,r.x+2,r.y+1,Math.max(0,r.w-4),2,'#fffdfa',1);
   for(let x=r.x+16;x<r.x+r.w-10;x+=42){circle(ctx,x,r.y+18,2.2,'#a693bc');}
   if(r.h>35){rect(ctx,r.x+6,r.y+31,Math.max(0,r.w-12),Math.max(0,r.h-38),'#e4d8eac0',5);for(let x=r.x+26;x<r.x+r.w-15;x+=84){star(ctx,x,r.y+54,4,'#c1aecf');}}
   if(r.moving){text(ctx,'↔',r.x+r.w/2,r.y+23,14,'#86669d');}
  }
  const m=s.mechanisms;
  if(l.plates)l.plates.forEach((p,i)=>{const occupied=ps.some(b=>Math.abs(b.y+18-p.y)<10&&b.x>=p.x-5&&b.x<=p.x+p.w+5);rect(ctx,p.x-2,p.y-8,p.w+4,9,P.ink,4);rect(ctx,p.x,p.y-7,p.w,6,m.plates?'#78caaa':occupied?'#f2c56f':'#d0afe4',3);heart(ctx,p.x+p.w/2,p.y+25,10,m.plates?'#69b997':'#ae91c3');text(ctx,`SIGNAL ${i+1}`,p.x+p.w/2,p.y+45,10,P.ink);});
  if(l.socket)this.device(l.socket.x,l.socket.y,m.core?'#81c7a5':'#cfb0e3','CORE SOCKET');
  if(m.corePos&&!m.core)this.core(m.corePos.x,m.corePos.y,P.rose,s.clock);
  if(l.heavy){const cell=m.heavy;rect(ctx,cell.x-25,cell.y-20,50,40,P.ink,10);rect(ctx,cell.x-23,cell.y-18,46,36,m.heavyDelivered?'#b6e1cf':'#edcee1',8);rect(ctx,cell.x-18,cell.y-13,36,24,'#fff8f7',6);heart(ctx,cell.x,cell.y,18,m.heavyDelivered?'#77bd9e':'#d991b3');rect(ctx,cell.x-29,cell.y-7,7,14,'#b4a0c7',3);rect(ctx,cell.x+22,cell.y-7,7,14,'#b4a0c7',3);text(ctx,'HEAVY CORE',cell.x,cell.y-32,10,P.ink);if(cell.carried){ctx.strokeStyle='#a68abf';ctx.lineWidth=3;for(const p of ps){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(cell.x,cell.y);ctx.stroke();}}}
  if(l.generator)this.device(l.generator.x,l.generator.y,m.heavyDelivered?'#81c7a5':'#cfb0e3','GENERATOR');
  (l.switches||[]).forEach((sw,i)=>{const active=Boolean(m.switchMask&(1<<i));this.device(sw.x,sw.y,active?'#81c7a5':CHARACTERS[sw.owner==='a'?0:1].color,`${sw.owner==='a'?'NOVA':'ECHO'} SWITCH`);});
  const lasersActive=s.clock>m.laserUntil;
  (l.lasers||[]).forEach(r=>{rect(ctx,r.x-8,r.y-5,26,10,'#a96c8d',4);rect(ctx,r.x-8,r.y+r.h-5,26,10,'#a96c8d',4);if(lasersActive){ctx.shadowBlur=14;ctx.shadowColor=P.danger;rect(ctx,r.x,r.y,r.w,r.h,P.danger,2);rect(ctx,r.x+3,r.y,3,r.h,'#fff5f7');ctx.shadowBlur=0;star(ctx,r.x+5,r.y-17,6,'#d55570');}else{rect(ctx,r.x+4,r.y,2,r.h,'#b987a02e');text(ctx,`${Math.max(0,m.laserUntil-s.clock).toFixed(1)}s`,r.x+5,r.y-21,12,'#489376');}});
  (l.spikes||[]).forEach(r=>{ctx.fillStyle='#ee7e92';ctx.strokeStyle='#bd5672';ctx.lineWidth=1.5;ctx.beginPath();for(let x=r.x;x<r.x+r.w;x+=18){ctx.moveTo(x,r.y+r.h);ctx.lineTo(x+9,r.y);ctx.lineTo(x+18,r.y+r.h);}ctx.fill();ctx.stroke();});
  (l.checkpoints||[]).forEach((p,i)=>{const active=s.checkpoint>i;rect(ctx,p.x-2,p.y-66,4,67,'#a487b9',2);rect(ctx,p.x+2,p.y-65,34,24,active?'#b2dfc9':'#efdae9',7);heart(ctx,p.x+18,p.y-52,12,active?'#559f7d':'#c998b7');text(ctx,active?'SAVED':'CHECKPOINT',p.x+17,p.y-76,9,active?'#548c74':P.muted);circle(ctx,p.x,p.y-66,4,'#d5bbdf');});
  const e=l.exit;rect(ctx,e.x-6,e.y-6,e.w+12,e.h+7,'#a98ac4',18);rect(ctx,e.x-3,e.y-3,e.w+6,e.h+3,'#fff7fb',15);rect(ctx,e.x,e.y,e.w,e.h,m.door?'#c5e9dc':'#e4d8ed',12);rect(ctx,e.x+8,e.y+7,e.w-16,e.h-12,m.door?'#e9fcf4':'#f4ecf8',9);
  if(m.door){ctx.shadowColor='#d5f3d8';ctx.shadowBlur=13;heart(ctx,e.x+e.w/2,e.y+e.h*.38,26,'#93c6b0');ctx.shadowBlur=0;star(ctx,e.x+15,e.y+22,5,'#e4b4cf');star(ctx,e.x+e.w-14,e.y+55,5,'#b3a3d4');text(ctx,'→',e.x+e.w/2,e.y+e.h*.78,22,'#619e87');}else{rect(ctx,e.x+e.w/2-9,e.y+e.h*.38,18,17,'#b59bc8',5);ctx.strokeStyle='#b59bc8';ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x+e.w/2,e.y+e.h*.38,6,Math.PI,0);ctx.stroke();}
  text(ctx,m.door?'EXIT TOGETHER':'LOCKED',e.x+e.w/2,e.y-19,11,m.door?'#588f77':'#9174a8');
  const a=ps[0],b=ps[1],d=Math.hypot(a.x-b.x,a.y-b.y),ta=Math.min(1,Math.max(0,(d/PHYSICS.rope-.72)/.28)),slack=Math.max(0,PHYSICS.rope-d)*.24;
  const ropePath=()=>{ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2+slack,b.x,b.y);};
  ctx.lineWidth=4.5;ctx.strokeStyle=ta>.8?'#d59c7b':'#aa8bc0';ropePath();ctx.stroke();ctx.lineWidth=2.5;ctx.strokeStyle=ta>.8?'#ffddb3':'#efd9fa';ropePath();ctx.stroke();
  for(let i=1;i<8;i++){const t=i/8,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t+2*t*(1-t)*slack;circle(ctx,x,y,2.5,i%2?'#fff9f3':'#f0b8d2');}
  const midX=(a.x+b.x)/2,midY=(a.y+b.y)/2+slack*.5;heart(ctx,midX,midY+Math.sin(s.clock*2)*1.5,10,ta>.8?'#e99a75':'#d49ac0');
  ps.forEach((p,i)=>this.robot(p,i,s.clock));
  ctx.restore();
  if(ps.some(p=>p.hanging)){rect(ctx,w/2-160,h-43,320,29,'#fffaf1eb',14);text(ctx,'HOLD PULL TO HELP YOUR PARTNER',w/2,h-24,11,'#9b6f66');}
 }
 device(x,y,color,label){const ctx=this.ctx;rect(ctx,x-19,y-14,38,32,'#aa8fbd',9);rect(ctx,x-17,y-12,34,28,'#fff6f7',7);rect(ctx,x-11,y-7,22,17,color,5);heart(ctx,x,y+1,10,'#fff9fb');circle(ctx,x+13,y-8,2,'#d1b6d8');text(ctx,label,x,y+40,9,P.ink);}
 core(x,y,color,time){const ctx=this.ctx;ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(time*2)*.09);circle(ctx,0,0,17,'#fff9f4b0');heart(ctx,0,0,27,'#aa718f');heart(ctx,0,-1,23,color);heart(ctx,-3,-3,6,'#fff6fa');star(ctx,20,-13,4,'#dbc39b');star(ctx,-19,10,3,'#cf9fbd');ctx.restore();text(ctx,'POWER CORE',x,y-29,10,'#a16c89');}
 robot(p,index,time){
  const ctx=this.ctx,color=CHARACTERS[index].color,outline=index?'#9d6182':'#607f96',walk=p.animation==='run'?Math.sin(time*13)*5:0,bob=p.grounded?Math.sin(time*3)*1.1:0,air=p.animation==='jump'||p.animation==='fall';
  ctx.save();ctx.translate(p.x,p.y+bob);ctx.scale(p.facing||1,1);
  // Small rounded boots and a heart-powered suit keep each movement readable.
  rect(ctx,-10,9+walk*.3,8,10,outline,4);rect(ctx,2,9-walk*.3,8,10,outline,4);rect(ctx,-9,10+walk*.3,6,7,color,3);rect(ctx,3,10-walk*.3,6,7,color,3);
  rect(ctx,-12,-8,24,22,outline,8);rect(ctx,-10,-7,20,19,color,7);rect(ctx,-6,-3,12,11,'#fff8fb',5);heart(ctx,0,2,7,index?'#e3a2c0':'#8cb6c9');
  const armY=p.animation==='pull'?-10:p.animation==='carry'?-4:air?-6:-2;
  const armSwing=p.animation==='pull'?0:p.animation==='carry'?0:walk*.55;
  rect(ctx,-17,armY+armSwing,6,p.animation==='pull'?9:12,outline,3);rect(ctx,11,armY-armSwing,6,p.animation==='pull'?9:12,outline,3);
  circle(ctx,-14,armY+armSwing+8,3.5,color);circle(ctx,14,armY-armSwing+8,3.5,color);
  rect(ctx,-14,-23,28,21,outline,9);rect(ctx,-12,-22,24,19,'#fffaf9',8);rect(ctx,-10,-19,20,13,index?'#ffe6ef':'#e3f5fa',6);
  if(index){
   // Echo wears a tiny bow; Nova has a little star antenna.
   ctx.fillStyle='#dc92b4';ctx.beginPath();ctx.moveTo(5,-24);ctx.lineTo(0,-29);ctx.lineTo(0,-21);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(5,-24);ctx.lineTo(10,-29);ctx.lineTo(10,-21);ctx.closePath();ctx.fill();circle(ctx,5,-24,2.4,'#f2bbd3');
  }else{rect(ctx,-1,-29,2,7,outline,1);star(ctx,0,-30,4.6,'#e9c778');}
  const blink=Math.sin(time*.7+index*2)>.998;
  if(blink){rect(ctx,-6,-14,3,1.3,P.ink,1);rect(ctx,4,-14,3,1.3,P.ink,1);}else{circle(ctx,-4.5,-14.2,1.6,P.ink);circle(ctx,5.2,-14.2,1.6,P.ink);circle(ctx,-4.9,-14.6,.5,'#ffffff');circle(ctx,4.8,-14.6,.5,'#ffffff');}
  circle(ctx,-7.5,-10.5,2.1,'#efb3c780');circle(ctx,8,-10.5,2.1,'#efb3c780');
  ctx.strokeStyle=P.ink;ctx.lineWidth=1.1;ctx.beginPath();ctx.arc(.4,-11,2,0,Math.PI);ctx.stroke();ctx.restore();
  text(ctx,CHARACTERS[index].name,p.x,p.y-40,10,outline);if(p.emote&&p.emoteUntil>time){rect(ctx,p.x-32,p.y-91,64,30,'#cdb1db',10);rect(ctx,p.x-31,p.y-90,62,28,'#fff9fc',9);text(ctx,p.emote,p.x,p.y-70,14,P.ink);}
 }
}
