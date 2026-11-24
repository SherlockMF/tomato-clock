import {localMinute} from '../domain/time.ts';
import {offer32} from './sources.ts';
import {path32} from './planner.ts';
import type {Activity,Config32,State32,Opportunity32,Emit32,Decision32} from './types.ts';

export function domain32(kind:string):string {
 if(['care','supplies','eat'].includes(kind))return 'personal';
 if(['exercise','leisure'].includes(kind))return 'health';
 if(['practice','repair','work'].includes(kind))return 'career';
 if(['host','gather','collaborate','contact','social'].includes(kind))return 'social';
 if(['create','review','revise'].includes(kind))return 'creative';
 if(['visit','observe'].includes(kind))return 'exploration';
 if(['water','harvest'].includes(kind))return 'maintenance';
 return kind;
}
const active=(o:Opportunity32)=>['pending','active','paused'].includes(o.status);
export const cityCost=(o:Opportunity32)=>o.progress===0?(o.kind==='supplies'?1500:o.kind==='practice'?1200:0):0;
const subjects:Record<string,string>={park:'河岸步道与公共座椅',community:'邻里活动室的展示空间',workshop:'工坊工具与维修台',market:'生活用品的陈列与价格'};

export function cityGenerate(c:Config32,s:State32,emit:Emit32):void {
 const city=s.city!;
 const add=(actor:string,kind:Activity,subject:string,location:string,key:string,causes:string[],minutes=30,objectId:string|null=null,participants=[actor],deadline=s.time+3*1440)=>{
  if(s.opportunities.some(o=>o.actor===actor&&o.kind===kind&&active(o)))return;
  const ongoingNeed=['care','supplies','exercise','practice','visit'].includes(kind);
  offer32(s,emit,{actor,kind,subject,location,sourceKey:key,source:kind==='host'||kind==='gather'||kind==='collaborate'?'social':kind==='repair'?'consequence':'environment',rule:'life32r2/'+kind+'/1',sourceRefs:causes,participants,available:s.time,deadline:ongoingNeed?Number.MAX_SAFE_INTEGER:deadline,minutes,objectId,semantic:kind+':'+subject});
 };
 for(const p of c.people){
  const id=p.id,w=s.worlds[id]!,last=s.history.findLast(h=>h.actor===id)?.ref??'initial:'+id;
  if(city.care[id]!<=45){
   if(city.supplies[id]!>0)add(id,'care','洗换衣物，整理自己的生活空间',p.home,'care:'+id+':'+city.careSource[id],[city.careSource[id]!,last]);
   else add(id,'supplies','补足已经用完的洗护用品','market','supplies:'+id+':'+city.careSource[id],[city.careSource[id]!,last]);
  }
  if(city.movement[id]!>=120)add(id,'exercise','沿河岸步道活动身体','park','exercise:'+id+':'+city.movementSource[id],[city.movementSource[id]!,last],60);
  for(const location of Object.keys(subjects))if(!city.visited[id]!.includes(location))
   add(id,'visit','走进'+subjects[location],location,'visit:'+id+':'+location,['initial:city-map',last],30,location);
  if((p.interests.includes('工作')||p.id==='lin')&&city.qualification[id]!<2)
   add(id,'practice','在工坊练习安全检查与紧固','workshop','practice:'+id+':'+city.qualification[id],[city.careerSource[id]!],60);
  if(city.wear>=80&&city.qualification[id]!>=2&&!s.opportunities.some(o=>o.kind==='repair'&&active(o)))
   add(id,'repair','维修使用后松动的公园座椅','park','repair:'+city.wearSource,[city.wearSource,city.careerSource[id]!],60);
  const work=s.works.find(a=>a.owner===id&&!city.hosted.includes(a.id)&&!a.subject.startsWith('合写：'));
  if(c.rules.social&&work&&s.socialNeed[id]!>=240&&(p.role==='npc'||p.personality.E>=45))
   add(id,'host','为《'+work.subject+'》准备一次邻里交流','community','host:'+work.id,[work.source],60,work.id);
  // A quiet hour is allowed; these sources do not depend on a focus-window counter.
  if(w.sleeping)continue;
 }
}

