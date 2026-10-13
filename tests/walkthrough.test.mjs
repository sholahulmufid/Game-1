import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../physics.js';

// Scripted two-player inputs use the same simulation as the browser. No world
// objects or mission flags are edited in this complete campaign traversal.
function walk(w,goals,{interact=false,max=1800,jump=true}={}){
 for(let n=0;n<max&&w.s.status==='playing';n++){
  let arrived=true;
  w.s.players.forEach((p,i)=>{
   const dx=goals[i]-p.x,dir=Math.sign(dx),moving=Math.abs(dx)>7;arrived&&=!moving&&p.grounded;
   const platforms=w.platforms(),support=platforms.find(r=>Math.abs(p.y+18-r.y)<1&&p.x>=r.x-10&&p.x<=r.x+r.w+10);
   const ahead=p.x+dir*55;
   const obstacle=platforms.some(r=>r!==support&&r.y<p.y+18&&r.y+r.h>p.y-18&&r.x<ahead+13&&r.x+r.w>ahead-13);
   const gap=support&&!platforms.some(r=>r.x<ahead&&r.x+r.w>ahead&&Math.abs(r.y-(p.y+18))<25);
   w.setInput(i,{left:moving&&dx<0,right:moving&&dx>0,interact,jump:jump&&moving&&p.grounded&&!p.prevJump&&(obstacle||gap)});
  });
  if(arrived)return;
  w.step();
 }
 if(w.s.status==='playing')throw Error(`Could not reach ${goals} in ${w.level.name}: ${JSON.stringify(w.s.players.map(p=>({x:p.x,y:p.y,g:p.grounded})))} (restarts ${w.s.stats.restarts})`);
}
function hold(w,n,a={},b={}){w.setInput(0,a);w.setInput(1,b);for(let i=0;i<n;i++)w.step();}
function retrieve(w,anchorX,coreX,socketX){
 walk(w,[anchorX,anchorX-55]);
 for(let i=0;i<500&&!w.s.mechanisms.core;i++){
  const carrier=w.s.mechanisms.coreCarrier,p=w.s.players[1];
  // Echo descends holding Interact, then steers to the socket when lifted.
  const target=carrier===null?coreX:socketX;
  const dx=target-p.x;
  w.setInput(0,{pull:true});w.setInput(1,{interact:true,left:dx< -6,right:dx>6});w.step();
 }
 assert.equal(w.s.mechanisms.core,true,`core retrieval in ${w.level.name}`);
 hold(w,45);assert.equal(w.s.stats.restarts,0,'core retrieval should not require dying');
}
function plates(w){const [a,b]=w.level.plates;walk(w,[a.x+a.w/2,b.x+b.w/2]);hold(w,70);assert.equal(w.s.mechanisms.plates,true);}
function heavy(w){const cell=w.s.mechanisms.heavy;walk(w,[cell.x-40,cell.x+40]);hold(w,15,{interact:true},{interact:true});assert.equal(cell.carried,true);walk(w,[w.level.generator.x-40,w.level.generator.x+40],{interact:true});assert.equal(w.s.mechanisms.heavyDelivered,true);}
function lasers(w){const [a,b]=w.level.switches;walk(w,[a.x,a.x+60]);hold(w,1,{interact:true},{});walk(w,[a.x,b.x],{jump:true});hold(w,1,{}, {interact:true});assert.equal(w.s.mechanisms.switchMask,3);walk(w,[b.x+80,b.x+135]);}
function exit(w){const e=w.level.exit;walk(w,[e.x+25,e.x+60]);hold(w,5);assert.ok(['complete','levelComplete'].includes(w.s.status));}
test('two simulated players complete all seven levels through movement and interactions',()=>{
 const w=new World();hold(w,5);
 exit(w);w.next();
 plates(w);exit(w);w.next();
 retrieve(w,397,455,325);exit(w);w.next();
 exit(w);w.next();
 heavy(w);exit(w);w.next();
 lasers(w);exit(w);w.next();
 retrieve(w,337,395,255);plates(w);heavy(w);lasers(w);exit(w);
 assert.equal(w.s.status,'complete');assert.ok(w.s.collapseLeft>0);assert.equal(w.s.level,6);
});
