import {rememberMiss} from '../journey/relationship.ts';
import {currentPersonality} from '../journey/personality.ts';
import {mealPrice} from '../journey/provisions.ts';
import {opportunity32} from './sources.ts';
import {localMinute} from '../domain/time.ts';
import {canReachBed} from '../journey/lodging.ts';
import {cityCost} from './city.ts';
import {activityHours,consecutiveWait,unfinished,path32,plannedRoute32} from './planner.ts';
import type {Config32,State32,Decision32,Opportunity32,Emit32,Stop32,Itinerary32} from './types.ts';

export function scheduleMeetings(c:Config32,s:State32,emit:Emit32):void {
 for(const ap of Object.values(s.appointments!)){
  const o=opportunity32(s,ap.opportunity)!;
  if(unfinished(o)&&!o.inFlight&&s.time+o.minutes-o.progress>ap.end){o.status='missed';s.goals.find(g=>g.id===o.goal)!.status='missed';const ref=emit({kind:'plan_missed',actor:o.actor,causes:[ap.source],data:{opportunity:o.id,reason:'shared_time_elapsed'}});rememberMiss(c,s,o,ref,emit);}
 }
 for(const o of s.opportunities.filter(o=>unfinished(o)&&o.participants.length>1&&!s.appointments![o.id])){
  let start=Math.max(s.time,o.available);const reasons:string[]=[],mealActors:string[]=[],travelByActor:Record<string,number>={},readyByActor:Record<string,number>={};
  for(const id of o.participants){
   const w=s.worlds[id]!,cfg=c.worlds.find(w=>w.character.id===id)!,p=c.people.find(p=>p.id===id)!;
   const busy=w.inProgress? w.inProgress.duration-w.inProgress.elapsed:0;
   const from=w.inProgress?.to??w.locationId,path=plannedRoute32(c,id,from,o.location,w.cashCents),travel=path?.reduce((n,r)=>n+r.duration,0)??Infinity;
   let ready=s.time+busy+travel;
   if(w.sleeping||w.fatigue+busy+travel+o.minutes-o.progress>cfg.sleepAfterMinutes)reasons.push('sleep_conflict');
   if(!path||path.reduce((n,r)=>n+r.costCents,0)>w.cashCents)reasons.push('travel_unaffordable');
   const traits=currentPersonality(p,s);
   if(traits.E+traits.F<35)reasons.push('participant_preference');
   let lastTravel=travel;
   for(const appointment of Object.values(s.appointments!).filter(ap=>ap.participants.includes(id)&&ap.end>s.time&&unfinished(opportunity32(s,ap.opportunity)!)).sort((a,b)=>a.end-b.end)){
    const previous=opportunity32(s,appointment.opportunity)!;
    const between=plannedRoute32(c,id,previous.location,o.location,w.cashCents);lastTravel=between?.reduce((n,r)=>n+r.duration,0)??Infinity;
    ready=Math.max(ready,appointment.end+lastTravel);
   }
   travelByActor[id]=lastTravel;
   readyByActor[id]=ready;
   if(w.needs.hungerMinutes+ready-s.time>=260){ready+=20;mealActors.push(id);}
   start=Math.max(start,ready);
  }
  const cfg=c.worlds[0]!,venue=activityHours(c,o.actor,o),minute=localMinute(start,cfg.timezoneOffsetMinutes);
  if(minute<venue.openMinute)start+=venue.openMinute-minute;
  for(let pass=0;pass<o.participants.length;pass++){
   const needMeal=o.participants.filter(id=>!mealActors.includes(id)&&s.worlds[id]!.needs.hungerMinutes+start-s.time>=260);
   if(!needMeal.length)break;
   for(const id of needMeal){mealActors.push(id);start=Math.max(start,readyByActor[id]!+20);}
  }
  const end=start+o.minutes-o.progress;
  for(const id of o.participants){const cfg=c.worlds.find(w=>w.character.id===id)!,w=s.worlds[id]!;if(w.needs.hungerMinutes+end-s.time>=300&&w.cashCents<mealPrice(s,id,cfg.mealCostCents))reasons.push('food_unaffordable');}
  if(localMinute(start,cfg.timezoneOffsetMinutes)+(end-start)>venue.closeMinute||end>o.deadline||start-s.time>180)reasons.push('appointment_conflict');
  for(const id of o.participants){const w=s.worlds[id]!,cfg=c.worlds.find(w=>w.character.id===id)!;if(w.fatigue+end-s.time>cfg.sleepAfterMinutes)reasons.push('sleep_conflict');}
  if(reasons.length){
   o.status='declined';s.goals.find(g=>g.id===o.goal)!.status='declined';
   const ref=emit({kind:'plan_declined',actor:o.actor,causes:[o.createdRef],data:{opportunity:o.id,reason:[...new Set(reasons)].join(','),alternative:'保留原有安排；后续由社交需要重新联系'}});
   // A rejected invitation is a concrete choice, not a completed meeting or automatic relationship gain.
   emit({kind:'fact',actor:o.actor,causes:[ref],fact:{kind:'choice',title:'这次没有约成',text:`${o.participants.map(id=>c.people.find(p=>p.id===id)!.name).join('和')}没有接受这次“${o.subject}”的约见：${reasons.includes('sleep_conflict')?'共同空闲时间与休息冲突':reasons.includes('travel_unaffordable')?'路费超过现有现金':reasons.includes('participant_preference')?'对方选择保留自己的时间':'已有约定或场所开放时间不允许'}。原有安排保留，没有把邀请记成已经见面。`,actors:o.participants,location:o.location,from:s.time,until:s.time,semantic:null,progress:false,newState:['约见未成立'],opportunity:o.id}});
   continue;
  }
  const ref=emit({kind:'appointment_created',actor:o.actor,causes:[o.createdRef],data:{opportunity:o.id,start,end,participants:o.participants}});
  s.appointments![o.id]={opportunity:o.id,start,end,participants:o.participants,source:ref,mealAt:Object.fromEntries(mealActors.map(id=>[id,start-travelByActor[id]!-20]))};
 }
}

