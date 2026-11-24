import type {Evidence32} from '../life32r3/store.ts';
import type {Opportunity32} from '../life32r3/types.ts';

type Passage={text:string;ref:string};
export interface JourneyThread {origin?:Passage;outcome:Passage;followUp?:Passage}

// These activities use earlier facts as material, an invitation, or a physical handover.
// Other sourceRefs can merely record the last decision or the passage of time.
function storySources(o:Opportunity32):string[] {
  if(['create','review','revise','host','gather','collaborate','social','journey_deliver','journey_mend','travel_journal'].includes(o.kind))return o.sourceRefs;
  if(o.kind==='journey_message')return o.sourceRefs.slice(0,1);
  return [];
}

export function journeyThread(e:Evidence32):JourneyThread|null {
  const hero=e.config.hero;
  const earlier=new Map(e.before.memories.filter(m=>m.actor===hero).map(m=>[m.source,m.text]));
  const completed=new Set(e.after.memories.filter(m=>m.actor===hero).map(m=>m.source));
  const opportunities=new Map(e.after.opportunities.map(o=>[o.id,o]));
  const pending=new Map<string,Opportunity32>();
  for(const o of e.after.opportunities){
    if(!o.participants.includes(hero) || !['pending','active','paused'].includes(o.status))continue;
    for(const ref of storySources(o))pending.set(ref,o);
  }
  let best:JourneyThread|null=null, bestScore=0;
  for(const row of e.records){
    const fact=row.fact;
    if(!fact?.opportunity || !completed.has(row.id))continue;
    const activity=opportunities.get(fact.opportunity);
    if(!activity)continue;
    const cause=storySources(activity).findLast(ref=>earlier.has(ref)), next=pending.get(row.id);
    const score=(cause?2:0)+(next?1:0);
    if(!score || score<bestScore)continue;
    bestScore=score;
    best={outcome:{text:fact.text,ref:row.id},
      ...(cause?{origin:{text:earlier.get(cause)!,ref:cause}}:{}),
      ...(next?{followUp:{text:next.subject,ref:next.createdRef}}:{})};
  }
  return best;
}
