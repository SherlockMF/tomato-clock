import test from 'node:test';
import assert from 'node:assert/strict';
import {Runtime32} from '../src/life32r3/engine.ts';
import {journeyFixture} from '../src/journey/world.ts';
import {initial32, validate32} from '../src/life32r3/state.ts';
import {offer32} from '../src/life32r3/sources.ts';
import {score32} from '../src/life32r3/planner.ts';
import {itineraryScore} from '../src/life32r3/itinerary.ts';
import {Store32} from '../src/life32r3/store.ts';

test('免费住宿的零分账目可以由 SQLite 逐项严格重放', () => {
  const c=journeyFixture();
  for(const world of c.worlds) world.initialFatigue=world.sleepAfterMinutes-15;
  using store=new Store32(':memory:',c);
  store.submit({id:'free-bunk',sequence:1,realMinutes:25,rate:8});
  const entries=store.state().worlds.hero!.ledger.filter(e=>e.category==='lodging');
  assert.ok(entries.some(e=>e.amountCents===0));
  assert.deepEqual(store.verify(),store.state());
});

test('身处免费书站临睡前留在当地，零现金和有钱的旅人都无须回家', () => {
  for (const [location, cash] of [['bookstore', 0], ['ford', 40000]] as const) {
    const c = journeyFixture('low_assets', 19), w = c.worlds[0]!;
    w.locationId = location;
    w.initialCashCents = cash;
    w.initialFatigue = w.sleepAfterMinutes - 15;
    const {state, records} = new Runtime32(c).advance(15);
    const sleep = records.find(r => r.actor === c.hero && r.world?.kind === 'sleep_started')!;
    assert.equal(sleep.world!.preconditions.locationId, location);
    assert.equal(sleep.world!.data.amountCents, 0);
    assert.equal(state.worlds[c.hero]!.cashCents, cash);
  }
});

test('旅人从付不起的夜宿点提早实际转场；保存及拼接窗口不改变住宿或钱', () => {
  const c = journeyFixture('low_assets', 19), w = c.worlds[0]!;
  w.locationId = 'park';
  w.initialCashCents = 0;
  w.initialFatigue = w.sleepAfterMinutes - 45;
  const rt = new Runtime32(c);
  const first = rt.advance(12), second = rt.advance(45);
  const whole = new Runtime32(c).advance(57);
  assert.deepEqual(second.state, whole.state);
  assert.deepEqual([...first.records, ...second.records], whole.records);
  const sleep = whole.records.find(r => r.actor === c.hero && r.world?.kind === 'sleep_started')!;
  assert.equal(sleep.world!.data.amountCents, 0);
  assert.ok(whole.records.some(r => r.actor === c.hero && r.fact?.kind === 'move' && r.fact.until > r.fact.from && r.sequence < sleep.sequence));
});

test('缺钱且饥饿的人在白天仍可先值班再用实得工资吃饭', () => {
  const c = journeyFixture('low_assets', 19), w = c.worlds[0]!;
  w.initialCashCents = 0;
  w.initialFatigue = 0;
  const s = initial32(c);
  s.worlds[c.hero]!.needs.hungerMinutes = 300;
  const {records} = new Runtime32(c, s).advance(120);
  const work = records.find(r => r.actor === c.hero && r.fact?.kind === 'work');
  const meal = records.find(r => r.actor === c.hero && r.fact?.kind === 'eat');
  assert.ok(work && meal && work.sequence < meal.sequence);
});

test('拒绝做完就赶不到床位的睡前工作，未开始的旧行程也要重新校验', () => {
  const c = journeyFixture('low_assets'), w = c.worlds[0]!;
  w.locationId = 'home';
  w.initialCashCents = 0;
  w.initialFatigue = w.sleepAfterMinutes - 40;
  const s = initial32(c);
  offer32(s, () => 'initial:test', {
    actor: 'hero', participants: ['hero'], kind: 'study', subject: '旅店整理笔记', location: 'home',
    minutes: 30, available: s.time, deadline: s.time + 300, objectId: null, source: 'consequence',
    rule: 'test', semantic: 'test', sourceKey: 'test', sourceRefs: ['initial:test'],
  });
  s.itineraries!.hero = {createdAt: s.time, until: s.time+240, source: 'initial:test',
    stops: [{opportunity: 'o1', arrival: s.time, start: s.time, end: s.time + 30}]};
  const d = itineraryScore(c, s, 'hero', score32(c, s, 'hero'), () => 'initial:test');
  assert.equal(d.chosen, null);
  assert.ok(d.candidates[0]!.planningReasons?.includes('lodging_unreachable'));
});

test('拒绝初始已无法到任何可负担床位的配置，足够走回去或当晚能付费均可建档', () => {
  const c = journeyFixture('low_assets'), w = c.worlds[0]!;
  w.locationId = 'park';
  w.initialCashCents = 600;
  w.initialFatigue = w.sleepAfterMinutes - 10;
  assert.throws(() => validate32(c), /park.*600.*10/);
  w.initialFatigue = w.sleepAfterMinutes - 20;
  assert.doesNotThrow(() => validate32(c));
  w.initialFatigue = w.sleepAfterMinutes - 10;
  w.initialCashCents = 800;
  assert.doesNotThrow(() => validate32(c));
});
