import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture32,initial32,baseline32} from '../src/life32r3/state.ts';
import {Runtime32} from '../src/life32r3/engine.ts';
import {Runtime32 as Baseline} from '../src/life32r2/engine.ts';
import {offer32} from '../src/life32r3/sources.ts';
import {score32} from '../src/life32r3/planner.ts';
import {cityScore} from '../src/life32r3/city.ts';
import {itineraryScore,scheduleMeetings} from '../src/life32r3/itinerary.ts';
import {developmentGenerate} from '../src/life32r3/development.ts';
import type {Record32} from '../src/life32r3/types.ts';
import {nextEvent} from '../src/engine/scheduler.ts';
import {applyEvent} from '../src/domain/event-log.ts';

test('32r3定居生活形成可持久的独立发展路径',()=>{
 const r=new Runtime32(fixture32()).advance(2400);
 const paths=new Set(r.records.filter(r=>r.kind==='life_goal_progress'&&r.actor==='hero').map(r=>r.data?.path));
 assert.ok(paths.has('career'));assert.ok(paths.has('garden'));
});

test('32r3保存跨动作行程并记录选择依据',()=>{
 const r=new Runtime32(fixture32('traveler')).advance(400);
 assert.ok(r.records.some(r=>r.kind==='itinerary_created'&&r.actor==='hero'&&Number(r.data?.stops)>=2));
});

test('32r3分窗不影响持续安排或事实',()=>{
 const c=fixture32(),rt=new Runtime32(c),a=rt.advance(200),b=rt.advance(200),whole=new Runtime32(c).advance(400);
 assert.deepEqual(b.state,whole.state);assert.deepEqual([...a.records,...b.records],whole.records);
});

test('32r3关闭规则精确执行第二轮',()=>{
 const c=fixture32();c.rules.continuity=false;
 assert.deepEqual(new Runtime32(c).advance(400),new Baseline(baseline32(c)).advance(400));
});

test('32r3无经历不能凭空解锁课程或长期进度',()=>{
 const c=fixture32(),s=initial32(c);developmentGenerate(c,s,()=> 'initial:test');
 assert.equal(s.opportunities.filter(o=>['study','garden_project'].includes(o.kind)).length,0);
 assert.equal(s.development!.hero!.careerLevel,0);assert.equal(s.development!.hero!.gardenLevel,0);
});

test('32r3免费自学仍真实占时，零现金不能购买覆盖材料或获得工资',()=>{
 const c=fixture32('low_assets');c.rules.environment=c.rules.social=c.rules.feedback=false;
 c.worlds.forEach(w=>{w.initialCashCents=0;w.locationId='home';});
 const s=initial32(c);s.development!.hero!.workMinutes=60;s.development!.hero!.gardenLevel=1;
 const r=new Runtime32(c,s).advance(100);
 assert.ok(r.records.some(r=>r.actor==='hero'&&r.fact?.kind==='study'));
 assert.equal(r.state.worlds.hero!.cashCents,0);
 assert.equal(r.records.some(r=>r.actor==='hero'&&r.fact?.kind==='garden_project'),false);
 assert.equal(r.state.development!.hero!.gardenLevel,1);
});

test('32r3个人事务允许在睡前合法时间分段，不把整项时长作为阻塞',()=>{
 const c=fixture32(),s=initial32(c);s.worlds.hero!.fatigue=c.worlds[0]!.sleepAfterMinutes-40;
 offer32(s,()=> 'initial:test',{actor:'hero',participants:['hero'],kind:'study',subject:'记录',location:'bookstore',minutes:90,available:s.time,deadline:s.time+500,objectId:null,source:'consequence',rule:'test',sourceRefs:['initial:test'],sourceKey:'test',semantic:'test'});
 const d=itineraryScore(c,s,'hero',cityScore(c,s,'hero',score32(c,s,'hero')),()=> 'initial:plan');
 assert.equal(d.chosen,s.opportunities[0]!.id);assert.equal(s.itineraries!.hero!.stops[0]!.end-s.time,30);
});

