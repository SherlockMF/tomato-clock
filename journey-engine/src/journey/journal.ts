import {consecutiveWait,unfinished} from '../life32r3/planner.ts';
import {offer32,opportunity32} from '../life32r3/sources.ts';
import type {Config32,Emit32,State32} from '../life32r3/types.ts';

export function offerJournal(c:Config32,s:State32,id:string,emit:Emit32):boolean {
  if((c.journeyRevision??0)<3 || consecutiveWait(s,id,60)<60)return false;
  const w=s.worlds[id]!, cfg=c.worlds.find(v=>v.character.id===id)!;
  if(w.fatigue+30>cfg.sleepAfterMinutes || w.needs.hungerMinutes>=300)return false;
  const previous=s.opportunities.findLast(o=>o.kind==='travel_journal' && o.actor===id);
  if(previous && (unfinished(previous) || s.time-previous.available<1440))return false;
  const memory=s.memories.findLast(m=>m.actor===id && m.opportunity && m.topic!=='journey_message');
  const experience=opportunity32(s,memory?.opportunity);
  if(!memory || experience?.status!=='completed' || !experience.participants.includes(id))return false;
  const sourceKey='travel-journal:'+id+':'+memory.source;
  if(s.consumed.includes(sourceKey))return false;
  offer32(s,emit,{actor:id,participants:[id],kind:'travel_journal',subject:'记下'+experience.subject,
    location:w.locationId,minutes:30,available:s.time,deadline:s.time+30,source:'consequence',
    rule:'journey/journal/1',sourceRefs:[memory.source],sourceKey,objectId:experience.id,semantic:'journal:'+experience.semantic});
  return true;
}
