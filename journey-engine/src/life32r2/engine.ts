import {Runtime32 as LegacyRuntime} from '../life32/engine.ts';
import {cityFinish,cityGenerate,cityTick,cityDescription,cityScore,cityCost} from './city.ts';
import assert from 'node:assert/strict';
import {initial32 as legacyInitial} from '../life32/state.ts';
import {initial32,validate32} from './state.ts';import {generate32,offer32} from './sources.ts';import {score32,path32,unfinished} from './planner.ts';
import {nextEvent,needsAwakeBudget} from '../engine/scheduler.ts';import {applyEvent} from '../domain/event-log.ts';import {prepareAction} from '../domain/movement.ts';
import type {ActionSpec,WorldEvent} from '../domain/types.ts';
import type {Config32,State32,Result32,Record32,Emit32,Opportunity32,Fact32} from './types.ts';
export class Runtime32 {
 readonly config:Config32; private value:State32;
 constructor(config:Config32,state?:State32){validate32(config);this.config=structuredClone(config);this.value=state?structuredClone(state):config.rules.diversity?initial32(config):legacyInitial(config);}
 get state():State32{return structuredClone(this.value);}
 advance(budget:number):Result32{
  if(!this.config.rules.diversity){const result=new LegacyRuntime(this.config,this.value as import('../life32/types.ts').State32).advance(budget);this.value=result.state;return result;}
  assert.ok(Number.isSafeInteger(budget)&&budget>=0&&budget<=100000);if(!budget)return{state:this.state,records:[]};
  const s=this.value,c=this.config,records:Record32[]=[],ids=c.people.map(p=>p.id).sort();let left=budget;
  const cfg=(id:string)=>c.worlds.find(w=>w.character.id===id)!;
  const emit:Emit32=r=>{const sequence=++s.serial,id='v'+sequence;records.push({...structuredClone(r),id,sequence,time:s.time});return id;};
  const transition=(o:Opportunity32,status:Opportunity32['status'],reason:string)=>{o.status=status;const g=s.goals.find(g=>g.id===o.goal)!;g.status=status;const ref=emit({kind:'plan_'+status,actor:o.actor,causes:[o.createdRef],data:{opportunity:o.id,reason,progress:o.progress}});if(o.kind==='contact'&&['missed','abandoned','declined'].includes(status))s.contactAttempt[o.actor]={at:s.time,ref};};
  const pause=(actor:string,reason:string)=>{const old=s.opportunities.find(o=>o.id===s.activePlan[actor]);if(old&&old.status==='active'&&!old.inFlight)transition(old,'paused',reason);s.activePlan[actor]=null;};
  const commitFact=(actor:string,fact:Fact32,causes:string[])=>{const ref=emit({kind:'fact',actor,causes,fact});for(const id of fact.actors)s.history.push({actor:id,kind:fact.kind,from:fact.from,until:fact.until,ref});return ref;};
  const finish=(o:Opportunity32)=>{
   const flight=o.inFlight!,duration=s.time-flight.startedAt;o.progress+=duration;const p=c.people.find(p=>p.id===o.actor)!,actors=o.participants,names=actors.map(id=>c.people.find(p=>p.id===id)!.name).join('和'),place=cfg(o.actor).places.find(x=>x.id===o.location)!.name;
   let text=`${p.name}在${place}把时间留给${o.subject}。这项安排还没有做完，进度保留到了下一段生活。`;const changes:string[]=[];let semantic:string|null=null;
   const complete=o.progress>=o.minutes;
   if(o.kind==='work'||o.kind==='repair'){s.employerCash-=c.employer.hourlyWageCents*duration/60;assert.ok(s.employerCash>=0);text=`${p.name}在${place}完成了${duration}分钟值班，实际收到${c.employer.hourlyWageCents*duration/6000}元报酬。剩余值班和其他生活安排仍需取舍。`;changes.push('工资由M1结算并从雇主资金扣除');semantic='work:bookstore';}
   if(complete){
    if(o.kind==='observe'){text=`${p.name}走到${place}，花了${duration}分钟观察${o.subject}。这次观察有了可供整理的具体材料。`;changes.push('形成现场观察记忆');}
    if(o.kind==='create'){text=`${p.name}把先前观察到的${o.subject}整理成一份作品，留在${place}供人阅读。作品已经完成，别人的反馈还没有发生。`;changes.push('新作品');}
    if(o.kind==='review'){const work=s.works.find(a=>a.id===o.objectId)!;text=`${p.name}在${place}实际读完了《${work.subject}》。${work.revision===0?'阅读反馈指出：作品已有观察对象，但还缺少现场细节，建议作者补充。':'这次修订补上了现场细节；对方记录了已读反馈，没有继续要求相同修改。'}`;changes.push(work.revision===0?'提出补充细节的反馈':'确认修订已完成');}
    if(o.kind==='revise'){text=`${p.name}根据已经收到的反馈，补充了《${s.works.find(a=>a.id===o.objectId)!.subject}》的现场细节。这份修订仍来自先前的观察，没有凭空增加新的经历。`;changes.push('作品修订完成');}
    if(o.kind==='contact'){const target=c.people.find(p=>p.id===o.objectId)!;text=`${p.name}花了${duration}分钟给${target.name}发出近况交流邀请，约在${cfg(o.actor).places.find(x=>x.id===p.workplace)!.name}见面。邀请已经发出，对方尚未答应。`;changes.push('待回应的邀请');}
    if(o.kind==='social'){text=`${names}在${place}碰面，彼此说了最近的生活安排。这次交流实际占用了双方${duration}分钟，先前的邀请得到履行。`;changes.push('实际相处后关系信任增加','社交需求得到回应');}
    if(o.kind==='water'){text=`${p.name}来到${place}照料缺水的花圃，浇水后土壤水分由${Math.round(s.garden.moisture)}恢复到90。花还需要时间生长。`;changes.push('土壤水分恢复');}
    if(o.kind==='harvest'){text=`${p.name}在${place}采收了已成熟的香草，保留这次收成记录，并让花圃进入下一轮生长。这来自此前的照料和实际生长时间。`;changes.push('收成记录','花圃进入下一轮生长');}
    const detail=cityDescription(c,s,o,duration);if(detail){text=detail.text;changes.push(...detail.changes);}semantic=o.kind==='practice'?'practice:qualification:'+((s.city!.qualification[o.actor]??0)+1):o.semantic;
   }
   const affected=complete&&o.kind==='review'?[s.works.find(a=>a.id===o.objectId)!.owner]:complete&&o.kind==='contact'?[o.objectId!]:[];
   const ref=commitFact(o.actor,{kind:o.kind,title:o.subject,text,actors,affected,location:o.location,from:flight.startedAt,until:s.time,semantic,progress:true,newState:changes,opportunity:o.id},[o.createdRef,...flight.refs]);
   for(const id of actors)s.strain[id]=Math.max(0,s.strain[id]!+(['work','create','revise'].includes(o.kind)?duration: -duration));
   s.goals.find(g=>g.id===o.goal)!.progress=o.progress;o.inFlight=null;
   if(!complete)return;
   transition(o,'completed','all_action_segments_committed');for(const id of actors)if(s.activePlan[id]===o.id)s.activePlan[id]=null;
   for(const actor of new Set([...actors,...affected]))s.memories.push({actor,topic:o.kind,text,source:ref});
   if(o.kind==='observe'){
    s.observed[o.actor]!.push(o.objectId!);if(p.interests.some(i=>['写作','摄影'].includes(i)))offer32(s,emit,{source:'consequence',rule:'life32/observation-work/1',sourceRefs:[ref],sourceKey:'create:'+ref,actor:o.actor,participants:[o.actor],kind:'create',subject:o.subject,location:p.workplace,available:s.time,deadline:s.time+3*1440,minutes:90,objectId:o.objectId,semantic:'create:'+o.subject});
   }
   if(o.kind==='create'){s.works.push({id:'work-'+ref,owner:o.actor,subject:o.subject,location:o.location,revision:0,source:ref,basis:[...o.sourceRefs],feedback:null,reviewer:null});s.skills[o.actor]!++;}
   if(o.kind==='review'){const work=s.works.find(a=>a.id===o.objectId)!;work.feedback=ref;work.reviewer=o.actor;}
   if(o.kind==='revise'){const work=s.works.find(a=>a.id===o.objectId)!;work.basis.push(work.source,work.feedback!);work.source=ref;work.revision++;work.feedback=null;s.skills[o.actor]!++;}
   if(o.kind==='water'){s.garden.moisture=90;s.garden.source=ref;}
   if(o.kind==='harvest'){s.garden.cycle++;s.garden.growth=0;s.garden.stage=0;s.garden.source=ref;}
   if(o.kind==='contact'){
    s.lastContact[o.actor]=s.time;s.socialNeed[o.actor]=0;
    offer32(s,emit,{source:'social',rule:'life32/invitation/1',sourceRefs:[ref],sourceKey:'social:'+ref,actor:o.actor,participants:[o.actor,o.objectId!],kind:'social',subject:'回应'+p.name+'的近况交流邀请',location:p.workplace,available:s.time,deadline:s.time+240,minutes:30,objectId:null,semantic:'social:'+actors[0]+':'+o.objectId});
   }
   cityFinish(c,s,o,ref,emit);
   if(o.kind==='social'){for(const id of actors){s.lastContact[id]=s.time;s.socialNeed[id]=0;}const r=s.relations.find(r=>actors.includes(r.a)&&actors.includes(r.b));if(r){r.trust=Math.min(100,r.trust+3);r.source=ref;}}
  };
  const project=(id:string,e:WorldEvent)=>{const prior=s.worlds[id]!.inProgress?structuredClone(s.worlds[id]!.inProgress):null;applyEvent(s.worlds[id]!,cfg(id),e);if(e.kind==='action_started'&&e.data.action?.spec.kind==='purchase')s.city!.servicesCents+=e.data.action.costCents;emit({kind:'world',actor:id,causes:e.causedBy?[`${id}/${e.causedBy}`]:['initial:'+id],world:e});
   if(e.kind==='action_completed'){
    const binding=s.bindings[id];delete s.bindings[id];if(binding?.opportunity){const o=s.opportunities.find(o=>o.id===binding.opportunity)!;o.inFlight!.done.push(id);o.inFlight!.refs.push(`${id}/${e.id}`);}
    else if(prior){const kind=binding?.kind??prior.spec.kind,p=c.people.find(p=>p.id===id)!;commitFact(id,{kind,title:kind==='move'?'沿实际路线抵达':kind==='eat'?'按需要吃饭':kind==='leisure'?'留一点时间放松':'暂时停留',text:kind==='move'?`${p.name}用了${prior.duration}分钟沿实际路线抵达${cfg(id).places.find(x=>x.id===s.worlds[id]!.locationId)!.name}。`:kind==='eat'?`${p.name}花了${prior.costCents/100}元吃饭，随后再继续生活安排。`:kind==='leisure'?`${p.name}暂时放下手头的事，安静放松${prior.duration}分钟。紧张有所缓解，体力仍需要正常睡眠恢复。`:`${p.name}在原地停留${prior.duration}分钟，这段时间没有形成新的生活成果。`,actors:[id],location:s.worlds[id]!.locationId,from:prior.startedAt,until:s.time,semantic:null,progress:false,newState:[],opportunity:null},[`${id}/${e.id}`]);if(kind==='leisure')s.strain[id]=Math.max(0,s.strain[id]!-60);}
   }
  };
  const start=(id:string,spec:ActionSpec,kind:string,opportunity:string|null)=>{const legal=prepareAction(s.worlds[id]!,cfg(id),spec);assert.ok(typeof legal!=='string',String(legal));const e=nextEvent(s.worlds[id]!,cfg(id),spec);assert.equal(e.kind,'action_started');s.bindings[id]={kind,opportunity};project(id,e);if(['visit','exercise','host','gather'].includes(kind))emit({kind:'scene_opened',actor:id,causes:[...(opportunity?[s.opportunities.find(o=>o.id===opportunity)!.createdRef]:[]),id+'/'+e.id],data:{location:s.worlds[id]!.locationId,activity:kind,from:s.time,until:s.time+legal.duration,identityRequired:'name,gender(male/female),age,personality',policy:'no_automatic_encounter'}});};
  while(true){
   for(const id of ids)while(true){const e=nextEvent(s.worlds[id]!,cfg(id));if(needsAwakeBudget(e)||e.kind==='sleep_advanced')break;project(id,e);}
   for(const o of s.opportunities)if(o.inFlight&&o.participants.every(id=>o.inFlight!.done.includes(id)))finish(o);
   if(!left&&!s.worlds[c.hero]!.sleeping)break;
   for(const o of s.opportunities)if(unfinished(o)&&!o.inFlight){if(s.time>=o.deadline)transition(o,o.progress?'abandoned':'missed','deadline_elapsed');else if(o.kind==='observe'&&o.objectId?.startsWith('garden:')&&o.objectId!==`garden:${s.garden.cycle}:${s.garden.stage}`)transition(o,'abandoned','environment_condition_changed');}
   if(s.lastSourceAt!==s.time){s.lastSourceAt=s.time;generate32(c,s,emit);cityGenerate(c,s,emit);}
   for(const id of ids){const w=s.worlds[id]!,p=c.people.find(p=>p.id===id)!,wc=cfg(id);if(w.inProgress||w.sleeping)continue;
    const decision=cityScore(c,s,id,score32(c,s,id));let chosen=decision.chosen;
    if(w.needs.hungerMinutes>=300||s.strain[id]!>=150)chosen=null;
    decision.chosen=chosen;emit({kind:'decision',actor:id,causes:decision.goals.map(g=>s.goals.find(x=>x.id===g)!.source),decision});
    if(!chosen){if(decision.reason!=='waiting_for_partner')pause(id,decision.reason);let spec:ActionSpec={kind:'idle',duration:Math.max(1,Math.min(30,wc.sleepAfterMinutes-w.fatigue))},kind='waiting';
     if(w.needs.hungerMinutes>=300&&w.cashCents>=wc.mealCostCents){spec={kind:'eat',duration:20,amountCents:wc.mealCostCents};kind='eat';}
     else if(s.strain[id]!>=150){kind='leisure';}
     else if(w.locationId!==p.home&&w.fatigue>=wc.sleepAfterMinutes-90){const route=path32(c,s,id,p.home)?.[0];if(route&&route.costCents<=w.cashCents){spec={kind:'move',routeId:route.id};kind='move';}}
     if(kind==='waiting'&&spec.kind==='idle'){const ready=s.opportunities.filter(o=>o.participants.length>1&&unfinished(o)&&o.participants.includes(id)&&o.location===w.locationId).flatMap(o=>o.participants.filter(x=>x!==id).map(x=>s.worlds[x]!.inProgress)).filter(a=>!!a).map(a=>a!.duration-a!.elapsed).filter(n=>n>0);if(ready.length)spec.duration=Math.min(spec.duration,...ready);}
     start(id,spec,kind,null);continue;
    }
    const o=s.opportunities.find(o=>o.id===chosen)!;
    if(s.activePlan[id]!==o.id){pause(id,'higher_priority_or_deadline');if(o.status==='paused')emit({kind:'plan_resumed',actor:id,causes:[o.createdRef],data:{opportunity:o.id,progress:o.progress}});o.status='active';s.activePlan[id]=o.id;s.goals.find(g=>g.id===o.goal)!.status='active';}
    if(w.locationId!==o.location){const route=path32(c,s,id,o.location)![0]!;start(id,{kind:'move',routeId:route.id},'move',null);continue;}
    if(o.participants.length>1){
     const unwilling=o.participants.find(other=>{const q=c.people.find(p=>p.id===other)!;return other!==o.actor&&q.personality.E+q.personality.F<35;});
     if(unwilling){transition(o,'declined','participant_preference:'+unwilling);continue;}
     if(o.participants.some(other=>s.worlds[other]!.inProgress||s.worlds[other]!.sleeping||s.worlds[other]!.locationId!==o.location))continue;
    }
    const duration=Math.min(['work','repair'].includes(o.kind)?60:30,o.minutes-o.progress);
    o.inFlight={startedAt:s.time,done:[],refs:[]};
    for(const member of [...o.participants].sort()){pause(member,'accepted_joint_or_current_plan');s.activePlan[member]=o.id;o.status='active';const spec:ActionSpec=['work','repair'].includes(o.kind)?{kind:'receive',duration,amountCents:c.employer.hourlyWageCents*duration/60,source:'employer:'+o.createdRef}:cityCost(o)>0?{kind:'purchase',locationId:o.location,duration,amountCents:cityCost(o),itemId:'service:'+o.id}:{kind:'idle',duration};start(member,spec,o.kind,o.id);}
   }
   // A declined invitation can leave an actor idle until this same minute's fallback.
   for(const id of ids)if(!s.worlds[id]!.sleeping&&!s.worlds[id]!.inProgress)start(id,{kind:'idle',duration:1},'waiting',null);
   const awake=!s.worlds[c.hero]!.sleeping;
   for(const id of ids){const sleeping=!!s.worlds[id]!.sleeping,e=nextEvent(s.worlds[id]!,cfg(id));if(e.kind==='sleep_advanced')e.data.duration=1;else assert.equal(e.kind,'awake_minute');project(id,e);if(!sleeping)s.socialNeed[id]!++;}
   cityTick(c,s);s.time++;if(awake)left--;
   if(c.rules.environment){s.garden.moisture=Math.max(0,s.garden.moisture-100/c.rules.gardenDryMinutes);if(s.garden.moisture>20)s.garden.growth=Math.min(c.rules.growthMinutes,s.garden.growth+1);const stage=Math.min(2,Math.floor(s.garden.growth/(c.rules.growthMinutes/2)));if(stage!==s.garden.stage){s.garden.stage=stage;s.garden.source=emit({kind:'garden_growth',actor:'world',causes:[s.garden.source],data:{stage,healthyMinutes:s.garden.growth,cycle:s.garden.cycle}});}}
   assert.ok(Object.values(s.worlds).every(w=>w.time===s.time));
  }
  return{state:this.state,records};
 }
}