test('32r3约定先验证双方睡眠与时间，不可赴约时保留拒绝事实',()=>{
 const c=fixture32(),s=initial32(c),records:Omit<Record32,'id'|'sequence'|'time'>[]=[];
 offer32(s,()=> 'initial:test',{actor:'hero',participants:['hero','lin'],kind:'social',subject:'讨论已有安排',location:'bookstore',minutes:30,available:s.time,deadline:s.time+200,objectId:null,source:'social',rule:'test',sourceRefs:['initial:test'],sourceKey:'test',semantic:'test'});
 scheduleMeetings(c,s,r=>{records.push(r);return 'initial:appointment';});assert.ok(s.appointments![s.opportunities[0]!.id]);
 const blocked=initial32(c);blocked.opportunities=structuredClone(s.opportunities);blocked.goals=structuredClone(s.goals);blocked.worlds.lin!.fatigue=c.worlds[1]!.sleepAfterMinutes-10;
 scheduleMeetings(c,blocked,r=>{records.push(r);return 'initial:declined';});assert.equal(blocked.opportunities[0]!.status,'declined');assert.equal(Object.keys(blocked.appointments!).length,0);assert.ok(records.some(r=>r.kind==='plan_declined'));
});

test('32r3已接受约定打断冲突的旧个人行程',()=>{
 const c=fixture32(),s=initial32(c);
 const add=(key:string,kind:'study'|'social',participants:string[],minutes:number)=>offer32(s,()=> 'initial:'+key,{actor:'hero',participants,kind,subject:key,location:'bookstore',minutes,available:s.time,deadline:s.time+200,objectId:null,source:'social',rule:'test',sourceRefs:['initial:test'],sourceKey:key,semantic:key});
 add('personal','study',['hero'],90);add('meeting','social',['hero','lin'],30);
 s.itineraries!.hero={createdAt:s.time,until:s.time+240,source:'initial:plan',stops:[{opportunity:'o1',arrival:s.time,start:s.time,end:s.time+90}]};
 s.appointments!.o2={opportunity:'o2',start:s.time+20,end:s.time+50,participants:['hero','lin'],source:'initial:appointment'};
 const d=itineraryScore(c,s,'hero',cityScore(c,s,'hero',score32(c,s,'hero')),()=> 'initial:test');
 assert.notEqual(d.chosen,'o1');assert.equal(s.itineraries!.hero!.stops[0]!.opportunity,'o2');
});

test('32r3错过共同时间不会把已失效约定继续执行',()=>{
 const c=fixture32(),s=initial32(c);
 offer32(s,()=> 'initial:test',{actor:'hero',participants:['hero','lin'],kind:'social',subject:'约见',location:'bookstore',minutes:30,available:s.time,deadline:s.time+200,objectId:null,source:'social',rule:'test',sourceRefs:['initial:test'],sourceKey:'meet',semantic:'meet'});
 s.appointments!.o1={opportunity:'o1',start:s.time-15,end:s.time+15,participants:['hero','lin'],source:'initial:appointment'};
 scheduleMeetings(c,s,()=> 'initial:miss');assert.equal(s.opportunities[0]!.status,'missed');
});

test('32r3连续约见必须保留上一地点到下一地点的真实路程',()=>{
 const c=fixture32(),s=initial32(c);
 for(const [key,location]of [['first','street'],['second','bookstore']] as const)offer32(s,()=> 'initial:'+key,{actor:'hero',participants:['hero','lin'],kind:'social',subject:key,location,minutes:30,available:s.time,deadline:s.time+200,objectId:null,source:'social',rule:'test',sourceRefs:['initial:test'],sourceKey:key,semantic:key});
 scheduleMeetings(c,s,()=> 'initial:appointment');
 assert.ok(s.appointments!.o2!.start>=s.appointments!.o1!.end+10);
});

test('32r3为预约预留的饭点会真实进食而非等待到错过',()=>{
 const c=fixture32();c.rules.environment=c.rules.social=c.rules.feedback=false;
 const s=initial32(c);s.worlds.hero!.needs.hungerMinutes=290;s.worlds.lin!.needs.hungerMinutes=290;
 offer32(s,()=> 'initial:meeting',{actor:'hero',participants:['hero','lin'],kind:'social',subject:'饭后会面',location:'bookstore',minutes:30,available:s.time,deadline:s.time+200,objectId:null,source:'social',rule:'test',sourceRefs:['initial:test'],sourceKey:'meet',semantic:'meet'});
 const r=new Runtime32(c,s).advance(80);
 assert.ok(r.records.some(r=>r.fact?.kind==='social'));
 assert.equal(r.records.some(r=>r.kind==='plan_missed'&&r.data?.opportunity==='o1'),false);
 assert.ok(r.records.some(r=>r.fact?.kind==='eat'&&r.actor==='hero'&&r.fact.from===s.time));
});

