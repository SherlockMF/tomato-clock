import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateJourney } from '../scripts/journey-eval.ts';
import { Runtime32 } from '../src/life32r3/engine.ts';
import { fixture32, initial32, validate32 } from '../src/life32r3/state.ts';
import {offer32} from '../src/life32r3/sources.ts';
import {itineraryScore} from '../src/life32r3/itinerary.ts';
import {score32} from '../src/life32r3/planner.ts';
import { cityGenerate } from '../src/life32r3/city.ts';
import { hash32, Store32 } from '../src/life32r3/store.ts';
import { journeyFixture, journeyRegion } from '../src/journey/world.ts';

test('历史 M3.2 的状态及事件流逐字节保持可重放', () => {
  const result = new Runtime32(fixture32()).advance(400);
  assert.equal(hash32(result), '6fe0bce3d274c58496c6f3307f3a4786909f74d7edaabeea4f43cbb276f2570c');
});

test('旅程必须使用持续生活规则和可达的旅途站点', () => {
  const config = journeyFixture();
  config.rules.continuity = false;
  assert.throws(() => validate32(config));
  const invalid = fixture32();
  invalid.journey = true;
  assert.throws(() => validate32(invalid));
});

test('异地站点的住宿和补给可以就地使用，无需每次折返出发地', () => {
  const c = journeyFixture();
  for (const supplies of [0,1]) {
    const s = initial32(c);
    s.worlds.hero!.locationId = 'ford';
    s.city!.care.hero = 30;
    s.city!.supplies.hero = supplies;
    cityGenerate(c, s, () => 'initial:test');
    const need = s.opportunities.find(o => o.actor === 'hero' && o.kind === (supplies ? 'care' : 'supplies'));
    assert.equal(need?.location, 'ford');
  }
});

test('旅程保存属性和未完成的行动，重试和分窗不会另外创造经历', () => {
  const config = journeyFixture('traveler', 19);
  using store = new Store32(':memory:', config);
  const first = { id: 'morning', sequence: 1, realMinutes: 25, rate: 8 as const };
  const receipt = store.submit(first);
  assert.deepEqual(store.submit(first), receipt);
  store.submit({ ...first, id: 'noon', sequence: 2 });
  assert.deepEqual(store.verify(), new Runtime32(config).advance(400).state);
});

test('七天的后半段仍有在异地办成的事情和能够溯源的属性变化', () => {
  const config = journeyFixture('traveler');
  const {state, records} = new Runtime32(config).advance(6720);
  const references = new Set<string>();
  const destinations = new Set<string>();
  let lateActions = 0;
  let changes = 0;
  for (const row of records) {
    const fact = row.fact;
    if (fact) {
      references.add(row.id);
      if (fact.kind.startsWith('journey_') && fact.actors.includes(config.hero)) {
        destinations.add(journeyRegion(fact.location));
        if (row.time > config.worlds[0]!.start + 3 * 1440) lateActions++;
      }
    }
    if (row.kind === 'attribute_changed') {
      assert.ok(row.causes.some(ref => references.has(ref)));
      assert.notEqual(row.data?.before, row.data?.after);
      changes++;
    }
  }
  assert.ok(destinations.size >= 2, '主角须在至少两地亲自办成事情');
  assert.ok(lateActions > 0 && changes > 0);
  assert.deepEqual(Object.keys(state.journey!.profiles).sort(), config.people.map(p => p.id).sort());
});

test('旧旅途的分配、人物状态和事件字节仍可重放', () => {
  const config = journeyFixture('traveler', 19);
  delete config.journeyRevision;
  delete config.localActivities;
  assert.equal(hash32(new Runtime32(config).advance(1440)), '0ef08be11818892e4cca6e94c778efd4a7833c8ae166d78cdf54362ba8d5414f');
});

