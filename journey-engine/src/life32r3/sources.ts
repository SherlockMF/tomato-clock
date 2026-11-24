import {relationship} from '../journey/relationship.ts';
import {currentPersonality} from '../journey/personality.ts';
import {localMinute} from '../domain/time.ts';
import type {Activity,Config32,State32,Emit32,Opportunity32} from './types.ts';
// offer32 allocates o1, o2, ... in append order, including in persisted M3.2 snapshots.
export function opportunity32(s:State32,id:string|null|undefined):Opportunity32|undefined {
 if(!id)return undefined;
 const byOrdinal=s.opportunities[Number(id.slice(1))-1];
 return byOrdinal?.id===id?byOrdinal:s.opportunities.find(o=>o.id===id);
}
export function offer32(s:State32,emit:Emit32,input:Omit<Opportunity32,'id'|'progress'|'status'|'createdRef'|'goal'|'inFlight'>):void{
 if(s.consumed.includes(input.sourceKey))return;
 const id='o'+(s.opportunities.length+1),o:Opportunity32={...input,id,progress:0,status:'pending',createdRef:'',goal:'g-'+id,inFlight:null};
 const ref=emit({kind:'opportunity_created',actor:o.actor,causes:o.sourceRefs,opportunity:structuredClone(o)});o.createdRef=ref;s.opportunities.push(o);s.consumed.push(o.sourceKey);
 s.goals.push({id:o.goal,actor:o.actor,text:o.subject,level:'stage',status:'pending',source:ref,progress:0,target:o.minutes});
}
export function generate32(c:Config32,s:State32,emit:Emit32):void{
 if(!s.goals.length)for(const p of c.people){const ref=emit({kind:'direction',actor:p.id,causes:['initial:'+p.id],data:{direction:p.direction,interests:p.interests}});s.goals.push({id:'direction-'+p.id,actor:p.id,text:p.direction,level:'direction',status:'active',source:ref,progress:0,target:0});}
 const add=(actor:string,kind:Activity,subject:string,location:string,sourceKey:string,source:Opportunity32['source'],refs:string[],minutes:number,objectId:string|null=null,participants=[actor],deadline=s.time+3*1440)=>offer32(s,emit,{actor,kind,subject,location,sourceKey,source,sourceRefs:refs,rule:'life32/'+kind+'/1',minutes,objectId,participants,available:s.time,deadline,semantic:kind+':'+subject.replace(/第\d+轮/g,'周期')});
 if(c.rules.feedback)for(const work of [...s.works]){
  if(work.feedback===null){const reviewer=c.people.filter(p=>p.id!==work.owner&&p.role==='npc'&&(p.interests.includes('写作')||p.interests.includes('摄影'))).sort((a,b)=>currentPersonality(b,s).N-currentPersonality(a,s).N||a.id.localeCompare(b.id))[0];if(reviewer)add(reviewer.id,'review','阅读《'+work.subject+'》并提出观察缺口',work.location,'review:'+work.id+':'+work.revision,'consequence',[work.source],30,work.id);}
  else if(work.revision===0)add(work.owner,'revise','补足《'+work.subject+'》中的现场细节',work.location,'revise:'+work.id,'consequence',[work.source,work.feedback],90,work.id);
 }
 for(const p of c.people){
  if(c.rules.social&&!s.worlds[p.id]!.sleeping&&s.worlds[p.id]!.fatigue<c.worlds.find(w=>w.character.id===p.id)!.sleepAfterMinutes-30&&s.time-s.contactAttempt[p.id]!.at>=c.rules.socialAfter&&s.socialNeed[p.id]!>=c.rules.socialAfter&&!s.opportunities.some(o=>o.actor===p.id&&['contact','social'].includes(o.kind)&&['pending','active','paused'].includes(o.status))){
   const target=c.people.filter(q=>q.id!==p.id && ((c.journeyRevision??0)<5 || (relationship(s,p.id,q.id)?.distance?.misses??0)<2)).sort((a,b)=>Number(s.worlds[b.id]!.locationId===s.worlds[p.id]!.locationId)-Number(s.worlds[a.id]!.locationId===s.worlds[p.id]!.locationId)||s.lastContact[a.id]!-s.lastContact[b.id]!||a.id.localeCompare(b.id))[0]!;
   if(!target)continue;
   const missed=(c.journeyRevision??0)>=5?relationship(s,p.id,target.id)?.distance:undefined;
   const memory=s.memories.filter(m=>m.actor===p.id&&m.topic==='contact').at(-1);
   add(p.id,'contact',(missed?'上次没能见面，再联系':'联系')+target.name+'，约一次近况交流',s.worlds[p.id]!.locationId,'contact:'+p.id+':'+s.lastContact[p.id]+':'+s.contactAttempt[p.id]!.ref,'social',[...(memory?[memory.source]:['initial:'+p.id]),s.contactAttempt[p.id]!.ref,...(missed?[missed.source]:[])],15,target.id,[p.id],s.time+360);
  }
 }
 if(!c.rules.environment)return;
 const w=c.worlds[0]!,day=Math.floor((s.time+w.timezoneOffsetMinutes)/1440),minute=localMinute(s.time,w.timezoneOffsetMinutes);
 if(minute>=540&&minute<1020&&s.lastShiftDay!==day){s.lastShiftDay=day;const ref=emit({kind:'venue_opened',actor:'world',causes:['initial:employer'],data:{day,location:c.employer.location,remainingFunds:s.employerCash}});
  for(const p of c.people)add(p.id,'work',(['完成书店当日实际值班','按分类笔记核对旧书库存','复核库存并完成差错交接','独立负责值班与交接核查'][s.development![p.id]!.careerLevel]!),c.employer.location,'work:'+p.id+':'+day,'environment',[ref],c.rules.maxWorkMinutes,null,[p.id],s.time+1020-minute);
 }
 if(s.garden.moisture<=40&&!s.consumed.includes('dry:'+s.garden.source)&&!s.opportunities.some(o=>o.kind==='water'&&['pending','active','paused'].includes(o.status))){
  const gardener=c.people.toSorted((a,b)=>Number(b.interests.includes('园艺'))-Number(a.interests.includes('园艺'))||a.id.localeCompare(b.id))[0]!;
  const ref=emit({kind:'garden_dry',actor:'world',causes:[s.garden.source],data:{moisture:s.garden.moisture,cycle:s.garden.cycle}});s.garden.source=ref;s.consumed.push('dry:'+ref);
  add(gardener.id,'water','为缺水的社区花圃浇水',c.garden.location,'water:'+ref,'environment',[ref],30);
 }
 if(s.garden.stage===2&&!s.opportunities.some(o=>o.kind==='harvest'&&o.objectId===String(s.garden.cycle))){
  const gardener=c.people.find(p=>p.interests.includes('园艺'))??c.people[0]!;add(gardener.id,'harvest','收获社区花圃的成熟香草',c.garden.location,'harvest:'+s.garden.cycle,'environment',[s.garden.source],30,String(s.garden.cycle));
 }
 for(const p of c.people){
  const subject=['花圃的新芽','花圃的花蕾','可采收的香草'][s.garden.stage]!;
  add(p.id,'observe',subject,c.garden.location,`observe:${p.id}:${s.garden.stage}`,'environment',[s.garden.source],30,`garden:${s.garden.cycle}:${s.garden.stage}`);
 }
}
