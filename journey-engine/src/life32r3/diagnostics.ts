import {currentPersonality} from '../journey/personality.ts';
import {WaitEpisodes} from '../journey/waits.ts';
import type {Config32,State32,Record32} from './types.ts';

export function diagnostics32(c:Config32,s:State32,records:Record32[],until=s.time){
 const from=c.worlds[0]!.start,hero=c.hero,rows=records.filter(r=>r.time<=until),facts=rows.filter(r=>r.fact?.actors.includes(hero)),decisions=rows.filter(r=>r.actor===hero&&r.decision);
 const daily:Record<string,{awake:number;commute:number;waiting:number;activities:{kind:string;from:number;until:number;location:string;ref:string}[]}>= {};
 const waits=new WaitEpisodes();
 let awakeMinutes=0,commuteMinutes=0,waitingMinutes=0;
 const add=(kind:string,start:number,end:number,location:string,ref:string)=>{
  start=Math.max(from,start);end=Math.min(end,until);if(start>=end)return;
  waits.record(kind,start,end);
  const minutes=end-start;awakeMinutes+=minutes;if(kind==='move')commuteMinutes+=minutes;if(kind==='waiting')waitingMinutes+=minutes;
  while(start<end){const day=Math.floor((start+c.worlds[0]!.timezoneOffsetMinutes)/1440),stop=Math.min(end,(day+1)*1440-c.worlds[0]!.timezoneOffsetMinutes),entry=daily[day]??={awake:0,commute:0,waiting:0,activities:[]};entry.awake+=stop-start;if(kind==='move')entry.commute+=stop-start;if(kind==='waiting')entry.waiting+=stop-start;entry.activities.push({kind,from:start,until:stop,location,ref});start=stop;}
 };
 // Include facts completed after the comparison cutoff, clipped to the actual interval.
 for(const r of records.filter(r=>r.fact?.actors.includes(hero)))add(r.fact!.kind,r.fact!.from,r.fact!.until,r.fact!.location,r.id);
 const pending=s.worlds[hero]!.inProgress;if(pending)add(s.bindings[hero]?.kind??pending.spec.kind,pending.startedAt,s.time,s.worlds[hero]!.locationId,hero+'/'+pending.id);
 const blocking:Record<string,{candidateOccurrences:number;decisionRefs:string[]}>= {};
 for(const r of decisions)for(const candidate of r.decision!.candidates)for(const reason of new Set([...candidate.reasons,...candidate.planningReasons??[]])){const entry=blocking[reason]??={candidateOccurrences:0,decisionRefs:[]};entry.candidateOccurrences++;if(!entry.decisionRefs.includes(r.id))entry.decisionRefs.push(r.id);}
 const moves=facts.filter(r=>r.fact!.kind==='move'),backtracks:{from:string;to:string;refs:string[]}[]=[];
 for(let i=2;i<moves.length;i++){const a=moves[i-2]!,b=moves[i-1]!,d=moves[i]!;if(a.fact!.location===d.fact!.location&&d.time-a.time<=240)backtracks.push({from:a.fact!.location,to:b.fact!.location,refs:[a.id,b.id,d.id]});}
 const sentences=new Map<string,string[]>();for(const r of facts)for(const sentence of r.fact!.text.split(/[。！？]/).filter(x=>x.length>8)){const refs=sentences.get(sentence)??[];refs.push(r.id);sentences.set(sentence,refs);}
 const latest=decisions.at(-1),active=s.opportunities.filter(o=>o.participants.includes(hero)&&['active','pending','paused'].includes(o.status));
 return{
  opportunities:{stateAsOf:s.time,currentGoals:s.goals.filter(g=>g.actor===hero&&g.target>0&&g.level==='direction'),latestDecision:latest??null,blocking,future:active.map(o=>({id:o.id,subject:o.subject,location:o.location,available:o.available,deadline:o.deadline,progress:o.progress,minutes:o.minutes,sourceRefs:o.sourceRefs})),development:s.development?.[hero]??null},
  time:{from,until,waitEpisodes:waits.summary(),awakeMinutes,commuteMinutes,waitingMinutes,commuteRatio:awakeMinutes?commuteMinutes/awakeMinutes:0,commuteAndWaitRatio:awakeMinutes?(commuteMinutes+waitingMinutes)/awakeMinutes:0,daily,backtracks,itineraries:rows.filter(r=>r.actor===hero&&r.kind.startsWith('itinerary_')),appointments:rows.filter(r=>r.kind==='appointment_created'&&(r.data?.participants as string[])?.includes(hero)),conflicts:rows.filter(r=>r.kind==='plan_declined'&&s.opportunities.find(o=>o.id===r.data?.opportunity)?.participants.includes(hero))},
  story:{quality:'HUMAN_PENDING' as const,characters:c.people.filter(p=>facts.some(r=>r.fact!.actors.includes(p.id))).map(p=>({id:p.id,name:p.name,gender:p.gender,personality:currentPersonality(p,s)})),completedActions:rows.filter(r=>r.kind==='plan_completed'&&s.opportunities.find(o=>o.id===r.data?.opportunity)?.participants.includes(hero)).length+facts.filter(r=>!r.fact!.opportunity&&r.fact!.kind!=='waiting'&&r.fact!.until>r.fact!.from).length,actionSegments:facts.filter(r=>r.fact!.until>r.fact!.from).length,longTermTransitions:rows.filter(r=>r.actor===hero&&r.kind==='life_goal_progress'),choices:rows.filter(r=>r.kind==='plan_declined'&&s.opportunities.find(o=>o.id===r.data?.opportunity)?.participants.includes(hero)),relationships:s.relations.filter(r=>r.a===hero||r.b===hero),unresolved:active.map(o=>({id:o.id,text:o.subject,source:o.createdRef})),repeatedSentences:[...sentences].filter(([,refs])=>refs.length>1).map(([text,refs])=>({text,count:refs.length,refs}))},
 };
}
