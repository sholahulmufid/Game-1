import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {localRoomDatabase} from './d1-local.mjs';
import {handleRoomRequest} from '../online/lib/rooms.mjs';
const roomDatabase=await localRoomDatabase();
const root = process.cwd(), port = Number(process.env.PORT || process.argv[2] || 4175);
const publicFiles = new Set(['index.html','style.css','app.js','game.js','physics.js','renderer.js','levels.js','multiplayer.js','hosted-multiplayer.js','audio.js','config.js']);
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
http.createServer(async (req, res) => {
  try {
    if(new URL(req.url,'http://localhost').pathname==='/api/room'){
      if(req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({online:true}));}
      let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>76000){res.writeHead(413,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'REQUEST_TOO_LARGE'}));}chunks.push(chunk);}
      const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,body:Buffer.concat(chunks)});
      const response=await handleRoomRequest(request,roomDatabase);res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(await response.text());
    }
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(root, name);
    if (!target.startsWith(root + path.sep) || (!publicFiles.has(name) && !name.startsWith('assets/'))) { res.writeHead(404); return res.end('Not found'); }
    const body = await readFile(target); res.writeHead(200, {'Content-Type':mime[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`CONNECTED: http://127.0.0.1:${port}`));
