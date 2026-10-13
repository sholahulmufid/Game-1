import {mkdir,copyFile,unlink,writeFile} from 'node:fs/promises';
await mkdir('dist', {recursive:true});
for (const file of ['engine.js','transport.js','scenarios.js','assets/images/portals.webp','assets/images/outbreak.webp']) await unlink(`dist/${file}`).catch(error=>{if(error.code!=='ENOENT')throw error;});
for (const file of ['index.html','style.css','app.js','game.js','physics.js','renderer.js','levels.js','multiplayer.js','hosted-multiplayer.js','audio.js','config.js']) await copyFile(file, `dist/${file}`);
await writeFile('dist/_redirects','/api/room https://connected-kabur-bareng.sholahulmufid26.chatgpt.site/api/room 200!\n');
console.log('Static game built in dist/');