test('32r3预计途中会饿时按约定先行吃饭，不能等阈值到来才出发',()=>{
 const c=fixture32();c.rules.environment=c.rules.social=c.rules.feedback=false;
 const s=initial32(c);s.worlds.hero!.needs.hungerMinutes=250;s.worlds.lin!.needs.hungerMinutes=250;
 offer32(s,()=> 'initial:meeting',{actor:'hero',participants:['hero','lin'],kind:'social',subject:'饭后前往街区',location:'street',minutes:30,available:s.time,deadline:s.time+200,objectId:null,source:'social',rule:'test',sourceRefs:['initial:test'],sourceKey:'meet',semantic:'meet'});
 const r=new Runtime32(c,s).advance(90);assert.ok(r.records.some(r=>r.fact?.kind==='social'));
});

test('32r3营业中的当前位置可以整理已产生的岗位知识，不强迫回家',()=>{
 const c=fixture32(),s=initial32(c);s.development!.hero!.workMinutes=60;
 developmentGenerate(c,s,()=> 'initial:test');assert.equal(s.opportunities.find(o=>o.actor==='hero'&&o.kind==='study')!.location,'bookstore');
});

test('32r3缺饭钱不会阻断真实可支付的值班，先挣得工资再吃饭',()=>{
 const c=fixture32('low_assets');c.rules.social=c.rules.feedback=false;c.worlds[0]!.initialCashCents=0;
 const s=initial32(c);s.worlds.hero!.needs.hungerMinutes=300;
 const r=new Runtime32(c,s).advance(90);
 const work=r.records.find(r=>r.actor==='hero'&&r.fact?.kind==='work'),meal=r.records.find(r=>r.actor==='hero'&&r.fact?.kind==='eat');
 assert.ok(work&&meal);assert.ok(work.time<=meal.fact!.from);assert.ok(r.state.worlds.hero!.cashCents>=0);
});

test('32r3付费计划必须保留时域内餐费，不能先花光现金再困住',()=>{
 const c=fixture32('low_assets');c.rules.environment=c.rules.social=c.rules.feedback=false;c.worlds[0]!.initialCashCents=1800;c.worlds[0]!.locationId='street';
 const s=initial32(c);s.worlds.hero!.needs.hungerMinutes=290;s.development!.hero!.gardenLevel=1;
 const r=new Runtime32(c,s).advance(95);
 assert.equal(r.records.some(r=>r.actor==='hero'&&r.fact?.kind==='garden_project'),false);
 assert.ok(r.records.some(r=>r.actor==='hero'&&r.fact?.kind==='eat'));
 assert.ok(r.records.some(r=>r.actor==='hero'&&r.decision?.candidates.some(x=>x.reasons.includes('meal_reserve_unaffordable'))));
});

test('32r3个人事务可以利用已接受预约之前的空档',()=>{
 const c=fixture32(),s=initial32(c);
 for(const [key,kind,participants,minutes]of [['study','study',['hero'],90],['meeting','social',['hero','lin'],30]] as const)offer32(s,()=> 'initial:'+key,{actor:'hero',participants:[...participants],kind,subject:key,location:'bookstore',minutes,available:s.time,deadline:s.time+200,objectId:null,source:'social',rule:'test',sourceRefs:['initial:test'],sourceKey:key,semantic:key});
 s.appointments!.o2={opportunity:'o2',start:s.time+60,end:s.time+90,participants:['hero','lin'],source:'initial:appointment'};
 const d=itineraryScore(c,s,'hero',cityScore(c,s,'hero',score32(c,s,'hero')),()=> 'initial:test');
 assert.equal(d.chosen,'o1');assert.equal(s.itineraries!.hero!.stops[0]!.end,s.time+60);
 assert.equal(s.itineraries!.hero!.stops[1]!.opportunity,'o2');
});

test('32r3按共同会面时间重新计算等待者的进餐需要',()=>{
 const c=fixture32();c.rules.environment=c.rules.social=c.rules.feedback=false;
 const s=initial32(c);s.worlds.hero!.needs.hungerMinutes=220;
 for(const p of c.people){s.city!.visited[p.id]=['bookstore','home','street','park','community','workshop','market'];s.city!.qualification[p.id]=2;s.city!.movement[p.id]=0;}
 applyEvent(s.worlds.lin!,c.worlds[1]!,nextEvent(s.worlds.lin!,c.worlds[1]!,{kind:'idle',duration:90}));
 offer32(s,()=> 'initial:meeting',{actor:'hero',participants:['hero','lin'],kind:'social',subject:'等同伴忙完',location:'bookstore',minutes:30,available:s.time,deadline:s.time+200,objectId:null,source:'social',rule:'test',sourceRefs:['initial:test'],sourceKey:'meet',semantic:'meet'});
 const r=new Runtime32(c,s).advance(150);assert.ok(r.records.some(r=>r.fact?.kind==='social'));
 assert.equal(r.records.some(r=>r.kind==='plan_missed'&&r.data?.opportunity==='o1'),false);
});
