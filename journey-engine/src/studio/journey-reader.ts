import {connectScene} from './journey-context.ts';
import {StudioError} from './catalog.ts';
import {record32} from './life32r3-query.ts';
import {read32, type Evidence32} from '../life32r3/store.ts';
import type {Fact32,Record32} from '../life32r3/types.ts';
import {opportunity32} from '../life32r3/sources.ts';

export interface Scene {topic:string;row:Record32|null;context?:{text:string;refs:string[]}}
const themes:Record<string,string>={
  journey_collect:'还书',journey_deliver:'还书',journey_mend:'还书',
  journey_survey:'水情',journey_fieldnote:'水情',journey_clear:'清障',
  create:'作品',review:'作品',revise:'作品',host:'邻里交流',gather:'邻里交流',collaborate:'合作',
  contact:'约见',social:'约见',choice:'约见',journey_message:'通信',travel_journal:'手记',
  water:'花圃',harvest:'花圃',garden_project:'花圃',observe:'观察',visit:'探访',study:'学习',
  practice:'练习',repair:'维修',work:'值班',care:'起居',supplies:'起居',exercise:'锻炼',pack_meals:'路餐',
  move:'赶路',eat:'吃饭',waiting:'停留',leisure:'休息',
};
const routine=new Set(['care','supplies','exercise','pack_meals','eat','waiting','leisure','move']);
function importance(f:Fact32){
  if(f.kind==='choice')return 6;
  if(!f.opportunity)return f.kind==='move'?1:0;
  if(!f.semantic)return 2;
  if(routine.has(f.kind))return 3;
  if(f.kind==='journey_mend'||f.newState.includes('异地还书入站，书脊破损产生修补需求')||f.kind==='revise')return 9;
  if(['journey_survey','journey_fieldnote','collaborate','review','gather','journey_message','repair'].includes(f.kind))return 8;
  if(f.kind==='work' || f.kind==='study')return 4;
  return 7;
}

function rankedFacts(e:Evidence32){
  const hero=e.config.hero, recent=e.before.history.filter(h=>h.actor===hero).slice(-16);
  return e.records.flatMap(row=>{
    const f=row.fact;
    if(!f || !(f.actors.includes(hero) || f.affected?.includes(hero)))return [];
    const topic=themes[f.kind]??f.kind, weight=importance(f);
    const repeats=recent.filter(h=>(themes[h.kind]??h.kind)===topic).length;
    return [{row,topic,weight,score:weight*4-Math.min(12,repeats*3)}];
  }).sort((a,b)=>b.score-a.score || b.row.sequence-a.row.sequence);
}

export function readerChoices(e:Evidence32):Scene[]{
  const ranked=rankedFacts(e);
  if(!ranked.length)return [{row:null,topic:'途中'}];
  const hasIncident=ranked.some(c=>c.weight>=4);
  const scenes:Scene[]=[];
  for(const c of ranked){
    if(hasIncident && c.weight<4 || scenes.some(s=>s.topic===c.topic))continue;
    scenes.push({row:c.row,topic:c.topic});
    if(scenes.length===2)break;
  }
  return scenes;
}

export function pickScene(choices:Scene[],previous:string):Scene {
  return choices[0]!.topic===previous && choices[1]?choices[1]:choices[0]!;
}

const priorWindows=9;
interface LeadOption {topic:string;key:string;score:number;outcome:boolean}

function preferred<T extends LeadOption>(options:T[],recent:LeadOption[]):T{
  const score=(c:T)=>c.score-24*recent.filter(s=>s.key===c.key).length-
    5*recent.filter(s=>s.topic===c.topic).length-(recent.at(-1)?.topic===c.topic?10:0);
  // Candidates arrive in score/chronology order, which also breaks ties here.
  return options.reduce((best,c)=>(c.outcome!==best.outcome?c.outcome:score(c)>score(best))?c:best);
}

function afterShiftScene(e:Evidence32,scene:Scene,shift:Record32):Scene{
  const f=scene.row!.fact!,name=e.config.people.find(p=>p.id===e.config.hero)!.name;
  if(f.kind==='exercise')return {...scene,context:{text:'值班过后，'+f.text.split('。')[0]+'。',refs:[shift.id,scene.row!.id]}};
  const parts=e.records.filter(r=>r.actor===e.config.hero && r.fact?.opportunity===f.opportunity && r.fact.progress &&
    r.fact.from>=shift.fact!.until && r.fact.until<=f.until);
  const minutes=parts.reduce((sum,r)=>sum+r.fact!.until-r.fact!.from,0);
  const action=f.kind==='create'?'整理关于“'+f.title+'”的写作素材，作品还没写完。':'清理岸边拦网上的漂枝，这次清理还没结束。';
  return {...scene,context:{text:name+'值完班，在'+locationOf(e,f)+'花了'+minutes+'分钟'+action,refs:[shift.id,...parts.map(r=>r.id)]}};
}

