import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateJourney} from '../scripts/journey-eval.ts';
import {WaitEpisodes} from '../src/journey/waits.ts';
import {offerPackedMeals} from '../src/journey/provisions.ts';
import {generateJourney,journeyFixture,takeLocalDuty} from '../src/journey/world.ts';
import {diagnostics32} from '../src/life32r3/diagnostics.ts';
import {Runtime32} from '../src/life32r3/engine.ts';
import {initial32} from '../src/life32r3/state.ts';
import {hash32} from '../src/life32r3/store.ts';

test('连续等待合并跨窗片段，活动与睡眠打断；截止时只计已经等待的分钟',()=>{
  const w=new WaitEpisodes();
  assert.equal(w.summary().max,0);
  w.record('waiting',0,30);
  assert.equal(w.summary().totalMinutes,30);
  w.record('choice',30,30);
  w.record('waiting',30,120);
  w.record('eat',120,140);
  w.record('waiting',140,200);
  w.record('waiting',680,695);
  const stats=w.summary();
  assert.deepEqual(stats.histogram,{15:1,60:1,120:1});
  assert.equal(stats.count,3);
  assert.equal(stats.median,60);
  assert.equal(stats.p95,120);
  assert.deepEqual(stats.thresholds.find(t=>t.minutes===120),{minutes:120,count:1,totalMinutes:120});
  assert.deepEqual(w.summary(),stats);
});

test('上一版旅途的状态和事件逐字节复现',()=>{
  const c=journeyFixture('settled',19);
  delete c.journeyRevision;
  assert.equal(hash32(new Runtime32(c).advance(1440)),'c216bcc0872817f66f72531fc4112a9cee85e5f03568525a9312c463a554f66d');
});

test('路餐在实际购买和制作后入袋，吃掉一份只核销一次；等待统计与清醒账相符',()=>{
  const c=journeyFixture('settled',19), rt=new Runtime32(c);
  const run=rt.advance(7*960);
  let portions=0, prepared=0, eaten=0;
  for(const row of run.records){
    const fact=row.fact;
    if(!fact?.actors.includes(c.hero))continue;
    if(fact.kind==='pack_meals'){
      assert.equal(portions,0);
      assert.equal(fact.until-fact.from,30);
      const payment=run.records.find(r=>r.actor===c.hero && r.world?.data.action?.spec.kind==='purchase' &&
        r.world.data.action.spec.itemId==='service:'+fact.opportunity);
      assert.equal(payment?.world?.data.action?.costCents,800);
      portions+=2;prepared++;
    }
    if(fact.kind==='eat' && fact.newState.includes('路餐减少一份')){
      assert.ok(portions>0);
      const start=run.records.find(r=>r.actor===c.hero && r.time===fact.from && r.world?.data.action?.spec.kind==='eat');
      assert.equal(start?.world?.data.action?.costCents,0);
      portions--;eaten++;
    }
  }
  assert.ok(prepared && eaten);
  assert.equal(run.state.journey!.world.provisions![c.hero]!.portions,portions);
  const time=diagnostics32(c,run.state,run.records).time;
  assert.equal(time.waitEpisodes.totalMinutes,time.waitingMinutes);
  assert.equal(time.awakeMinutes,7*960);
});

test('钱不足、已有路餐或已占用同一需求时不再发备餐事务',()=>{
  const c=journeyFixture('settled',19), s=initial32(c), w=s.worlds[c.hero]!, emit=()=>'v-test';
  w.cashCents=799;
  assert.equal(offerPackedMeals(c,s,c.hero,emit),false);
  w.cashCents=5000;
  s.journey!.world.provisions![c.hero]!.portions=1;
  assert.equal(offerPackedMeals(c,s,c.hero,emit),false);
  s.journey!.world.provisions![c.hero]!.portions=0;
  assert.equal(offerPackedMeals(c,s,c.hero,emit),true);
  assert.equal(offerPackedMeals(c,s,c.hero,emit),false);
});

test('现场接手只允许尚未开工且原负责人没有排进行程的公共事务',()=>{
  const c=journeyFixture(),s=initial32(c); let serial=0;
  const emit=()=>'v'+ ++serial;
  generateJourney(c,s,emit);
  const book=s.journey!.world.books.find(b=>b.status==='returned' && b.assignment)!;
  const old=s.opportunities.find(o=>o.id===book.assignment!.opportunity)!, owner=old.actor;
  const helper=c.people.find(p=>p.id!==owner)!.id;
  s.worlds[owner]!.locationId='home'; s.worlds[helper]!.locationId=old.location;
  s.time+=65;
  s.activePlan[owner]=old.id;
  // Other public jobs are elsewhere or have only just been posted.
  for(const o of s.opportunities)if(o!==old)o.available=s.time;
  assert.equal(takeLocalDuty(c,s,helper,emit),false);
  s.activePlan[owner]=null;
  const previousFatigue=s.worlds[helper]!.fatigue;
  s.worlds[helper]!.fatigue=c.worlds.find(v=>v.character.id===helper)!.sleepAfterMinutes-10;
  assert.equal(takeLocalDuty(c,s,helper,emit),false);
  assert.equal(old.status,'pending');
  assert.equal(book.assignment?.actor,owner);
  s.worlds[helper]!.fatigue=previousFatigue;
  assert.equal(takeLocalDuty(c,s,helper,emit),true);
  assert.equal(old.status,'abandoned');
  assert.equal(s.goals.find(g=>g.id===old.goal)?.status,'abandoned');
  assert.equal(book.assignment?.actor,helper);
  assert.equal(book.assignment?.transferred,true);
  const next=s.opportunities.find(o=>o.id===book.assignment!.opportunity)!;
  assert.equal(next.objectId,old.objectId);
  assert.equal(next.progress,0);
  assert.equal(next.status,'pending');
  s.worlds[helper]!.locationId='home';s.worlds[owner]!.locationId=old.location;s.time+=65;
  takeLocalDuty(c,s,owner,emit);
  assert.equal(book.assignment?.opportunity,next.id);
});


test('相对上一版，小禾种子19的两周样本同时减少等待总量、两小时长等和单段P95',()=>{
  const previous=evaluateJourney('settled',19,14,true,false);
  const current=evaluateJourney('settled',19,14);
  assert.equal(current.awakeMinutes,previous.awakeMinutes);
  assert.ok(current.waitingMinutes<previous.waitingMinutes);
  assert.ok(current.waitEpisodes.p95<previous.waitEpisodes.p95);
  assert.ok(current.waitEpisodes.max<previous.waitEpisodes.max);
  const longCount=(result:typeof current)=>result.waitEpisodes.thresholds.find(t=>t.minutes===120)!.count;
  assert.ok(longCount(current)<longCount(previous));
});

test('空档提前进餐仍消耗二十分钟，只在接近饭点时生效',()=>{
  const c=journeyFixture('creator',19), run=new Runtime32(c).advance(2*960);
  const meals=run.records.filter(r=>r.actor===c.hero && r.decision?.reason==='meal_in_open_gap');
  assert.ok(meals.length>0);
  for(const decision of meals){
    assert.ok(decision.decision!.needs.hunger>=270 && decision.decision!.needs.hunger<300);
    assert.equal(decision.decision!.chosen,null);
    const fact=run.records.find(r=>r.actor===c.hero && r.fact?.from===decision.time && r.fact.kind==='eat');
    assert.ok(fact?.fact);
    assert.equal(fact.fact.until-decision.time,20);
  }
});