export function appointmentMealDue(s:State32,id:string):boolean {
 return Object.values(s.appointments!).some(ap=>ap.participants.includes(id)&&!ap.mealsCompleted?.includes(id)&&ap.mealAt?.[id]!==undefined&&ap.mealAt[id]!<=s.time&&ap.start>s.time&&unfinished(opportunity32(s,ap.opportunity)!));
}

function fit(c:Config32,s:State32,id:string,o:Opportunity32,location:string,time:number,cash:number,horizon:number,blocked?:string[]):Stop32|null {
 const reject=(reason:string)=>{blocked?.push(reason);return null;};
 const cfg=c.worlds.find(w=>w.character.id===id)!,w=s.worlds[id]!,p=c.people.find(p=>p.id===id)!,path=plannedRoute32(c,id,location,o.location,cash);
 if(!path||o.inFlight||!unfinished(o))return reject(!path?'no_route':o.inFlight?'in_progress':'opportunity_ended');
 const travel=path.reduce((n,r)=>n+r.duration,0),cost=path.reduce((n,r)=>n+r.costCents,0)+cityCost(o);
 const mealReserve=w.needs.hungerMinutes+time-s.time+travel+Math.min(240,o.minutes-o.progress)>=300?mealPrice(s,id,cfg.mealCostCents):0;
 if(cost>cash||(cost>0&&cost+mealReserve>cash))return reject(cost>cash?'activity_unaffordable':'meal_reserve_unaffordable');
 const arrival=time+travel,venue=activityHours(c,id,o);
 let start=Math.max(arrival,o.available),minute=localMinute(start,cfg.timezoneOffsetMinutes);
 const opening=Math.max(venue.openMinute,o.kind==='work'?p.shift[0]:0),closing=Math.min(venue.closeMinute,o.kind==='work'?p.shift[1]:1440);
 if(minute<opening){start+=opening-minute;minute=opening;}
 const appointment=s.appointments![o.id];if(appointment)start=Math.max(start,appointment.start);
 const remaining=o.minutes-o.progress,chunk=['work','repair'].includes(o.kind)?60:30;
 let capacity=Math.min(horizon-start,closing-localMinute(start,cfg.timezoneOffsetMinutes),o.deadline-start);
 for(const ap of Object.values(s.appointments!))if(ap.opportunity!==o.id&&ap.participants.includes(id)&&ap.end>start&&unfinished(opportunity32(s,ap.opportunity)!)){
  const other=opportunity32(s,ap.opportunity)!,travel=plannedRoute32(c,id,o.location,other.location,cash-cost)?.reduce((n,r)=>n+r.duration,0)??Infinity;
  capacity=Math.min(capacity,Math.min(ap.start-travel,ap.mealAt?.[id]??Infinity)-start);
 }
 const duration=o.participants.length>1?remaining:Math.min(remaining,(c.localActivities&&remaining<=capacity?remaining:Math.floor(capacity/chunk)*chunk));
 if(duration<=0)return reject('no_time_before_commitment_or_close');
 const end=start+duration;
 if(appointment&&end>appointment.end)return reject('appointment_time_unreachable');
 if(start-arrival>45)return reject('opening_or_appointment_too_far');
 if(minute+duration>closing||localMinute(start,cfg.timezoneOffsetMinutes)+duration>closing)return reject('venue_closed');
 if(end>o.deadline||end>horizon||w.fatigue+end-s.time>cfg.sleepAfterMinutes)return reject('time_budget_exceeded');
 if(c.journey){
  const cashAfter=cash-cost, reserve=mealReserve<=cashAfter?mealReserve:0;
  if(!canReachBed(cfg,o.location,cashAfter-reserve,cfg.sleepAfterMinutes-w.fatigue-(end-s.time)))return reject('lodging_unreachable');
  for(const member of o.participants){
   if(member===id)continue;
   const other=s.worlds[member]!,otherCfg=c.worlds.find(v=>v.character.id===member)!;
   const path=plannedRoute32(c,member,other.locationId,o.location,other.cashCents);
   if(!path||!canReachBed(otherCfg,o.location,other.cashCents-path.reduce((sum,leg)=>sum+leg.costCents,0),otherCfg.sleepAfterMinutes-other.fatigue-(end-s.time)))return reject('lodging_unreachable');
  }
 }
 for(const ap of Object.values(s.appointments!))if(ap.opportunity!==o.id&&ap.participants.includes(id)&&ap.end>s.time&&unfinished(opportunity32(s,ap.opportunity)!)){
  const next=opportunity32(s,ap.opportunity)!,route=plannedRoute32(c,id,o.location,next.location,cash-cost),leg=route?.reduce((n,r)=>n+r.duration,0)??Infinity;
  const reservedStart=Math.min(ap.start-leg,ap.mealAt?.[id]??Infinity);
  if(start<ap.end&&end>reservedStart)return reject('appointment_conflict');
 }
 if(o.participants.length>1&&!appointment)return reject('appointment_not_accepted');
 return{opportunity:o.id,arrival,start,end};
}

