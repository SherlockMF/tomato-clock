import {JourneyPatterns} from './journey-patterns.ts';
import assert from 'node:assert/strict';
import {journeyFixture} from '../src/journey/world.ts';
import {Runtime32} from '../src/life32r3/engine.ts';
import {opportunity32} from '../src/life32r3/sources.ts';
import {JourneyReading,readerChoices,pickScene,renderScene} from '../src/studio/journey-reader.ts';
import {paragraphPlan} from '../src/studio/journey-narrator.ts';
import {connectScene} from '../src/studio/journey-context.ts';
import type {Action} from '../src/domain/types.ts';
import type {Background,Record32} from '../src/life32r3/types.ts';

const [mode='standard',bg='creator',n='100',rawSeed='11',rawRate='8',revision]=process.argv.slice(2);
assert.ok(['standard','zero','no-social'].includes(mode) && ['creator','settled','traveler','low_assets'].includes(bg));
const days=Number(n),seed=Number(rawSeed);
assert.ok(Number.isSafeInteger(days) && days>0);
assert.ok(rawRate==='6' || rawRate==='8');
const rate:6|8=rawRate==='8'?8:6;
const config=journeyFixture(bg as Background,seed);
if(revision){assert.ok(revision==='6' || revision==='7');config.journeyRevision=revision==='6'?6:7;}
if(mode==='zero'){
  const w=config.worlds.find(w=>w.character.id===config.hero)!;
  w.initialCashCents=0;w.monthlyIncomeCents=0;w.initialFatigue=w.sleepAfterMinutes;
}
if(mode==='no-social')config.rules.social=false;
const rt=new Runtime32(config), first=rt.state;
const patterns=new JourneyPatterns(config.hero,config.people.find(p=>p.id===config.hero)!.home,first.worlds[config.hero]!.locationId);
const position=new Map(config.worlds.map(w=>[w.character.id,w.locationId]));
const active=new Map<string,Action>(), visits=new Map<string,{start:number;end:number;place:string}>();
const counters={moves:0,jointSegments:0,completedAppointments:0,missedAppointments:0,rememberedActions:0};
let lastTopic='', previous=first, reimbursements=0, prevTopic='',repeat=0,streak=0,maximum=0,windows=0;
const samples=[];
const reading=new JourneyReading();
const audit=process.argv.includes('--reading-audit');
const readingAudit:{window:number;old:string|null;selected:string|null;oldKey:string;key:string;outcomes:string[];text?:string;refs?:string[]}[]=[];
const inspectArg=process.argv.find(v=>v.startsWith('--inspect-windows='));
const inspected=new Set(inspectArg?.slice('--inspect-windows='.length).split(',').map(Number));
for(const seq of inspected)assert.ok(Number.isSafeInteger(seq) && seq>=1 && seq<=days*(rate===8?5:7),'invalid inspection window');
const inspectedWindows=[];
const sampleHistory=new Map<string,Record32>();
let oldTopic='';
const strains=new Set<string>();
let repaired=0,secondMiss=0,waitSegments=0,waitMinutes=0,waitRuns=0,maxWait=0,waitEnd=-1,runMinutes=0;
for(let day=1;day<=days;day++){
  for(const minutes of (rate===8?[200,200,200,200,160]:[150,150,150,150,150,150,60])){
    const {state,records}=rt.advance(minutes);
    for(const row of records){
      patterns.record(row,state);
      const ev=row.world,id=row.actor,loc=position.get(id);
      if(ev){
        assert.equal(ev.preconditions.locationId,loc,'location changed without arrival');
        if(ev.kind==='action_started'){
          const a=ev.data.action!;assert.ok(!active.has(id));assert.equal(a.from,loc);
          if(a.spec.kind==='move'){
            const routeId=a.spec.routeId;
            const route=config.worlds.find(w=>w.character.id===id)!.routes.find(r=>r.id===routeId)!;
            assert.ok(route && route.from===loc && route.to===a.to && route.duration===a.duration);
          }
          active.set(id,a);
        }
        if(ev.kind==='action_completed'){
          const a=active.get(id)!;assert.ok(a && a.startedAt+a.duration===ev.simulationTime);
          if(a.spec.kind==='move'){position.set(id,a.to!);counters.moves++;}
          visits.set(id,{start:a.startedAt,end:ev.simulationTime,place:position.get(id)!});
          active.delete(id);
        }
      }
      if(row.kind==='service_invoice_paid')reimbursements+=Number(row.data!.cents);
      const f=row.fact;
      if(row.kind==='relationship_strained'){
        const cause=records.find(r=>r.id===row.causes[1]);
        assert.ok(cause && ['plan_missed','plan_abandoned'].includes(cause.kind));
        strains.add(row.id);
        if(row.data!.misses===2)secondMiss++;
      }
      if(row.kind==='relationship_repaired'){
        assert.ok(strains.has(row.causes[0]!));
        const cause=records.find(r=>r.id===row.causes[1])?.fact;
        assert.ok(cause && (cause.actors.length===2 || cause.kind==='journey_message'));
        repaired++;
      }
      if(f?.kind==='waiting' && f.actors.includes(config.hero)){
        if(waitEnd!==f.from){waitRuns++;runMinutes=0;}
        waitSegments++;waitEnd=f.until;waitMinutes+=f.until-f.from;runMinutes+=f.until-f.from;maxWait=Math.max(maxWait,runMinutes);
      }
      if(f?.opportunity && f.progress && f.actors.length>1){
        const ap=state.appointments![f.opportunity];assert.ok(ap && ap.start<=f.from && f.until<=ap.end);
        for(const id of f.actors)assert.deepEqual(visits.get(id),{start:f.from,end:f.until,place:f.location});
        counters.jointSegments++;
      }
      if(row.kind==='plan_completed' || row.kind==='plan_missed'){
        const o=opportunity32(state,String(row.data!.opportunity))!;
        if(state.appointments![o.id]){if(row.kind==='plan_completed')counters.completedAppointments++;else counters.missedAppointments++;}
        if(row.kind==='plan_completed' && o.sourceRefs.some(ref=>previous.memories.some(m=>m.actor===o.actor && m.source===ref)))counters.rememberedActions++;
      }
    }
    for(const [id,world] of Object.entries(state.worlds)){
      assert.equal(world.time,state.time);assert.equal(world.locationId,position.get(id));
      assert.equal(world.awakeMinutes+world.sleepMinutes,state.time-first.time);assert.ok(world.cashCents>=0);
    }
    const e:import('../src/life32r3/store.ts').Evidence32={config,before:previous,after:state,records,digest:'acceptance',receipt:{id:'w'+windows,sequence:windows+1,from:previous.time,until:state.time,start:previous.serial,end:state.serial,rate,realMinutes:minutes/rate,digest:'acceptance'}};
    const scene=reading.select(e);
    if(inspected.has(windows+1)){
      const hero=config.hero;
      const facts=records.filter(r=>r.fact && (r.fact.actors.includes(hero)||r.fact.affected?.includes(hero)))
        .map(r=>({ref:r.id,kind:r.fact!.kind,opportunity:r.fact!.opportunity,from:r.fact!.from,until:r.fact!.until,location:r.fact!.location}));
      const shifts=records.filter(r=>r.actor===hero && r.decision?.candidates.some(c=>c.id===r.decision!.chosen && c.kind==='work'))
        .map(r=>({ref:r.id,time:r.time,...r.decision}));
      const itineraryChanges=records.filter(r=>r.actor===hero && ['itinerary_created','itinerary_interrupted'].includes(r.kind))
        .map(r=>({ref:r.id,time:r.time,kind:r.kind,data:r.data}));
      inspectedWindows.push({window:windows+1,lead:scene.row?.id,recap:renderScene(e,scene),facts,shifts,
        openingPlan:previous.itineraries?.[hero]??null,itineraryChanges});
    }
    if(audit){
      const old=pickScene(readerChoices(e),oldTopic);oldTopic=old.topic;
      const outcomes=records.flatMap(r=>{
        if(r.actor!==config.hero)return [];
        if(r.kind==='life_goal_progress' || (r.kind==='river_rack_cleared' && r.data?.after===0))return r.causes.slice(0,1);
        if(r.kind==='relationship_repaired')return r.causes.slice(1,2);
        return r.fact?.semantic && ['journey_deliver','journey_mend'].includes(r.fact.kind)?[r.id]:[];
      });
      const trace=bg==='low_assets' && windows<85;
      if(trace)for(const r of records)if(r.fact || r.kind==='river_rack_cleared')sampleHistory.set(r.id,r);
      const sample=trace && windows>=75?renderScene(e,connectScene(e,scene,id=>sampleHistory.get(id))):undefined;
      const factKey=(r:Record32|null)=>JSON.stringify([r?.fact?.kind??null,opportunity32(state,r?.fact?.opportunity)?.subject??r?.fact?.title??null,r?.fact?.location??null]);
      readingAudit.push({window:windows+1,old:old.row?.id??null,selected:scene.row?.id??null,outcomes,
        oldKey:factKey(old.row),key:factKey(scene.row),
        ...(sample?{text:sample.text,refs:sample.refs}:{})});
    }
    patterns.story(windows+1,scene,state);
    lastTopic=scene.topic;
    if(lastTopic===prevTopic){repeat++;streak++;}else streak=1;
    maximum=Math.max(maximum,streak);prevTopic=lastTopic;windows++;
    if([10,30,99,100].includes(day))samples.push({day,window:windows,realMinutes:minutes/rate,topic:lastTopic,...renderScene(e,scene),plan:paragraphPlan(e,scene)});
    previous=state;
  }
}
for(const cfg of config.worlds){
  const w=previous.worlds[cfg.character.id]!;
  assert.equal(w.cashCents,w.ledger.reduce((n,row)=>n+row.amountCents,cfg.initialCashCents));
}
const earned=Object.values(previous.worlds).flatMap(w=>w.ledger).filter(r=>r.category==='earned_income').reduce((n,r)=>n+r.amountCents,0);
assert.equal(config.employer.cashCents+reimbursements-previous.employerCash,earned);
console.log(JSON.stringify({mode,bg,days,seed,rate,revision:config.journeyRevision,patterns:patterns.summary(),windows,repeat,maximum,...counters,strained:strains.size,secondMiss,repaired,waitSegments,waitMinutes,waitRuns,maxWait,elapsedCalendarDays:(previous.time-first.time)/1440,reimbursements,samples,...(audit?{readingAudit}:{}),...(inspectArg?{inspectedWindows}:{})}));
