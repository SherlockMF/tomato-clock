import type {Personality} from '../domain/types.ts';
import type {Activity,Emit32,Fact32,Person32} from '../life32r3/types.ts';

export interface JourneyPersonality {
  values:Personality;
  period:number;
  used:Personality;
}
export function initialPersonality(p:Personality):JourneyPersonality {
  return {values:{...p},period:0,used:{E:0,N:0,F:0,P:0}};
}
export function currentPersonality(p:Person32,s:{journey?:{profiles:Record<string,{personality?:JourneyPersonality}>}}):Personality {
  return s.journey?.profiles[p.id]?.personality?.values ?? p.personality;
}

// Game rules for completed experiences. Each entry moves one continuous axis.
const experience:Partial<Record<Activity,[keyof Personality,number]>>={
  social:['E',1], gather:['E',1], collaborate:['E',1], travel_journal:['E',-1],
  study:['N',1], journey_survey:['N',-1],
  create:['F',1], repair:['F',-1], journey_mend:['F',-1],
  visit:['P',1], work:['P',-1],
};

export function growPersonality(p:JourneyPersonality,start:number,actor:string,fact:Fact32,ref:string,emit:Emit32){
  const effect=experience[fact.kind as Activity];
  if(!effect)return;
  const period=Math.floor((fact.until-start)/(30*1440));
  if(period!==p.period){p.period=period;p.used={E:0,N:0,F:0,P:0};}
  const [axis,direction]=effect,before=p.values[axis],amount=Math.min(.02,3-p.used[axis]);
  const after=Number(Math.min(100,Math.max(0,before+direction*amount)).toFixed(10));
  if(before===after || amount<=0)return;
  p.values[axis]=after;
  p.used[axis]=Number((p.used[axis]+Math.abs(after-before)).toFixed(10));
  emit({kind:'personality_changed',actor,causes:[ref],data:{axis,before,after,activity:fact.kind}});
}
