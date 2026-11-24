import assert from 'node:assert/strict';
import {domain32} from '../life32r3/city.ts';
import type {Config32,Record32,State32} from '../life32r3/types.ts';
import type {Receipt32} from '../life32r3/store.ts';

export function interval32(config:Config32,state:State32,records:Record32[],sessions:Receipt32[],until=state.time){
 const from=config.worlds[0]!.start;assert.ok(until>=from&&until<=state.time);
 const actor=config.hero,durations:Record<string,number>={},domains:Record<string,number>={},waitReasons:Record<string,{count:number;minutes:number;refs:string[]}>= {};
 const facts=records.filter(r=>r.fact),decisions=records.filter(r=>r.actor===actor&&r.decision);
 const account=(kind:string,start:number,end:number,ref:string)=>{const minutes=Math.max(0,Math.min(end,until)-Math.max(start,from));if(!minutes)return;durations[kind]=(durations[kind]??0)+minutes;const domain=domain32(kind);domains[domain]=(domains[domain]??0)+minutes;
  if(kind==='waiting'){const d=decisions.findLast(r=>r.time<=start);let why=d?.decision?.reason??'unclassified';if(why==='no_feasible_opportunity'){const cs=d!.decision!.candidates;why=!cs.length?'no_candidates':cs.every(c=>c.reasons.length)?'all_candidates_blocked':'nonpositive_scores';}if(why==='physiological_need'&&d!.decision!.needs.cash<config.worlds.find(w=>w.character.id===actor)!.mealCostCents)why='food_unaffordable';const entry=waitReasons[why]??={count:0,minutes:0,refs:[]};entry.count++;entry.minutes+=minutes;entry.refs.push(d?.id??ref);}
 };
 for(const r of facts)if(r.fact!.actors.includes(actor))account(r.fact!.kind,r.fact!.from,r.fact!.until,r.id);
 const pending=state.worlds[actor]!.inProgress;if(pending)account(state.bindings[actor]?.kind??pending.spec.kind,pending.startedAt,state.time,actor+'/'+pending.id);
 const seen=new Set<string>();let blank=0,maxBlank=0,repeated=0,semanticCount=0;
 const windows=sessions.filter(r=>r.from<until).map(receipt=>{const rows=facts.filter(r=>r.sequence>receipt.start&&r.sequence<=receipt.end&&r.time<=until&&(r.fact!.actors.includes(actor)||r.fact!.affected?.includes(actor)));let fresh=0,repeat=0;for(const r of rows){const semantic=r.fact!.semantic;if(!semantic)continue;semanticCount++;if(seen.has(semantic)){repeated++;repeat++;}else{seen.add(semantic);fresh++;}}blank=fresh?0:blank+1;maxBlank=Math.max(maxBlank,blank);return{sequence:receipt.sequence,from:receipt.from,until:Math.min(receipt.until,until),partial:receipt.until>until,actions:rows.filter(r=>r.fact!.actors.includes(actor)).length,goalProgress:rows.filter(r=>r.fact!.progress).length,newFacts:fresh,repeated:repeat,noNewStreak:blank};});
 const types=records.filter(r=>r.time<=until&&r.actor===actor).reduce<Record<string,number>>((a,r)=>{if(r.kind.startsWith('plan_'))a[r.kind]=(a[r.kind]??0)+1;return a;},{});
 return{from,until,virtualMinutes:until-from,durations,domains,waitReasons,windows,maxBlank,firstSemantics:seen.size,semanticCount,repeated,semanticRepeatRate:semanticCount?repeated/semanticCount:0,goalTransitions:types,relatedEvents:facts.filter(r=>r.time<=until&&r.fact!.actors.includes(actor)&&['social','gather','collaborate'].includes(r.fact!.kind)).map(r=>r.id),quality:'HUMAN_PENDING'};
}

export function comparable32(a:Config32,b:Config32){const left=structuredClone(a),right=structuredClone(b);left.rules.continuity=false;right.rules.continuity=false;assert.deepEqual(left,right,'A/B requires identical initial configuration except continuity');assert.notEqual(a.rules.continuity,b.rules.continuity,'A/B requires different rules');}