export class JourneyReading {
  private windows:LeadOption[][]=[];
  private previous='';
  private previousShift:string|undefined;
  select(e:Evidence32):Scene{
    if((e.config.journeyRevision??0)<7){
      const scene=pickScene(readerChoices(e),this.previous);
      this.previous=scene.topic;
      return scene;
    }
    const ranked=rankedFacts(e), hasIncident=ranked.some(c=>c.weight>=4);
    const consequences=new Set(e.records.flatMap(r=>{
      if(r.actor!==e.config.hero)return [];
      if(r.kind==='relationship_repaired')return r.causes.slice(1,2);
      if(r.kind==='life_goal_progress' || (r.kind==='river_rack_cleared' && r.data?.after===0))return r.causes.slice(0,1);
      return [];
    }));
    const lastWork=e.records.findLast(r=>r.actor===e.config.hero && r.fact?.kind==='work' && r.fact.progress);
    const work=opportunity32(e.before,lastWork?.fact?.opportunity);
    const candidates=ranked.flatMap(c=>{
      const f=c.row.fact!, o=opportunity32(e.after,f.opportunity);
      let afterShift:string|undefined;
      if(hasIncident && c.weight<4 && !(f.kind==='pack_meals' && f.semantic)){
        if(!lastWork || !work?.progress || c.row.actor!==e.config.hero || !f.progress || f.from<lastWork.fact!.until)return [];
        const underway=o && !f.semantic && ['create','journey_clear'].includes(f.kind) &&
          ['pending','paused','active'].includes(o.status) && o.progress>0 && o.progress<o.minutes;
        if(!(f.kind==='exercise' && f.semantic) && !underway)return [];
        afterShift=work.id;
      }
      const key=JSON.stringify([f.kind,o?.subject??f.title,f.location]);
      const outcome=consequences.has(c.row.id) || Boolean(f.semantic && ['journey_deliver','journey_mend'].includes(f.kind));
      const score=c.score-(f.kind==='journey_clear' && !outcome?8:0);
      return [{row:c.row,topic:c.topic,key,score,outcome,shift:f.kind==='work'?o?.id:undefined,afterShift}];
    });
    // Replay the same bounded context for streaming reads and direct archive reads.
    const recent:LeadOption[]=[];
    for(const options of this.windows)recent.push(preferred(options,recent));
    const ordinary=candidates.filter(c=>!c.afterShift);
    const lead=ordinary.length?preferred(ordinary,recent):{row:null,topic:'途中',key:'',score:0,outcome:false,shift:undefined};
    this.windows.push(ordinary.length?ordinary.map(({topic,key,score,outcome})=>({topic,key,score,outcome})):[lead]);
    if(this.windows.length>priorWindows)this.windows.shift();
    const scene={row:lead.row,topic:lead.topic};
    // Resolve repeated pay at display time. A different closing scene in this
    // window must not change which incidents outrank pay in later windows.
    const previousShift=this.previousShift;
    this.previousShift=lead.shift;
    if(!lead.outcome && lead.shift && lead.shift===previousShift && work?.id===lead.shift && lastWork){
      const later=candidates.filter(c=>c.afterShift===lead.shift);
      if(later.length)return afterShiftScene(e,preferred(later,recent),lastWork);
      const closed=e.records.find(r=>r.kind==='plan_completed' && r.actor===e.config.hero && r.data?.opportunity===work.id);
      if(closed && work.progress>0 && closed.data?.progress===work.minutes){
        const recap=renderScene(e,scene);
        return {...scene,context:{text:recap.text+'算上先前值过的'+work.progress+'分钟，这次排定的'+work.minutes+'分钟已经做完了。',
          refs:[...recap.refs,closed.id]}};
      }
    }
    return scene;
  }
}

