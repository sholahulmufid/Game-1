export class GameAudio {
 constructor(){this.music=false;this.sfx=true;this.ctx=null;this.lastStep=0;}
 unlock(){try{this.ctx||=new AudioContext();this.ctx.resume();}catch{} }
 configure(music,sfx){this.music=music;this.sfx=sfx;this.unlock();if(music&&!this.ambient&&this.ctx){this.gain=this.ctx.createGain();this.gain.gain.value=.015;this.gain.connect(this.ctx.destination);this.ambient=[110,164.81,220].map(f=>{const o=this.ctx.createOscillator();o.type='sine';o.frequency.value=f;o.connect(this.gain);o.start();return o;});}if(this.gain)this.gain.gain.value=music?.015:0;}
 tone(frequency=400,duration=.16,volume=.03){if(!this.sfx||!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.connect(g);g.connect(this.ctx.destination);o.frequency.value=frequency;g.gain.setValueAtTime(volume,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.ctx.currentTime+duration);o.start();o.stop(this.ctx.currentTime+duration);}
 event(type){const frequencies={jump:500,tension:220,hang:180,rescue:760,checkpoint:650,core:880,heavy:800,switch:440,door:920,mission:1050,complete:1200,restart:150,plates:700,pickup:600};if(frequencies[type])this.tone(frequencies[type],type==='complete'?.5:.18);}
 footsteps(s){if(!this.ctx)return;if(s.players.some(p=>p.animation==='run')&&s.clock-this.lastStep>.24){this.lastStep=s.clock;this.tone(115,.035,.018);}}
 stop(){if(this.gain)this.gain.gain.value=0;}
}
