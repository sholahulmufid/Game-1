import test from 'node:test';
import assert from 'node:assert/strict';
import {World,PHYSICS,distance,rating} from '../physics.js';
import {LEVELS} from '../levels.js';
const tick=(w,n=1,a={},b={})=>{w.setInput(0,a);w.setInput(1,b);for(let i=0;i<n;i++)w.step();};
const place=(w,a,b)=>{for(let i=0;i<2;i++)Object.assign(w.s.players[i],{...(i?b:a),vx:0,vy:0,grounded:true,prevInteract:false,prevJump:false});};
test('movement, gravity, grounded jump, no repeated jumps from held key',()=>{
 const w=new World();tick(w,10);assert.ok(w.s.players.every(p=>p.grounded));
 tick(w,25,{right:true},{right:true});assert.ok(w.s.players[0].x>175);
 tick(w,1,{jump:true},{jump:true});const y=w.s.players[0].y;assert.ok(y<502);assert.equal(w.s.players[0].animation,'jump');
 tick(w,120,{jump:true},{jump:true});assert.ok(Math.abs(w.s.players[0].y-502)<.001);assert.equal(w.events.filter(e=>e.type==='jump').length,2);
});
test('rope holds maximum distance and transmits movement to partner',()=>{
 const w=new World();w.load(4);tick(w,10);const start=w.s.players[0].x;
 tick(w,150,{}, {right:true});assert.ok(distance(...w.s.players)<=PHYSICS.rope+1);assert.ok(w.s.players[0].x>start+30);
});
test('pressure plate requires two separate players; unlock persists',()=>{
 const w=new World();w.load(1);place(w,{x:497,y:502},{x:580,y:502});tick(w,90);assert.equal(w.s.mechanisms.plates,false);
 place(w,{x:497,y:502},{x:677,y:502});tick(w,70);assert.equal(w.s.mechanisms.door,true);
 place(w,{x:830,y:502},{x:885,y:502});tick(w,2);assert.equal(w.s.checkpoint,1);w.restart();assert.equal(w.s.mechanisms.plates,true);
});
test('grounded anchor retrieves a core carrier from below the solid platform',()=>{
 const w=new World();w.load(2);place(w,{x:397,y:402},{x:455,y:590});w.s.players[1].grounded=false;
 tick(w,1,{pull:true},{interact:true});assert.equal(w.s.mechanisms.coreCarrier,1);
 tick(w,180,{pull:true},{left:true,interact:true});
 assert.equal(w.s.stats.restarts,0);assert.ok(w.s.players[1].grounded,'partner should reach platform');
 assert.ok(w.s.players[1].y<=402);assert.ok(w.s.mechanisms.core,'core must be returned to socket');
});
test('heavy cell requires opposite sides and both held inputs; release drops it',()=>{
 const w=new World();w.load(4);place(w,{x:430,y:502},{x:510,y:502});tick(w,10,{interact:true},{});assert.equal(w.s.mechanisms.heavy.carried,false);
 tick(w,10,{interact:true},{interact:true});assert.equal(w.s.mechanisms.heavy.carried,true);
 tick(w,200,{right:true,interact:true},{right:true,interact:true});assert.ok(w.s.mechanisms.heavy.x>800);
 tick(w,1,{},{interact:true});assert.equal(w.s.mechanisms.heavy.carried,false);
});
test('laser needs assigned switches, shuts down for four seconds and causes checkpoint respawn',()=>{
 const w=new World();w.load(5);place(w,{x:455,y:502},{x:515,y:502});tick(w,1,{interact:true},{});assert.equal(w.s.mechanisms.switchMask,1);
 place(w,{x:455,y:502},{x:695,y:502});tick(w,1,{}, {interact:true});assert.equal(w.s.mechanisms.door,true);
 tick(w,250);place(w,{x:530,y:502},{x:555,y:502});tick(w,1);assert.equal(w.s.stats.restarts,1);assert.ok(w.s.players.every(p=>p.invincible>0));
});
test('joint exit required in all seven sectors and final result is reached',()=>{
 const w=new World();
 for(let i=0;i<LEVELS.length;i++){
  assert.equal(w.s.level,i);const l=w.level;Object.assign(w.s.mechanisms,{plates:true,core:true,heavyDelivered:true,switchMask:3,door:true});
  const y=l.exit.y+l.exit.h-18;place(w,{x:l.exit.x+20,y},{x:l.exit.x-70,y});tick(w,1);assert.equal(w.s.status,'playing');
  place(w,{x:l.exit.x+20,y},{x:l.exit.x+60,y});tick(w,1);assert.equal(w.s.status,i===6?'complete':'levelComplete');w.next();
 }
 assert.equal(w.s.status,'complete');assert.equal(rating(w.s),'Perfectly Connected');
});
test('final timer fails, manual checkpoint restart grants another 150 seconds',()=>{
 const w=new World();w.load(6);w.s.collapseLeft=.02;tick(w,2);assert.equal(w.s.status,'failed');w.restart(true);assert.equal(w.s.collapseLeft,150);assert.equal(w.s.status,'playing');
});
test('saved session restores checkpoint rather than a hazardous mid-air position',()=>{
 const w=new World();place(w,{x:640,y:502},{x:700,y:502});tick(w,2);assert.equal(w.s.checkpoint,1);w.s.players[0].y=770;
 const s=w.persistence(),copy=new World(s);assert.equal(copy.s.players[0].y,502);assert.equal(copy.s.checkpoint,1);assert.equal(s.stats.restarts,0);
});
