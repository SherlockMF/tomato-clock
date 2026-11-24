import {JourneyClock} from './journey-clock.ts';
import {Store32} from '../life32r3/store.ts';
import {JourneyNarrator,localParagraph} from './journey-narrator.ts';
import {askCompanion,readScene,renderScene} from './journey-reader.ts';
import {attributeLabels} from '../journey/attributes.ts';
import type{IncomingMessage}from'node:http';import{Catalog32,presets32,version32,journeyPresets}from'./life32r3-catalog.ts';import{JobManager}from'./jobs.ts';import{StudioError}from'./catalog.ts';import type{RunRequest}from'./catalog.ts';import type{Config32}from'../life32r3/types.ts';import{view32}from'../life32r3/store.ts';import{records32,record32,window32,metrics32,context32,compare32}from'./life32r3-query.ts';
// The original R3 build predates journeys. The first journey build wrote the same snapshot bytes.
function compatibleVersion(c:Config32,stored:string,current:string):boolean {
 if(current!=='life32r3-e57abff1dca661f4'||c.journeyRevision===7)return false;
 if(stored==='life32r3-f4387640471649d2')return true;
 if(c.journeyRevision===6)return false;
 if(stored==='life32r3-8c163a4c3d3413b3')return true;
 if(c.journeyRevision===5)return false;
 if(stored==='life32r3-5e93a25b0e5308a9')return true;
 if(c.journeyRevision===4)return false;
 if(stored==='life32r3-57a5aae32a419902')return true;
 if(c.journeyRevision===3)return false;
 if(stored==='life32r3-5a55446d89dbcf55')return true;
 if(c.journeyRevision)return false;
 if(stored==='life32r3-0dd7287154448cbe')return true;
 if(c.localActivities)return false;
 return stored==='life32r3-b96203c209b237cf'||stored==='life32r3-4a0aaa6f380a9bb5'||(stored==='life32r3-0f5c87055ba29b2d'&&!c.journey);
}
export function service32(root:string,narratorPort?:number){const catalog=new Catalog32(root),clock=new JourneyClock(catalog.db),narrator=narratorPort===undefined?undefined:new JourneyNarrator(root,p=>localParagraph(p,narratorPort)),jobs=new JobManager(catalog,{worker:new URL('./life32r3-worker.ts',import.meta.url),version:version32,compatibleVersion:(id,stored,current)=>compatibleVersion(catalog.get(id).config,stored,current),modes:['focus','day','week','verify']});return{catalog,jobs,async close(){await jobs.close();await narrator?.close();catalog.close();},async handle(req:IncomingMessage,url:URL,body:unknown,key:string,send:(v:unknown,status?:number)=>void){const p=url.pathname.split('/').filter(Boolean).slice(3),get=req.method==='GET',post=req.method==='POST';
 if(get&&p[0]==='bootstrap'){send({presets:presets32(),journeyPresets:journeyPresets(),attributeLabels,engine:version32(),quality:'HUMAN_PENDING'});return;}
 if(get&&p[0]==='compare'){const a=catalog.get(url.searchParams.get('a')??''),b=catalog.get(url.searchParams.get('b')??'');try{send(compare32(catalog.file(a.id),a.config,catalog.file(b.id),b.config));}catch(e){throw new StudioError(422,'incomparable',e instanceof Error?e.message:'incomparable');}return;}
 if(p[0]==='experiments'){
  if(p.length===1){if(get){send({items:catalog.list().map(({config,...e})=>({...e,background:config.background,journey:config.journey===true}))});return;}if(post){send(catalog.create(body as{name:string;config:Config32;parent?:string},key),201);return;}}
  const e=catalog.get(p[1]!),file=catalog.file(e.id);
  if(p[2]==='timer' && e.config.journey){
    if(get){send({timer:clock.latest(e.id)??null,now:Date.now()});return;}
    if(post){
      const current=version32();
      if(e.engine!==current && !compatibleVersion(e.config,e.engine,current))throw new StudioError(409,'engine_changed','请用匹配版本的旅途存档');
      if(catalog.jobs().some(j=>j.experiment===e.id && ['queued','running'].includes(j.status)))throw new StudioError(409,'experiment_busy','请等待当前任务完成');
      const timer=clock.command(e.id,body,t=>{
        using store=new Store32(file);
        const id='timer-'+t.id,prior=store.db.prepare('SELECT sequence FROM sessions32 WHERE id=?').get(id);
        const sequence=prior?Number(prior.sequence):Number(store.db.prepare('SELECT count(*) n FROM sessions32').get()!.n)+1;
        return store.submit({id,sequence,realMinutes:t.realMinutes,rate:t.rate}).sequence;
      });
      send({timer,now:Date.now()});return;
    }
  }
  if(post&&p[2]==='jobs'){if(clock.latest(e.id)?.status==='running')throw new StudioError(409,'timer_active','请先完成或取消专注');if(!key)throw new StudioError(400,'key','需要幂等键');send(jobs.start(e.id,body as RunRequest,key),202);return;}
  if(get){if(p.length===2){const view=view32(file),hero=e.config.hero;
    const state=e.config.journey && url.searchParams.get('view')==='hero'?{time:view.state.time,worlds:{[hero]:view.state.worlds[hero]},journey:{profiles:{[hero]:view.state.journey!.profiles[hero]}}}:view.state;
    send({experiment:e,sessions:view.sessions,state,jobs:catalog.jobs().filter(j=>j.experiment===e.id).slice(0,20)});return;}const n=url.searchParams.has('sequence')?Number(url.searchParams.get('sequence')):undefined;if(n!==undefined&&(!Number.isSafeInteger(n)||n<1))throw new StudioError(400,'sequence','需要有效窗口号');
   if(p[2]==='recap' && e.config.journey){
    const {e:window,scene}=readScene(file,n),npc=url.searchParams.get('ask');
    if(npc!==null){
      const answer=askCompanion(window,scene,npc);
      if(!answer)throw new StudioError(404,'no_interaction','这个人物没有参与选中的经历');
      send(answer);return;
    }
    send(narrator?await narrator.render(window,scene,e.id):renderScene(window,scene));return;
   }
   if(p[2]==='story'){send(window32(file,n));return;}if(p[2]==='metrics'){send(metrics32(file,e.config));return;}if(p[2]==='context'){if(n===undefined)throw new StudioError(400,'sequence','需要窗口号');send(context32(file,n));return;}
   if(p[2]==='records'){if(p[3]){let ref;try{ref=decodeURIComponent(p[3]);}catch{throw new StudioError(400,'reference','引用编码无效');}send(record32(file,ref));return;}const cursor=Number(url.searchParams.get('cursor')??0);if(!Number.isSafeInteger(cursor)||cursor<0)throw new StudioError(400,'cursor','非法cursor');const rows=records32(file,url.searchParams.get('kind')??'fact').filter(r=>r.sequence>cursor);send({items:rows.slice(0,100),nextCursor:rows.length>100?rows[99]!.sequence:null});return;}
  }
 }
 if(p[0]==='jobs'){if(get){send(catalog.job(p[1]!));return;}if(post&&p[2]==='cancel'){send(jobs.cancel(p[1]!));return;}}
 throw new StudioError(404,'route','version32接口不存在');
}};}
