import {currentPersonality} from '../journey/personality.ts';
import {routeWithinBudget} from '../journey/routing.ts';
import {shortestPath} from '../autonomy/perception.ts';import {localMinute} from '../domain/time.ts';
import type {Config32,State32,Opportunity32,Decision32,Candidate32} from './types.ts';
export function plannedRoute32(c:Config32,actor:string,from:string,to:string,cash:number) {
 const w=c.worlds.find(w=>w.character.id===actor)!;
 // Leave one meal available when choosing between a bus fare and walking.
 return c.journey?routeWithinBudget(w,from,to,Math.max(0,cash-w.mealCostCents)):shortestPath(w,from,to);
}
// Guests can use their own notes and supplies in the lodging area after the public counter closes.
export function activityHours(c:Config32, actor:string, o:Opportunity32) {
 const venue=c.worlds.find(w=>w.character.id===actor)!.places.find(place=>place.id===o.location)!;
 if(c.localActivities && (o.rule==='journey/stretch/1' || o.kind==='journey_message' || o.kind==='travel_journal'))return {openMinute:0,closeMinute:1440};
 if(c.localActivities && venue.lodgingCents===0 && (['care','create','revise','contact'].includes(o.kind) ||
    o.rule==='journey/local-conversation/1'))return {openMinute:0,closeMinute:1440};
 return venue;
}
export function consecutiveWait(s:State32,id:string,limit:number):number {
 let minutes=0;
 for(let i=s.history.length-1;i>=0 && minutes<limit;i--){
  const fact=s.history[i]!;
  if(fact.actor!==id)continue;
  if(fact.kind!=='waiting' || fact.until!==s.time-minutes)break;
  minutes+=fact.until-fact.from;
 }
 return minutes;
}
export function path32(c:Config32,s:State32,actor:string,location:string){
 const w=s.worlds[actor]!;
 return plannedRoute32(c,actor,w.locationId,location,w.cashCents);
}
export function score32(c:Config32,s:State32,actor:string):Decision32{
 const p=c.people.find(p=>p.id===actor)!,w=s.worlds[actor]!,cfg=c.worlds.find(w=>w.character.id===actor)!;
 const traits=currentPersonality(p,s);
 const candidates:Candidate32[]=s.opportunities.filter(o=>o.participants.includes(actor)&&!['completed','declined','missed','abandoned'].includes(o.status)).map(o=>{
  const path=path32(c,s,actor,o.location),travelMinutes=path?.reduce((n,r)=>n+r.duration,0)??Infinity,travelCost=path?.reduce((n,r)=>n+r.costCents,0)??Infinity,reasons:string[]=[];
  if(o.inFlight)reasons.push('in_progress');if(s.time<o.available)reasons.push('not_available');if(s.time+travelMinutes+Math.min(o.kind==='work'?60:30,o.minutes-o.progress)>o.deadline)reasons.push('deadline_unreachable');if(!path)reasons.push('no_route');
  if(travelCost>w.cashCents)reasons.push('travel_unaffordable');if(o.kind==='work'&&s.employerCash-Object.values(s.bindings).filter(b=>b.kind==='work').length*c.employer.hourlyWageCents<c.employer.hourlyWageCents)reasons.push('employer_insufficient_funds');
  const venue=activityHours(c,actor,o),minute=localMinute(s.time+travelMinutes,cfg.timezoneOffsetMinutes);if(minute<venue.openMinute||minute+Math.min(30,o.minutes-o.progress)>venue.closeMinute)reasons.push('venue_closed');
  if(o.kind==='work'&&(minute<p.shift[0]||minute+Math.min(60,o.minutes-o.progress)>p.shift[1]))reasons.push('outside_shift');
  if(o.kind==='social'&&w.locationId===o.location)for(const id of o.participants){const other=s.worlds[id]!;if(id!==actor&&(other.sleeping||other.inProgress||other.locationId!==o.location||other.fatigue+30>c.worlds.find(w=>w.character.id===id)!.sleepAfterMinutes||other.needs.hungerMinutes>=300))reasons.push('participant_not_ready');}
  if(o.kind==='review'&&!s.works.some(a=>a.id===o.objectId))reasons.push('missing_work');if(o.kind==='revise'&&!s.works.find(a=>a.id===o.objectId)?.feedback)reasons.push('missing_feedback');
  if(w.fatigue+travelMinutes+Math.min(60,o.minutes-o.progress)>cfg.sleepAfterMinutes)reasons.push('sleep_conflict');
  const recent=s.history.filter(h=>h.actor===actor&&h.until>s.time-720&&h.kind===o.kind).reduce((n,h)=>n+h.until-h.from,0);
  const interest=o.kind==='observe'?p.interests.some(x=>['摄影','探索','园艺'].includes(x)):['create','review','revise'].includes(o.kind)?p.interests.some(x=>['写作','摄影'].includes(x)):['water','harvest'].includes(o.kind)?p.interests.includes('园艺'):o.kind==='work'?p.interests.includes('工作'):p.interests.includes('社交');
  const daysToIncome=Math.max(0,(w.nextIncomeAt-s.time)/1440),reserve=Math.min(3,daysToIncome)*3*cfg.mealCostCents+cfg.places.find(x=>x.id===p.home)!.lodgingCents*Math.min(3,daysToIncome);
  const factors={base:20,interest:interest?30:0,personality:['social','contact'].includes(o.kind)?traits.E*.4:['create','observe','review','revise'].includes(o.kind)?traits.N*.3:['water','harvest'].includes(o.kind)?traits.F*.3: (100-traits.P)*.1,direction:p.direction==='creator'&&['create','revise'].includes(o.kind)?20:p.direction==='traveler'&&o.kind==='observe'?25:p.direction==='settled'&&['water','social','harvest'].includes(o.kind)?20:0,economy:o.kind==='work'?w.cashCents<reserve?100:w.cashCents<100000?45:-25:0,deadline:o.deadline-s.time<180?20:0,continuity:s.activePlan[actor]===o.id?12:0,feedback:o.kind==='revise'?c.rules.feedbackWeight:0,need:o.kind==='contact'||o.kind==='social'?Math.min(35,s.socialNeed[actor]!/30):o.kind==='water'?30:0,experience:o.kind==='create'||o.kind==='revise'?Math.min(10,s.skills[actor]!):0,relation:o.kind==='social'?s.relations.filter(r=>o.participants.includes(r.a)&&o.participants.includes(r.b)).reduce((n,r)=>n+r.trust/10,0):0,repetition:-recent*c.rules.repetitionWeight,travel:-travelMinutes*.3,strain:['work','create','revise'].includes(o.kind)?-s.strain[actor]!/5:0};
  for(const k of Object.keys(factors) as (keyof typeof factors)[])if(Object.is(factors[k],-0))factors[k]=0;
  return{id:o.id,kind:o.kind,score:Object.values(factors).reduce((a,b)=>a+b,0),factors,reasons:[...new Set(reasons)],travelMinutes:Number.isFinite(travelMinutes)?travelMinutes:-1};
 });
 const best=candidates.filter(x=>!x.reasons.length&&x.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))[0];
 return{actor,chosen:best?.id??null,candidates,needs:{hunger:w.needs.hungerMinutes,fatigue:w.fatigue,cash:w.cashCents,social:s.socialNeed[actor]!,strain:s.strain[actor]!},goals:s.goals.filter(g=>g.actor===actor&&!['completed','abandoned','missed','declined'].includes(g.status)).map(g=>g.id),reason:w.needs.hungerMinutes>=300?'physiological_need':s.strain[actor]!>=150?'mental_recovery':best?'highest_feasible_score':'no_feasible_opportunity'};
}
export function unfinished(o:Opportunity32):boolean{return ['pending','active','paused'].includes(o.status);}