export function cityTick(c:Config32,s:State32):void {
 for(const p of c.people)if(!s.worlds[p.id]!.sleeping){s.city!.care[p.id]=Math.max(0,s.city!.care[p.id]!-1/20);if(['create','review','revise','host','gather','collaborate','work','waiting','contact','social'].includes(s.bindings[p.id]?.kind??''))s.city!.movement[p.id]=Math.min(360,s.city!.movement[p.id]!+1/2);}
}

export function cityDescription(c:Config32,s:State32,o:Opportunity32,duration:number):{text:string;changes:string[]}|null {
 const p=c.people.find(p=>p.id===o.actor)!,place=c.worlds[0]!.places.find(v=>v.id===o.location)!.name,city=s.city!;
 const workSubject=['host','gather'].includes(o.kind)?s.works.find(w=>w.id===o.objectId)!.subject:'';
 const descriptions:Partial<Record<Activity,[string,string[]]>>={
  care:[`${p.name}回到${place}，用已经备好的洗护用品洗换衣物、收拾生活空间。手边的用品少了一份，日常维护的需要得到缓解。`,['个人维护恢复','消耗一份洗护用品']],
  supplies:[`${p.name}到${place}花15元补充三份洗护用品。购买来自用品已经用完的需要，没有把消费写成意外收获。`,['实付15元','洗护用品补足三份']],
  exercise:[`${p.name}在${place}沿步道活动了${o.minutes}分钟，也使用了公共座椅。离开座位后，久坐的需要得到缓解；公共设施留下了实际使用损耗。`,['身体活动需求缓解','设施使用损耗增加']],
  visit:[`${p.name}第一次走进${place}，花${duration}分钟熟悉${subjects[o.location]}。这个地点从地图上的名字变成了亲自到过的地方，之后的安排可以参考这段经历。`,['地点已亲自探访','留下场所观察材料']],
  practice:[`${p.name}在${place}完成了一小时安全检查与紧固练习，实际支付12元使用费。${city.qualification[o.actor]===0?'基础练习留下了记录，还不能独立接手维修。':'此前的基础练习加上这次操作，满足了实验场所的维修资格要求。'}`,['完成实际操作练习']],
  repair:[`${p.name}来到${place}，用一小时处理使用后松动的座椅。先前取得的实践资格使这项维修可执行；完成后从有限维护经费收到${c.employer.hourlyWageCents/100}元，座椅磨损恢复为零。`,['公共座椅修复','维护经费支付报酬']],
  host:[`${p.name}根据已经完成的《${workSubject}》，在${place}用一小时整理一份展示和交流材料。准备完成才发出邀请，交流本身尚未发生。`,['真实展示准备完成']],
  gather:[`${o.participants.map(id=>c.people.find(p=>p.id===id)!.name).join('和')}在${place}一起看了《${workSubject}》，交流持续一小时。作品来自作者已发生的观察，参与者把这次共同经历记了下来。`,['共同阅读真实作品','关系得到实际相处支持']],
  collaborate:[`${o.participants.map(id=>c.people.find(p=>p.id===id)!.name).join('和')}在${place}把此前交流过的作品和各自已有材料放在一起，完成一份合写记录。它保留两个来源，合作发生在双方实际到场之后。`,['形成有双方材料来源的合写记录']]
 };
 const found=descriptions[o.kind];return found?{text:found[0],changes:found[1]}:null;
}