export function canStartLocalDuty(c:Config32,s:State32,id:string,o:Opportunity32):boolean {
 const w=s.worlds[id]!, cfg=c.worlds.find(v=>v.character.id===id)!;
 const local={...o,actor:id,participants:[id]};
 const stop=fit(c,s,id,local,w.locationId,s.time,w.cashCents,s.time+Math.min(240,cfg.sleepAfterMinutes-w.fatigue));
 return stop?.start===s.time;
}

export function itineraryScore(c:Config32,s:State32,id:string,d:Decision32,emit:Emit32):Decision32 {
 const w=s.worlds[id]!,cfg=c.worlds.find(w=>w.character.id===id)!;
 for(const candidate of d.candidates){
  const o=opportunity32(s,candidate.id)!;
  const travelCost=path32(c,s,id,o.location)?.reduce((n,r)=>n+r.costCents,0)??Infinity;
  const cost=travelCost+cityCost(o),needsMeal=w.needs.hungerMinutes+Math.max(0,candidate.travelMinutes)+Math.min(240,o.minutes-o.progress)>=300;
  if(cost>0&&needsMeal&&cost+mealPrice(s,id,cfg.mealCostCents)>w.cashCents)candidate.reasons.push('meal_reserve_unaffordable');
  if((c.journeyRevision??0)<6 && w.needs.hungerMinutes>=300&&w.cashCents<mealPrice(s,id,cfg.mealCostCents)&&!['work','repair'].includes(o.kind))candidate.reasons.push('food_income_priority');
  if(['study','garden_project'].includes(o.kind))candidate.factors.development=75;
  if(o.kind==='work'&&s.goals.some(g=>g.id===`life-career-${id}`&&g.status==='active'))candidate.factors.development=50;
  candidate.factors.locality=candidate.travelMinutes===0?25: -candidate.travelMinutes*.8;
  const appointment=s.appointments![o.id];
  candidate.factors.appointment=appointment&&appointment.start<=s.time+Math.max(0,candidate.travelMinutes)+30?500:0;
  candidate.score=Object.values(candidate.factors).reduce((a,b)=>a+b,0);
  candidate.planningReasons=[];fit(c,s,id,o,w.locationId,s.time,w.cashCents,s.time+Math.min(240,cfg.sleepAfterMinutes-w.fatigue),candidate.planningReasons);
 }
 if((c.journeyRevision??0)>=6 && w.needs.hungerMinutes>=300 && w.cashCents<mealPrice(s,id,cfg.mealCostCents)){
  const paid=(kind:string)=>kind==='work'||kind==='repair';
  const hasShift=d.candidates.some(x=>paid(opportunity32(s,x.id)!.kind) && !x.planningReasons?.length &&
    x.reasons.every(r=>['outside_shift','venue_closed','not_available'].includes(r)));
  for(const candidate of d.candidates){
    const o=opportunity32(s,candidate.id)!;
    const lightLocal=o.location===w.locationId && !cityCost(o) && ['care','contact','review','journey_collect','journey_message','travel_journal'].includes(o.kind);
    if(!paid(o.kind) && (hasShift || !lightLocal))candidate.reasons.push('food_income_priority');
  }
 }
 const urgency=((w.needs.hungerMinutes>=300||appointmentMealDue(s,id))&&w.cashCents>=mealPrice(s,id,cfg.mealCostCents))||s.strain[id]!>=150;
 let plan:Itinerary32|undefined=s.itineraries![id];
 if(plan)plan.stops=plan.stops.filter(stop=>unfinished(opportunity32(s,stop.opportunity)!)&&stop.end>s.time);
 const next=plan?.stops[0],candidate=d.candidates.find(x=>x.id===next?.opportunity);
 const hard=(reasons:string[])=>reasons.filter(r=>!['participant_not_ready','not_available'].includes(r));
 const conflict=next&&Object.values(s.appointments!).some(ap=>{
  if(ap.opportunity===next.opportunity||!ap.participants.includes(id)||ap.end<=s.time||!unfinished(opportunity32(s,ap.opportunity)!))return false;
  const a=opportunity32(s,next.opportunity)!,b=opportunity32(s,ap.opportunity)!,travel=plannedRoute32(c,id,a.location,b.location,w.cashCents)?.reduce((n,r)=>n+r.duration,0)??Infinity;
  return s.time<ap.end&&next.end>Math.min(ap.start-travel,ap.mealAt?.[id]??Infinity);
 });
 const lodgingConflict=!!candidate?.planningReasons?.includes('lodging_unreachable');
 const invalid=plan&&(urgency||conflict||lodgingConflict||s.time>=plan.until||!next||!candidate||hard(candidate.reasons).length>0);
 if(invalid&&plan){emit({kind:'itinerary_interrupted',actor:id,causes:[plan.source],data:{reason:urgency?'physiological_need':conflict?'accepted_appointment':lodgingConflict?'lodging_unreachable':!next?'completed':candidate?.reasons.join(',')||'horizon_elapsed'}});delete s.itineraries![id];plan=undefined;}
 if(!urgency&&!plan){
  const horizon=s.time+Math.min(240,cfg.sleepAfterMinutes-w.fatigue),stops:Stop32[]=[];let location=w.locationId,time=s.time,cash=w.cashCents;
  const idleMinutes=c.localActivities?consecutiveWait(s,id,120):0;
  for(let n=0;n<3;n++){
   const options=d.candidates.filter(x=>(x.score>0 || (n===0&&idleMinutes>0&&x.travelMinutes>=0&&x.travelMinutes<=30&&x.score> -Math.min(45,idleMinutes/2)))&&!hard(x.reasons).filter(r=>!['venue_closed','outside_shift','sleep_conflict','deadline_unreachable'].includes(r)).length&&!stops.some(a=>a.opportunity===x.id)).flatMap(x=>{const o=opportunity32(s,x.id)!;const stop=fit(c,s,id,o,location,time,cash,horizon);if(!stop)return[];return[{stop,o,value:x.score-(stop.arrival-time)*1.2-(stop.start-stop.arrival)*.7+(o.location===location?25:0)}];}).sort((a,b)=>b.value-a.value||a.o.id.localeCompare(b.o.id));
   const best=options[0];if(!best)break;
   stops.push(best.stop);cash-=(plannedRoute32(c,id,location,best.o.location,cash)?.reduce((n,r)=>n+r.costCents,0)??0)+cityCost(best.o);location=best.o.location;time=best.stop.end;
  }
  if(stops.length){const source=emit({kind:'itinerary_created',actor:id,causes:stops.map(x=>opportunity32(s,x.opportunity)!.createdRef),data:{stops:stops.length,opportunities:stops.map(x=>x.opportunity),until:horizon,reason:'按地点、完整时长、营业、现金与已约时间安排'}});plan={createdAt:s.time,until:horizon,stops,source};s.itineraries![id]=plan;}
 }
 const stop=plan?.stops[0],chosen=opportunity32(s,stop?.opportunity);
 if(!urgency&&chosen){
  const travel=path32(c,s,id,chosen.location)?.reduce((n,r)=>n+r.duration,0)??Infinity;
  const ap=s.appointments![chosen.id];
  if((ap&&s.time+travel<ap.start)||s.time+travel<chosen.available||(w.locationId===chosen.location&&s.time<stop!.start)){d.chosen=null;d.reason='waiting_for_appointment';}
  else if(chosen.participants.length>1&&w.locationId===chosen.location&&chosen.participants.some(x=>x!==id&&(s.worlds[x]!.inProgress||s.worlds[x]!.locationId!==chosen.location||s.worlds[x]!.sleeping))){d.chosen=null;d.reason='waiting_for_partner';}
  else{d.chosen=chosen.id;d.reason='following_itinerary';}
 }else if(!urgency){d.chosen=null;d.reason=d.candidates.length?'no_feasible_itinerary':'no_candidates';}
 return d;
}
