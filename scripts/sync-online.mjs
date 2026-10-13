import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url)),site=path.join(root,'online');
await mkdir(path.join(site,'public','game'),{recursive:true});
for(const file of ['style.css','app.js','game.js','physics.js','renderer.js','levels.js','multiplayer.js','hosted-multiplayer.js','audio.js','config.js'])await copyFile(path.join(root,file),path.join(site,'public','game',file));
const html=(await readFile(path.join(root,'index.html'),'utf8')).replace('href="style.css"','href="/game/style.css"').replace('src="config.js"','src="/game/config.js"').replace('src="app.js"','src="/game/app.js"');
await writeFile(path.join(site,'app','game-document.ts'),`// Generated from the maintained Canvas frontend by scripts/sync-online.mjs.\nexport const gameDocument = ${JSON.stringify(html)};\n`);
console.log('Canvas game synchronized into the online application.');