function companions(e:Evidence32,s:Scene){
  const f=s.row?.fact;
  if(!f || f.kind==='choice')return [];
  const ids=new Set([...f.actors,...f.affected??[]]);
  const review=reviewOfScene(e,s);
  if(review)ids.add(review.actor);
  const o=opportunity32(e.after,f.opportunity);
  if((f.kind==='journey_message' || f.kind==='contact') && o?.objectId)ids.add(o.objectId);
  return e.config.people.filter(p=>p.role==='npc' && ids.has(p.id)).map(({id,name})=>({id,name}));
}

function reviewOfScene(e:Evidence32,s:Scene){
  if(s.row?.fact?.kind!=='create' || !s.row.fact.semantic)return undefined;
  const ref=s.row.id;
  return e.records.find(r=>r.fact?.kind==='review' && r.fact.semantic && r.fact.affected?.includes(e.config.hero) &&
    opportunity32(e.after,r.fact.opportunity)?.sourceRefs.includes(ref));
}

export function askCompanion(e:Evidence32,s:Scene,id:string){
  if(!companions(e,s).some(p=>p.id===id))return undefined;
  const review=reviewOfScene(e,s);
  const before=review?.actor===id?review.fact!.from:s.row!.fact!.from;
  const memories=new Map(e.after.memories.filter(m=>m.actor===id).map(m=>[m.source,m.text]));
  const last=e.after.history.findLast(h=>h.actor===id && h.until<=before && memories.has(h.ref));
  if(!last)return {text:'这次接触之前，对方还没有可追溯的已完成经历。',ref:null};
  const npc=e.config.people.find(p=>p.id===id)!;
  return {text:memories.get(last.ref)!.replaceAll(npc.name,'我'),ref:last.ref};
}

export function renderScene(e:Evidence32,s:Scene){
  if(s.context)return {...s.context,companions:companions(e,s)};
  const hero=e.config.hero, name=e.config.people.find(p=>p.id===hero)!.name;
  const f=s.row?.fact, w=e.after.worlds[hero]!, location=e.config.worlds[0]!.places.find(p=>p.id===w.locationId)!.name;
  const refs:string[]=s.row?[s.row.id]:[];
  let text=f?.text??(name+'这段时间还在'+location+'，手头的行程还没有新的结果。');
  if(f){
    const o=opportunity32(e.after,f.opportunity);
    if(!f.actors.includes(hero) && o){
      const other=e.config.people.find(p=>p.id===o.actor)!.name;
      if(f.kind==='review'){
        const work=e.after.works.find(book=>book.id===o.objectId)!;
        text=name+'的《'+work.subject+'》有了读者的回音。'+other+(f.newState.includes('提出补充细节的反馈')?'读完后想知道，现场究竟是什么样子。':'读到了修订中新添的现场细节。');
      }else if(f.kind==='contact'){
        const place=e.config.worlds[0]!.places.find(p=>p.id===e.config.people.find(person=>person.id===o.actor)!.workplace)!.name;
        text=other+'给'+name+'发来邀请，约在'+place+'碰面。';
      }
    }
    if(f.kind==='gather' && f.semantic && o){
      const other=e.config.people.find(p=>p.id!==hero && f.actors.includes(p.id))!;
      const book=e.after.works.find(w=>w.id===o.objectId)!;
      text=name+'在'+locationOf(e,f)+'见到'+other.name+'。两人用一个小时一起读《'+book.subject+'》，聊起书里写的东西。';
      const next=e.after.opportunities.find(op=>op.kind==='collaborate' && op.sourceRefs.includes(s.row!.id) &&
        op.participants.includes(hero) && ['pending','active','paused'].includes(op.status));
      if(next){
        text+='这次谈完，又有了一个可合写的题目——'+next.subject.replace(/^合写：/,'')+'。';
        refs.push(next.createdRef);
      }
    }
    if(f.kind==='collaborate' && f.semantic && o){
      const other=e.config.people.find(p=>p.id!==hero && f.actors.includes(p.id))!;
      text=name+'带着自己的材料到'+locationOf(e,f)+'，和'+other.name+'把两份记录合到了一起。两人一起写成了《'+o.subject.replace(/^合写：/,'')+'》。';
    }
    if(f.kind==='choice' && o){
      const other=e.config.people.find(p=>p.id!==hero && f.actors.includes(p.id))?.name;
      const reason=e.records.find(r=>s.row!.causes.includes(r.id))?.data?.reason;
      const why=String(reason??'');
      const detail=why.includes('sleep_conflict')?'等到两个人都有空，就过了休息的点。':
        why.includes('travel_unaffordable')?'这趟路费超出了手头的预算。':
        why.includes('participant_preference')?'有人想把这段时间留给自己。':'两人的日程和场地开放时间没能对上。';
      text=name+(other?'和'+other:'')+'这回没约成“'+o.subject+'”。'+detail;
    }
    if(f.kind==='observe' && f.semantic && o){
      text=name+'在'+locationOf(e,f)+'停下来看'+o.subject+'，花了半小时，把这次观察留作了素材。';
    }
    if(f.kind==='create' && f.semantic && o){
      const review=reviewOfScene(e,s);
      text=name+'把“'+o.subject+'”整理成作品，留在'+locationOf(e,f)+'。';
      if(review){
        refs.push(review.id);
        text+=e.config.people.find(p=>p.id===review.actor)!.name+'读完了，想再看一点现场的细节。';
      }else text+='先前写下的观察，现在也能给来这里的人看了。';
    }
    if(f.kind==='waiting')text=name+'在'+locationOf(e,f)+'等了'+(f.until-f.from)+'分钟。这段空档里没有新的进展。';
    if(f.kind==='work'){
      text=f.text.split('剩余值班')[0]!;
      if((e.config.journeyRevision??0)>=7 && s.row!.actor===hero){
        const shifts=e.records.filter(r=>r.actor===hero && r.fact?.kind==='work' && r.fact.progress && r.fact.location===f.location);
        if(shifts.length>1){
          const paid=new Map(e.after.worlds[hero]!.ledger.slice(e.before.worlds[hero]!.ledger.length)
            .filter(p=>p.category==='earned_income').map(p=>[hero+'/'+p.eventId,p.amountCents]));
          const payments=shifts.map(r=>r.causes.filter(ref=>paid.has(ref)));
          const ids=payments.flat();
          if(payments.every(p=>p.length===1) && new Set(ids).size===shifts.length){
            const minutes=shifts.reduce((n,r)=>n+r.fact!.until-r.fact!.from,0);
            const cents=ids.reduce((n,id)=>n+paid.get(id)!,0);
            text=name+'在'+locationOf(e,f)+'一共值班'+minutes+'分钟，分'+ids.length+'笔领到'+cents/100+'元工钱。';
            refs.splice(0,refs.length,...shifts.map(r=>r.id));
          }
        }
      }
    }
    if(f.kind==='revise' && o){
      const source=e.after.memories.findLast(m=>m.actor===hero && m.topic==='review' && o.sourceRefs.includes(m.source));
      if(source){
        refs.unshift(source.source);
        const work=e.after.works.find(book=>book.id===o.objectId)!;
        text='读者想知道《'+work.subject+'》里提到的地方究竟长什么样。'+name+'把现场细节补进了作品。';
      }
    }
    if(f.kind==='journey_survey')text=text.replace('。站里据此通知','。这张新通告提醒');
    text=text.replace('。这份修订仍来自先前的观察，没有凭空增加新的经历。','。');
  }
  return {text,refs,companions:companions(e,s)};
}

