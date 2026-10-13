import {DatabaseSync} from 'node:sqlite';
import {mkdir,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
export async function localRoomDatabase(filename=path.join(root,'.connected','rooms.sqlite')){
 if(filename!==':memory:')await mkdir(path.dirname(filename),{recursive:true});
 const raw=new DatabaseSync(filename);raw.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY);');
 for(const file of (await readdir(path.join(root,'online','drizzle'))).filter(f=>f.endsWith('.sql')).sort()){
  if(raw.prepare('SELECT name FROM local_migrations WHERE name=?').get(file))continue;
  raw.exec('BEGIN');try{raw.exec(await readFile(path.join(root,'online','drizzle',file),'utf8'));raw.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(file);raw.exec('COMMIT');}catch(error){raw.exec('ROLLBACK');throw error;}
 }
 class Statement{
  constructor(sql,values=[]){this.sql=sql;this.values=values;}
  bind(...values){return new Statement(this.sql,values);}
  async first(){return raw.prepare(this.sql).get(...this.values)||null;}
  async all(){return {results:raw.prepare(this.sql).all(...this.values)};}
  runSync(){const result=raw.prepare(this.sql).run(...this.values);return {success:true,meta:{changes:Number(result.changes)}};}
  async run(){return this.runSync();}
 }
 return {raw,prepare:sql=>new Statement(sql),async batch(statements){raw.exec('BEGIN');try{const results=statements.map(s=>s.runSync());raw.exec('COMMIT');return results;}catch(error){raw.exec('ROLLBACK');throw error;}},close:()=>raw.close()};
}