export function cityFinish(c:Config32,s:State32,o:Opportunity32,ref:string,emit:Emit32):void {
 const city=s.city!,p=c.people.find(p=>p.id===o.actor)!;
 const add=(kind:Activity,subject:string,location:string,objectId:string|null,participants:string[],minutes:number,causes:string[])=>offer32(s,emit,{actor:o.actor,kind,subject,location,objectId,participants,minutes,available:s.time,deadline:s.time+2*1440,source:'consequence',rule:'life32r2/'+kind+'/1',sourceRefs:causes,sourceKey:kind+':'+causes.join(':'),semantic:kind+':'+subject});
 if(o.kind==='care'){city.care[o.actor]=100;city.supplies[o.actor]!--;city.careSource[o.actor]=ref;}
 if(o.kind==='supplies'){city.supplies[o.actor]=3;city.careSource[o.actor]=ref;}
 if(o.kind==='exercise'){city.movement[o.actor]=0;city.movementSource[o.actor]=ref;city.fitness[o.actor]!++;city.wear=Math.min(100,city.wear+20);city.wearSource=ref;}
 if(o.kind==='visit'){
  city.visited[o.actor]!.push(o.location);
  if(p.interests.some(i=>['写作','摄影'].includes(i)))add('create',subjects[o.location]!,p.workplace,ref,[o.actor],90,[ref]);
 }
 if(o.kind==='practice'){city.qualification[o.actor]!++;city.careerSource[o.actor]=ref;}
 if(o.kind==='repair'){city.wear=0;city.wearSource=ref;city.careerSource[o.actor]=ref;}
 if(o.kind==='host'){
  city.hosted.push(o.objectId!);city.exhibits[o.objectId!]={work:o.objectId!,source:ref,location:o.location};
  const other=c.people.filter(q=>q.id!==o.actor).sort((a,b)=>(s.relations.find(r=>[r.a,r.b].includes(o.actor)&&[r.a,r.b].includes(b.id))?.trust??0)-(s.relations.find(r=>[r.a,r.b].includes(o.actor)&&[r.a,r.b].includes(a.id))?.trust??0)||a.id.localeCompare(b.id))[0]!;
  add('gather','一起阅读《'+s.works.find(w=>w.id===o.objectId)!.subject+'》','community',o.objectId,[o.actor,other.id],60,[ref]);
 }
 if(o.kind==='gather'||o.kind==='collaborate'){
  for(const id of o.participants){s.socialNeed[id]=0;s.lastContact[id]=s.time;}
  const r=s.relations.find(r=>o.participants.includes(r.a)&&o.participants.includes(r.b));if(r){r.trust=Math.min(100,r.trust+5);r.source=ref;}
 }
 if(o.kind==='gather'){
  city.shared.push(o.objectId!);const own=s.works.find(w=>w.id===o.objectId)!,other=s.works.find(w=>o.participants.includes(w.owner)&&w.owner!==own.owner&&w.subject!==own.subject&&!w.subject.startsWith('合写：'));
  if(other&&!s.consumed.includes('pair:'+own.id+':'+other.id)){s.consumed.push('pair:'+own.id+':'+other.id);add('collaborate','合写：'+own.subject+'与'+other.subject,'cafe',own.id,o.participants,60,[ref,own.source,other.source]);}
 }
 if(o.kind==='collaborate')s.works.push({id:'work-'+ref,owner:o.actor,subject:o.subject,location:o.location,revision:0,source:ref,basis:[...o.sourceRefs],feedback:null,reviewer:null});
}