function locationOf(e:Evidence32,f:Fact32){
  return e.config.worlds[0]!.places.find(p=>p.id===f.location)!.name;
}

export function readScene(file:string,seq?:number){
  const e=read32(file,seq);
  let scene:Scene;
  if((e.config.journeyRevision??0)>=7){
    const reading=new JourneyReading();
    // The previous window's independent lead needs its own nine-window history.
    for(let n=Math.max(1,e.receipt.sequence-priorWindows-1);n<e.receipt.sequence;n++)reading.select(read32(file,n));
    scene=reading.select(e);
  }else scene=legacyScene(file,e);
  const currentRows=new Map(e.records.map(r=>[r.id,r]));
  return {e,scene:connectScene(e,scene,ref=>{
    if(currentRows.has(ref))return currentRows.get(ref);
    try{return record32(file,ref).record;}
    catch(error){if(error instanceof StudioError && error.code==='record_missing')return undefined;throw error;}
  })};
}

function legacyScene(file:string,e:Evidence32){
  const current=readerChoices(e);
  // Only the preceding lead can change today's choice. Stop at the first window
  // whose result is fixed or whose topics cannot affect its successor.
  const chain=[current];
  for(let n=e.receipt.sequence-1;n>=1 && chain.at(-1)!.length>1;n--){
    const previous=readerChoices(read32(file,n));
    if(!previous.some(s=>s.topic===chain.at(-1)![0]!.topic))break;
    chain.push(previous);
  }
  let scene=chain.pop()![0]!;
  for(const options of chain.reverse())scene=pickScene(options,scene.topic);
  return scene;
}