test('等待且久坐时把未开始的远处锻炼改到身边，同一需要只占一项待办', () => {
  const c = journeyFixture(), s = initial32(c), id = c.hero;
  const emit = () => 'v-test';
  s.city!.movement[id] = 125;
  cityGenerate(c,s,emit);
  const walk = s.opportunities.find(o=>o.actor===id && o.kind==='exercise')!;
  assert.equal(walk.location,'park');
  s.worlds[id]!.locationId = 'ford';
  s.history.push({actor:id,kind:'waiting',from:s.time-30,until:s.time,ref:'v-wait'});
  cityGenerate(c,s,emit);
  cityGenerate(c,s,emit);
  assert.equal(walk.location,'ford');
  assert.equal(walk.minutes,30);
  assert.equal(s.opportunities.filter(o=>o.actor===id && o.kind==='exercise').length,1);
  assert.equal(s.goals.find(g=>g.id===walk.goal)!.target,30);
});

test('跨月只补付已完成的委托工时，个人只领一次工资，拆窗不重复报销', () => {
  const c=journeyFixture('low_assets',41);
  for(const w of c.worlds)w.start+=26*1440;
  const once=new Runtime32(c).advance(800), split=new Runtime32(c);
  const first=split.advance(400), second=split.advance(400);
  assert.deepEqual([...first.records,...second.records],once.records);
  assert.deepEqual(second.state,once.state);
  const bills=once.records.filter(r=>r.kind==='service_invoice_paid');
  assert.equal(bills.length,1);
  const bill=bills[0]!, refs=bill.causes.slice(1);
  assert.equal(refs.length,new Set(refs).size);
  const cents=refs.reduce((sum,ref)=>{
    const fact=once.records.find(r=>r.id===ref)!.fact!;
    assert.ok(['work','repair'].includes(fact.kind));
    return sum+(fact.until-fact.from)*c.employer.hourlyWageCents/60;
  },0);
  assert.ok(cents>0);
  assert.equal(bill.data!.cents,cents);
  const earned=Object.values(once.state.worlds).flatMap(w=>w.ledger).filter(e=>e.category==='earned_income').reduce((sum,e)=>sum+e.amountCents,0);
  assert.equal(c.employer.cashCents+cents-earned,once.state.employerCash);
  c.employer.cashCents=0;
  const unfunded=new Runtime32(c).advance(800);
  assert.equal(unfunded.state.employerCash,0);
  assert.ok(!unfunded.records.some(r=>r.kind==='service_invoice_paid'));
});

test('固定创作旅途的对照样本能减少两小时长等和空窗，通勤分钟也没有增加', () => {
  const before=evaluateJourney('creator',41,30,false);
  const after=evaluateJourney('creator',41,30);
  assert.equal(after.focusWindows,144);
  assert.ok(before.allWaitingWindows>0);
  assert.equal(after.allWaitingWindows,0);
  assert.ok(after.noOutcomeWindows<before.noOutcomeWindows);
  assert.ok(after.longWaitMinutes<before.longWaitMinutes);
  assert.ok(after.transitMinutes<=before.transitMinutes);
  assert.equal(after.regions.length,3);
});

test('书站关门后住宿区仍能用睡前的15分钟联系朋友，柜台采购仍受营业约束', () => {
  const c=journeyFixture();
  for(const w of c.worlds) { w.start+=555; w.initialFatigue=w.sleepAfterMinutes-18; }
  const s=initial32(c), emit=()=>'initial:test';
  for(const kind of ['contact','supplies'] as const){
    offer32(s,emit,{actor:c.hero,participants:[c.hero],location:'bookstore',kind,subject:kind,
      minutes:15,available:s.time,deadline:s.time+30,objectId:null,source:'consequence',
      rule:'test',semantic:kind,sourceKey:kind,sourceRefs:['initial:test']});
  }
  const decision=itineraryScore(c,s,c.hero,score32(c,s,c.hero),emit);
  assert.equal(decision.chosen,s.opportunities[0]!.id);
  assert.ok(decision.candidates.find(o=>o.kind==='supplies')!.reasons.includes('venue_closed'));
});

test('上一版旅途接续后两天的状态与全部提交记录保持原摘要', async () => {
  const {hash32}=await import('../src/life32r3/store.ts');
  const c=journeyFixture('settled',19);
  c.journeyRevision=2;
  assert.equal(hash32(new Runtime32(c).advance(1920)),'ca186b565e17b4682686c53517e7f10284e8fa2befd16173b151c4b97f5f0f28');
});