export function cityScore(c:Config32,s:State32,id:string,d:Decision32):Decision32 {
 const city=s.city!,p=c.people.find(p=>p.id===id)!,w=s.worlds[id]!,cfg=c.worlds.find(w=>w.character.id===id)!;
 for(const candidate of d.candidates){
  const o=s.opportunities.find(o=>o.id===candidate.id)!;
  const travelCost=path32(c,s,id,o.location)?.reduce((sum,r)=>sum+r.costCents,0)??Infinity;
  if(cityCost(o)+travelCost>w.cashCents)candidate.reasons.push('activity_unaffordable');
  if(o.kind==='gather'&&city.exhibits[o.objectId!]?.location!==o.location)candidate.reasons.push('display_material_missing');
  if(o.kind==='care'&&city.supplies[id]!<=0)candidate.reasons.push('supplies_missing');
  if(o.kind==='repair'&&(city.wear<80||city.qualification[id]!<2))candidate.reasons.push('repair_condition_missing');
  const reserved=Object.values(s.bindings).filter(b=>['work','repair'].includes(b.kind)).length*c.employer.hourlyWageCents;
  if(['work','repair'].includes(o.kind)&&s.employerCash-reserved<c.employer.hourlyWageCents)candidate.reasons.push('employer_insufficient_funds');
  const chunk=Math.min(['work','repair'].includes(o.kind)?60:30,o.minutes-o.progress),minute=localMinute(s.time+Math.max(0,candidate.travelMinutes),cfg.timezoneOffsetMinutes),venue=cfg.places.find(x=>x.id===o.location)!;
  if(minute+chunk>venue.closeMinute)candidate.reasons.push('venue_closed');
  if(s.time+Math.max(0,candidate.travelMinutes)+chunk>o.deadline)candidate.reasons.push('deadline_unreachable');
  if(o.participants.length>1&&w.locationId===o.location)for(const member of o.participants.filter(x=>x!==id)){const other=s.worlds[member]!,otherCfg=c.worlds.find(w=>w.character.id===member)!;if(other.inProgress||other.sleeping||other.locationId!==o.location||other.fatigue+chunk>otherCfg.sleepAfterMinutes||other.needs.hungerMinutes>=300)candidate.reasons.push('participant_not_ready');}
  const spent=s.history.filter(h=>h.actor===id&&h.until>s.time-720&&domain32(h.kind)===domain32(o.kind)).reduce((n,h)=>n+h.until-h.from,0);
  const waitingPartner=o.participants.some(member=>member!==id&&s.activePlan[member]===o.id&&s.worlds[member]!.locationId===o.location);
  const extra={qualificationForDemand:o.kind==='practice'&&city.wear>=80?65:0,lifeNeed:o.kind==='care'?100-city.care[id]!:o.kind==='supplies'?80:o.kind==='exercise'?city.movement[id]!/2:0,personalDirection:o.kind==='visit'?(p.direction==='traveler'?90:10):o.kind==='practice'?(p.direction==='low_assets'?100:40):o.kind==='repair'?95:o.kind==='host'||o.kind==='gather'?70+p.personality.E/5:o.kind==='collaborate'?60:0,domainBalance:spent>180?-(spent-180)*.4:0,rendezvous:waitingPartner?120:0,travelCommitment:s.activePlan[id]===o.id&&w.locationId!==o.location?40:0};
  Object.assign(candidate.factors,extra);candidate.score=Object.values(candidate.factors).reduce((n,v)=>n+v,0);candidate.reasons=[...new Set(candidate.reasons)];
 }
 const commitment=s.opportunities.find(o=>o.id===s.activePlan[id]),candidate=d.candidates.find(x=>x.id===commitment?.id);
 const arrived=s.history.findLast(h=>h.actor===id&&h.kind==='move')?.until??commitment?.available??s.time;
 if(commitment&&commitment.participants.length>1&&w.locationId===commitment.location&&candidate?.reasons.length&&candidate.reasons.every(x=>x==='participant_not_ready')&&s.time-arrived<90&&commitment.participants.every(member=>!s.worlds[member]!.sleeping)&&!['physiological_need','mental_recovery'].includes(d.reason)){d.chosen=null;d.reason='waiting_for_partner';return d;}
 const best=d.candidates.filter(x=>!x.reasons.length&&x.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))[0];d.chosen=best?.id??null;
 if(!['physiological_need','mental_recovery'].includes(d.reason))d.reason=best?'highest_feasible_score':!d.candidates.length?'no_candidates':d.candidates.every(x=>x.reasons.length)?'all_candidates_blocked':'nonpositive_scores';
 return d;
}
