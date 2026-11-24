import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
import {validateFocus} from '../engine/focus-session.ts';import {audit} from '../engine/audit.ts';import {initial32,validate32,baseline32} from './state.ts';import {initial32 as legacyInitial} from '../life32r2/state.ts';
import {Runtime32} from './engine.ts';
import type {Config32,State32,Record32} from './types.ts';import type {FocusRequest} from '../domain/types.ts';
export const hash32=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export interface Receipt32 extends FocusRequest {from:number;until:number;start:number;end:number;digest:string}
export interface Evidence32 {config:Config32;before:State32;after:State32;receipt:Receipt32;records:Record32[];digest:string}
type Row={payload:string;digest:string};
const checked=<T>(row:Row|undefined):T=>{assert.ok(row,'missing committed row');const v=JSON.parse(row.payload) as T;assert.equal(hash32(v),row.digest,'snapshot/config digest mismatch');return v;};
function snapshot(db:DatabaseSync,n?:number):State32{return checked<State32>((n===undefined?db.prepare('SELECT * FROM snapshots32 ORDER BY sequence DESC LIMIT 1').get():db.prepare('SELECT * FROM snapshots32 WHERE sequence=?').get(n)) as Row|undefined);}
function packet(db:DatabaseSync,sequence?:number):Evidence32{
 const row=(sequence===undefined?db.prepare('SELECT * FROM sessions32 ORDER BY sequence DESC LIMIT 1').get():db.prepare('SELECT * FROM sessions32 WHERE sequence=?').get(sequence)) as {sequence:number;id:string;request:string;payload:string}|undefined;assert.ok(row,'session not committed');const receipt=JSON.parse(row.payload) as Receipt32;
 assert.equal(receipt.sequence,row.sequence,'session identity mismatch');assert.equal(receipt.id,row.id,'session identity mismatch');if(sequence!==undefined)assert.equal(receipt.sequence,sequence,'session identity mismatch');
 assert.deepEqual(JSON.parse(row.request),{id:receipt.id,sequence:receipt.sequence,realMinutes:receipt.realMinutes,rate:receipt.rate},'session request mismatch');
 const config=checked<Config32>(db.prepare('SELECT * FROM config32').get() as Row),before=snapshot(db,receipt.sequence-1),after=snapshot(db,receipt.sequence);
 const rows=db.prepare('SELECT * FROM records32 WHERE sequence>? AND sequence<=? ORDER BY sequence').all(receipt.start,receipt.end) as unknown as (Row&{sequence:number;id:string;time:number;actor:string;kind:string})[];
 const records=rows.map((r,i)=>{const e=JSON.parse(r.payload) as Record32;for(const k of ['sequence','id','time','actor','kind'] as const)assert.equal(e[k],r[k],'record column mismatch');assert.equal(e.sequence,receipt.start+i+1);return e;});
 assert.equal(before.serial,receipt.start);assert.equal(after.serial,receipt.end);assert.equal(records.length,receipt.end-receipt.start);assert.equal(hash32(records),receipt.digest);assert.equal(before.time,receipt.from);assert.equal(after.time,receipt.until);assert.equal(after.worlds[config.hero]!.awakeMinutes-before.worlds[config.hero]!.awakeMinutes,validateFocus(receipt));
 const v={config,before,after,receipt,records};return{...v,digest:hash32(v)};
}
export function read32(file:string,sequence?:number):Evidence32{using db=new DatabaseSync(file,{readOnly:true,timeout:5000});db.exec('BEGIN');try{const v=packet(db,sequence);db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}}
export function view32(file:string){using db=new DatabaseSync(file,{readOnly:true,timeout:5000});db.exec('BEGIN');try{const state=snapshot(db),sessions=(db.prepare('SELECT payload FROM sessions32 ORDER BY sequence').all() as unknown as Row[]).map(r=>JSON.parse(r.payload) as Receipt32);db.exec('COMMIT');return{state,sessions};}catch(e){db.exec('ROLLBACK');throw e;}}
export class Store32 implements Disposable{
 readonly db:DatabaseSync;readonly config:Config32;
 constructor(file:string,config?:Config32){if(config)validate32(config);this.db=new DatabaseSync(file);try{
  assert.ok(!this.db.prepare("SELECT name FROM sqlite_master WHERE name IN ('metadata','m2_config','m3_config','life_config')").get(),'use a new version32 database');
  if(this.db.prepare("SELECT name FROM sqlite_master WHERE name='config32'").get()){const existing=this.db.prepare('SELECT payload FROM config32').get() as {payload:string};assert.equal(JSON.parse(existing.payload).revision,3,'use a new round3 database');}
  this.db.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS config32(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,digest TEXT NOT NULL);CREATE TABLE IF NOT EXISTS snapshots32(sequence INTEGER PRIMARY KEY,payload TEXT NOT NULL,digest TEXT NOT NULL);CREATE TABLE IF NOT EXISTS sessions32(sequence INTEGER PRIMARY KEY,id TEXT UNIQUE NOT NULL,request TEXT NOT NULL,payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS records32(sequence INTEGER PRIMARY KEY,id TEXT UNIQUE NOT NULL,time INTEGER NOT NULL,actor TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL);');
  for(const table of ['config32','snapshots32','sessions32','records32'])for(const op of ['UPDATE','DELETE'])this.db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_no_${op.toLowerCase()} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'append-only');END`);
  this.db.exec('BEGIN IMMEDIATE');try{const row=this.db.prepare('SELECT * FROM config32').get() as Row|undefined;if(row){this.config=checked<Config32>(row);validate32(this.config);if(config)assert.deepEqual(this.config,config);}else{assert.ok(config,'new config required');this.config=structuredClone(config);this.db.prepare('INSERT INTO config32 VALUES(1,?,?)').run(JSON.stringify(config),hash32(config));this.save(0,(config.rules.continuity?initial32(config):legacyInitial(baseline32(config))));}this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
 }catch(e){this.db.close();throw e;}}
 private save(n:number,s:State32){this.db.prepare('INSERT INTO snapshots32 VALUES(?,?,?)').run(n,JSON.stringify(s),hash32(s));}
 state():State32{return snapshot(this.db);}
 submit(q:FocusRequest):Receipt32{
  const budget=validateFocus(q),request={id:q.id,sequence:q.sequence,realMinutes:q.realMinutes,rate:q.rate},json=JSON.stringify(request);this.db.exec('BEGIN IMMEDIATE');try{
   const old=this.db.prepare('SELECT request,payload FROM sessions32 WHERE id=?').get(q.id) as {request:string;payload:string}|undefined;if(old){assert.equal(old.request,json,'idempotency conflict');this.db.exec('COMMIT');return JSON.parse(old.payload) as Receipt32;}
   assert.equal(q.sequence,(this.db.prepare('SELECT count(*) n FROM sessions32').get() as {n:number}).n+1,'sequence conflict');
   const before=this.state(),r=new Runtime32(this.config,before).advance(budget),receipt:Receipt32={...request,from:before.time,until:r.state.time,start:before.serial,end:r.state.serial,digest:hash32(r.records)};
   const insert=this.db.prepare('INSERT INTO records32 VALUES(?,?,?,?,?,?)');for(const e of r.records)insert.run(e.sequence,e.id,e.time,e.actor,e.kind,JSON.stringify(e));this.save(q.sequence,r.state);this.db.prepare('INSERT INTO sessions32 VALUES(?,?,?,?)').run(q.sequence,q.id,json,JSON.stringify(receipt));this.db.exec('COMMIT');return receipt;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 verify():State32{
  this.db.exec('BEGIN');try{assert.equal((this.db.prepare('PRAGMA integrity_check').get() as {integrity_check:string}).integrity_check,'ok');assert.deepEqual(checked<Config32>(this.db.prepare('SELECT * FROM config32').get() as Row),this.config);
   let state:State32=(this.config.rules.continuity?initial32(this.config):legacyInitial(baseline32(this.config)));assert.deepEqual(snapshot(this.db,0),state);const sessions=this.db.prepare('SELECT sequence FROM sessions32 ORDER BY sequence').all() as {sequence:number}[],all:Record32[]=[];
   for(const [i,row] of sessions.entries()){assert.equal(row.sequence,i+1);const e=packet(this.db,row.sequence),r=new Runtime32(this.config,state).advance(validateFocus(e.receipt));assert.deepEqual(e.before,state);assert.deepEqual(e.records,r.records);assert.deepEqual(e.after,r.state);state=r.state;all.push(...r.records);}
   assert.equal((this.db.prepare('SELECT count(*) n FROM records32').get() as {n:number}).n,state.serial);assert.equal((this.db.prepare('SELECT count(*) n FROM snapshots32').get() as {n:number}).n,sessions.length+1);
   for(const w of this.config.worlds)assert.deepEqual(audit(w,all.filter(r=>r.actor===w.character.id&&r.world).map(r=>r.world!),state.worlds[w.character.id]!).errors,[]);
   const earned=Object.values(state.worlds).flatMap(w=>w.ledger).filter(e=>e.category==='earned_income').reduce((n,e)=>n+e.amountCents,0);const receipts=all.filter(r=>r.kind==='service_invoice_paid');
   const work=new Map(all.filter(r=>r.fact && ['work','repair'].includes(r.fact.kind)).map(r=>[r.id,r.fact!]));
   let reimbursed=0;
   for(const receipt of receipts){
     let due=0;
     for(const ref of receipt.causes.slice(1)){
       const fact=work.get(ref);assert.ok(fact,'invoice refers to unpaid work only once');
       due+=(fact.until-fact.from)*this.config.employer.hourlyWageCents/60;work.delete(ref);
     }
     assert.equal(due,receipt.data?.cents);reimbursed+=due;
   }
   assert.equal(this.config.employer.cashCents+reimbursed-state.employerCash,earned,'employer/worker conservation');
   if(state.city){const purchases=Object.values(state.worlds).flatMap(w=>w.ledger).filter(e=>e.category==='purchase').reduce((n,e)=>n-e.amountCents,0);assert.equal(state.city.servicesCents,purchases,'service receipts conservation');}
   const seen=new Set<string>();for(const r of all){for(const ref of r.causes)assert.ok(ref.startsWith('initial:')||seen.has(ref),'causal reference missing: '+ref);seen.add(r.id);if(r.world)seen.add(r.actor+'/'+r.world.id);}
   this.db.exec('COMMIT');return state;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 close(){this.db.close();}[Symbol.dispose](){this.close();}
}
