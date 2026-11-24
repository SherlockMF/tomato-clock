import assert from 'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{mkdirSync,readdirSync,readFileSync}from'node:fs';import{join,resolve}from'node:path';import{randomUUID}from'node:crypto';import{isDeepStrictEqual}from'node:util';
import{Store32,hash32}from'../life32r3/store.ts';import{fixture32,validate32}from'../life32r3/state.ts';import type{Config32,Background}from'../life32r3/types.ts';import{StudioError}from'./catalog.ts';import type{Job}from'./catalog.ts';
import {journeyFixture} from '../journey/world.ts';
export const presets32=()=>['settled','traveler','creator','low_assets'].map(id=>({id,name:({settled:'定居 · 小禾',traveler:'旅行 · 阿远',creator:'创作 · 知夏',low_assets:'低资产 · 小周'} as Record<string,string>)[id]!,config:fixture32(id as Background)}));
export function journeyPresets() {
  const names:Record<Background,string>={traveler:'旅行 · 阿远',settled:'定居 · 小禾',creator:'创作 · 知夏',low_assets:'低资产 · 小周'};
  return (Object.keys(names) as Background[]).map(id=>({id,name:names[id],config:journeyFixture(id)}));
}
export function version32(){const files=['domain','engine','life32','life32r2','life32r3','journey'].flatMap(d=>readdirSync('src/'+d).filter(f=>f.endsWith('.ts')).sort().map(f=>[d+'/'+f,readFileSync('src/'+d+'/'+f,'utf8')]));files.push(['autonomy/perception.ts',readFileSync('src/autonomy/perception.ts','utf8')]);return'life32r3-'+hash32(files).slice(0,16);}
export function studioConfig32(c:Config32):Config32{try{
 const base=c.journey===true?journeyFixture(c.background,c.worlds[0]!.seed):fixture32(c.background);
 if(c.journeyRevision===undefined)delete base.journeyRevision;else if(c.journeyRevision===2 || c.journeyRevision===3 || c.journeyRevision===4 || c.journeyRevision===5 || c.journeyRevision===6)base.journeyRevision=c.journeyRevision;
 if(c.localActivities===undefined)delete base.localActivities;
 if(c.journey)assert.ok(c.rules.continuity,'旅途需要连续生活规则');
 for(const k of ['rules','garden','employer'] as const)assert.deepEqual(Object.keys(c[k]).sort(),Object.keys(base[k]).sort(),'未知规则字段');for(const p of c.people)assert.ok(p.interests.every(i=>['摄影','写作','园艺','探索','社交','工作'].includes(i)),'兴趣尚未参与评分');base.rules=structuredClone(c.rules);base.garden=structuredClone(c.garden);base.employer=structuredClone(c.employer);
 for(const [i,w]of base.worlds.entries()){const v=c.worlds[i]!;w.initialCashCents=v.initialCashCents;w.monthlyIncomeCents=v.monthlyIncomeCents;w.personality=structuredClone(v.personality);base.people[i]!.personality=structuredClone(c.people[i]!.personality);base.people[i]!.interests=structuredClone(c.people[i]!.interests);}
 assert.ok(isDeepStrictEqual(c,base),'未接入的配置字段被修改');validate32(base);return base;
 }catch(e){throw new StudioError(422,'invalid_life32_config',e instanceof Error?e.message:'invalid config');}}
export interface Experiment32{id:string;name:string;mode:'life32';version:number;parent:string|null;engine:string;configHash:string;config:Config32;readOnly:false;createdAt:string}
export class Catalog32 implements Disposable{
 readonly root:string;readonly db:DatabaseSync;
 constructor(root:string){this.root=resolve(root);mkdirSync(root,{recursive:true});this.db=new DatabaseSync(join(root,'catalog.sqlite'));this.db.exec("PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS experiments(id TEXT PRIMARY KEY,payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS requests(key TEXT PRIMARY KEY,digest TEXT NOT NULL,result TEXT NOT NULL);CREATE TRIGGER IF NOT EXISTS frozen_update BEFORE UPDATE ON experiments BEGIN SELECT RAISE(ABORT,'immutable');END;CREATE TRIGGER IF NOT EXISTS frozen_delete BEFORE DELETE ON experiments BEGIN SELECT RAISE(ABORT,'immutable');END;");}
 file(id:string){if(!/^[a-z0-9-]{1,70}$/.test(id))throw new StudioError(400,'invalid_id','非法ID');return join(this.root,id+'.sqlite');}
 list():Experiment32[]{return(this.db.prepare('SELECT payload FROM experiments ORDER BY rowid DESC').all() as {payload:string}[]).map(r=>JSON.parse(r.payload) as Experiment32);}
 get(id:string){this.file(id);const r=this.db.prepare('SELECT payload FROM experiments WHERE id=?').get(id) as {payload:string}|undefined;if(!r)throw new StudioError(404,'experiment_missing','实验不存在');return JSON.parse(r.payload) as Experiment32;}
 previous(key:string,value:unknown){if(!key||key.length>180)throw new StudioError(400,'idempotency_key','需要有效幂等键');const r=this.db.prepare('SELECT * FROM requests WHERE key=?').get(key) as {digest:string;result:string}|undefined;if(r&&r.digest!==hash32(value))throw new StudioError(409,'idempotency_conflict','幂等键参数冲突');return r?.result??null;}
 remember(key:string,value:unknown,id:string){this.db.prepare('INSERT INTO requests VALUES(?,?,?)').run(key,hash32(value),id);}
 create(input:{name:string;config:Config32;parent?:string},key:string){const old=this.previous(key,input);if(old)return this.get(old);if(!input||typeof input.name!=='string'||!input.name.trim()||input.name.length>100)throw new StudioError(422,'name','名称1–100字');const config=studioConfig32(input.config),parent=input.parent?this.get(input.parent):null,id=randomUUID();const e:Experiment32={id,name:input.name,mode:'life32',version:(parent?.version??0)+1,parent:parent?.id??null,engine:version32(),configHash:hash32(config),config,readOnly:false,createdAt:new Date().toISOString()};using store=new Store32(this.file(id),config);store.state();this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO experiments VALUES(?,?)').run(id,JSON.stringify(e));this.remember(key,input,id);this.db.exec('COMMIT');return e;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 jobs():Job[]{return(this.db.prepare('SELECT payload FROM jobs ORDER BY rowid DESC').all() as {payload:string}[]).map(r=>JSON.parse(r.payload) as Job);}
 job(id:string){const r=this.db.prepare('SELECT payload FROM jobs WHERE id=?').get(id) as {payload:string}|undefined;if(!r)throw new StudioError(404,'job_missing','任务不存在');return JSON.parse(r.payload) as Job;}
 updateJob(j:Job){this.db.prepare('INSERT INTO jobs VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(j.id,JSON.stringify(j));}
 recover(){for(const j of this.jobs())if(['queued','running'].includes(j.status))this.updateJob({...j,status:'interrupted',message:'服务重启，保留已提交窗口'});}
 close(){this.db.close();}[Symbol.dispose](){this.close();}
}
