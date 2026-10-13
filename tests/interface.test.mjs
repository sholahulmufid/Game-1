import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {readFile} from 'node:fs/promises';
import {Renderer} from '../renderer.js';

test('menu, Canvas keyboard co-op, pause, next level, result, replay and audio toggles',async()=>{
 const window=new Window({url:'http://localhost:4175',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 const globals=['window','document','localStorage','navigator','requestAnimationFrame','cancelAnimationFrame'];
 const prior=new Map(globals.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const frames=new Map();let id=0,now=0,world=null,draws=0;
 const context=new Proxy({createLinearGradient:()=>({addColorStop:()=>{}})},{get:(t,k)=>k in t?t[k]:(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
 window.HTMLCanvasElement.prototype.getContext=()=>context;
 window.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({width:1100,height:600});
 for(const [key,value] of Object.entries({window,document:window.document,localStorage:window.localStorage,navigator:window.navigator,requestAnimationFrame:callback=>{frames.set(++id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id)}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const original=Renderer.prototype.draw;Renderer.prototype.draw=function(w,...args){world=w;draws++;return original.call(this,w,...args);};
 const tick=(n=1)=>{for(let i=0;i<n;i++){now+=1000/60;const pending=[...frames.values()];frames.clear();pending.forEach(cb=>cb(now));}};
 const click=action=>{const element=document.querySelector(`[data-action="${action}"]`);assert.ok(element,action);element.click();};
 const key=(code,type='keydown')=>document.dispatchEvent(new window.KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
 try{
  document.write(await readFile(new URL('../index.html',import.meta.url),'utf8'));
  await import('../app.js');tick(2);assert.match(document.querySelector('h1').textContent,/Jangan lepas/);assert.ok(draws>0);
  click('create');assert.match(document.body.textContent,/Online belum dihubungkan/);document.querySelector('#nickname').value='Nova Test';document.querySelector('#room-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));assert.match(document.querySelector('#form-error').textContent,/Supabase/);
  click('local');tick(5);assert.equal(document.querySelector('#hud-name').textContent,'CONNECTION');assert.ok(world.s.players.every(p=>p.grounded));
  const start=world.s.players.map(p=>p.x);key('KeyD');key('ArrowRight');tick(20);key('KeyD','keyup');key('ArrowRight','keyup');assert.ok(world.s.players.every((p,i)=>p.x>start[i]+20));
  key('Escape');assert.equal(document.querySelector('#modal').open,true);const elapsed=world.s.time;tick(20);assert.equal(world.s.time,elapsed);click('resume');tick(2);assert.ok(world.s.time>elapsed);
  click('how');assert.equal(document.querySelectorAll('.control-card').length,2);click('resume');
  click('touch');assert.equal(document.querySelector('.touch-controls').hidden,false);click('seat');assert.match(document.querySelector('#touch-seat').textContent,/Echo/);
  for(const [i,p] of world.s.players.entries())Object.assign(p,{x:1100+i*40,y:502,vx:0,vy:0});tick(3);assert.match(document.querySelector('#game-overlay').textContent,/Mission complete/);click('next');tick(2);assert.equal(document.querySelector('#hud-name').textContent,'TWO SIGNALS');
  // Every world renderer branch is exercised, including moving platforms and lasers.
  for(let i=2;i<7;i++){world.load(i);tick(12);}
  world.s.mechanisms.door=true;Object.assign(world.s.mechanisms,{core:true,plates:true,heavyDelivered:true,switchMask:3});world.s.players.forEach((p,i)=>Object.assign(p,{x:2010+i*35,y:482,vx:0,vy:0}));tick(3);
  assert.match(document.querySelector('#game-overlay').textContent,/ESCAPEDTOGETHER/);assert.equal(document.querySelectorAll('.result-stats>div').length,4);click('replay');tick(2);assert.equal(world.s.level,0);assert.equal(frames.size,1,'replay must not leave multiple game loops');
  click('music');assert.equal(document.querySelector('[data-action="music"]').getAttribute('aria-pressed'),'true');click('sfx');assert.equal(document.querySelector('[data-action="sfx"]').getAttribute('aria-pressed'),'false');
  click('pause');click('leave');assert.match(document.querySelector('h1').textContent,/Jangan lepas/);tick(1);assert.equal(frames.size,1);
 }finally{
  Renderer.prototype.draw=original;for(const key of globals){const value=prior.get(key);if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}await window.happyDOM.abort();
 }
});
