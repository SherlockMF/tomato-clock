import type {Config32,State32,Opportunity32,Emit32} from '../life32r3/types.ts';

export function relationship(s:State32,a:string,b:string){
  return s.relations.find(r=>(r.a===a && r.b===b)||(r.b===a && r.a===b));
}

export function rememberMiss(c:Config32,s:State32,o:Opportunity32,ref:string,emit:Emit32){
  if((c.journeyRevision??0)<5 || !s.appointments?.[o.id] || o.participants.length!==2)return;
  const [a,b]=o.participants,pair=relationship(s,a!,b!)!;
  const misses=(pair.distance?.misses??0)+1,previous=pair.source,before=pair.trust;
  pair.trust=Math.max(0,before-3);
  pair.source=emit({kind:'relationship_strained',actor:o.actor,causes:[previous,ref],
    data:{participants:o.participants,before,after:pair.trust,misses}});
  pair.distance={misses,source:pair.source};
}

export function repairRelationship(s:State32,a:string,b:string,ref:string,emit:Emit32){
  const pair=relationship(s,a,b);
  if(!pair?.distance)return;
  const incident=pair.distance;
  delete pair.distance;
  pair.source=emit({kind:'relationship_repaired',actor:a,causes:[incident.source,ref],
    data:{participants:[a,b],misses:incident.misses}});
}
