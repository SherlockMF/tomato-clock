import test from 'node:test';
import assert from 'node:assert/strict';
import {offerMessage, finishMessage} from '../src/journey/correspondence.ts';
import { initial32 } from '../src/life32r3/state.ts';
import type { Emit32, Opportunity32 } from '../src/life32r3/types.ts';
import { generateJourney, finishJourney, journeyFixture, validateJourneyWorld } from '../src/journey/world.ts';

function scenario() {
  const c = journeyFixture('traveler', 37);
  const s = initial32(c);
  let serial = 0;
  const emit: Emit32 = () => 'v' + ++serial;
  generateJourney(c, s, emit);
  const complete = (op: Opportunity32) => {
    s.worlds[op.actor]!.locationId = op.location;
    op.progress = op.minutes;
    finishJourney(c, s, op, emit({ kind: 'fact', actor: op.actor, causes: [op.createdRef] }), emit);
    op.status = 'completed';
  };
  return { c, s, emit, complete };
}

test('归还箱的同一本书只能被一人领取，到原属地交接后才能重新外借', () => {
  const { c, s, emit, complete } = scenario();
  const pickup = s.opportunities.find(o => o.kind === 'journey_collect')!;
  assert.ok(pickup);
  const book = s.journey!.world.books.find(b => b.id === pickup.objectId)!;
  assert.equal(book.status, 'returned');
  generateJourney(c, s, emit);
  assert.equal(s.opportunities.filter(o => o.objectId === book.id).length, 1);
  complete(pickup);
  assert.equal(book.status, 'carried');
  const delivery = s.opportunities.find(o => o.kind === 'journey_deliver' && o.objectId === book.id)!;
  assert.equal(delivery.actor, pickup.actor);
  assert.equal(delivery.location, book.home);
  assert.notEqual(delivery.location, pickup.location);
  assert.ok(delivery.sourceRefs.includes(book.source));
  assert.throws(() => finishJourney(c, s, pickup, 'repeat', emit));
  complete(delivery);
  assert.equal(book.status, 'shelf');
  assert.equal(book.location, book.home);
  assert.equal(book.carrier, null);
});

test('未到场、未完成均不能更新归还箱，待办保留到实际交接', () => {
  const { c, s, emit } = scenario();
  const pickup = s.opportunities.find(o => o.kind === 'journey_collect')!;
  const book = s.journey!.world.books.find(b => b.id === pickup.objectId)!;
  const before = structuredClone(book);
  s.worlds[pickup.actor]!.locationId = pickup.location;
  assert.throws(() => finishJourney(c, s, pickup, 'early', emit));
  pickup.progress = pickup.minutes;
  s.worlds[pickup.actor]!.locationId = 'market';
  assert.throws(() => finishJourney(c, s, pickup, 'remote', emit));
  assert.deepEqual(book, before);
});

test('水情巡视来自变化，完成后同一警情不再催办；修补后旧书重新可借', () => {
  const { c, s, emit, complete } = scenario();
  const world = s.journey!.world;
  const damaged = world.books.find(b => b.status === 'damaged')!;
  const mend = s.opportunities.find(o => o.kind === 'journey_mend' && o.objectId === damaged.id)!;
  complete(mend);
  assert.equal(damaged.status, 'shelf');
  const limit = s.time + 8 * 1440;
  while (!s.opportunities.some(o => o.kind === 'journey_survey') && s.time < limit) {
    s.time += 30;
    generateJourney(c, s, emit);
  }
  const survey = s.opportunities.find(o => o.kind === 'journey_survey')!;
  assert.ok(survey);
  const station = world.stations.find(town => town.location === survey.location)!;
  assert.ok(station.alert);
  complete(survey);
  assert.equal(station.reportedLevel, station.level);
  assert.equal(station.alert, null);
  generateJourney(c, s, emit);
  assert.equal(s.opportunities.filter(o => o.kind === 'journey_survey' && o.location === survey.location).length, 1);
});

test('每个区域提供双向免费路段，移除关键站点后拒绝运行', () => {
  const c = journeyFixture('low_assets');
  assert.doesNotThrow(() => validateJourneyWorld(c));
  const w = c.worlds[0]!;
  for (const from of ['bookstore', 'ford', 'ridge']) {
    for (const to of ['bookstore', 'ford', 'ridge'].filter(other => other !== from)) {
      assert.ok(w.routes.some(route => route.from === from && route.to === to && route.costCents === 0 && route.duration > 0));
    }
  }
  assert.ok(w.routes.some(route => route.to === 'ford' && route.costCents > 0));
  w.places = w.places.filter(place => place.id !== 'ridge');
  assert.throws(() => validateJourneyWorld(c));
});

test('相同借阅在两地发布高水位通报后改在本地归还，异地领取机会随之消失', () => {
  function returnUnder(reading: number) {
    const { c, s, emit } = scenario();
    const world = s.journey!.world;
    const book = world.books.find(b => b.status === 'shelf')!;
    book.status = 'loan';
    book.nextAt = s.time + 30;
    for (const town of world.stations) town.reportedLevel = reading;
    s.time += 30;
    generateJourney(c, s, emit);
    return { book, assigned: s.opportunities.some(o => o.kind === 'journey_collect' && o.objectId === book.id) };
  }
  const safe = returnUnder(2), flooded = returnUnder(5);
  assert.equal(safe.book.id, flooded.book.id);
  assert.notEqual(safe.book.location, safe.book.home);
  assert.equal(flooded.book.location, flooded.book.home);
  assert.equal(safe.assigned, true);
  assert.equal(flooded.assigned, false);
});

test('种子在 M1 合法范围内使用，非法输入不能悄悄产生另一段旅程', () => {
  for (const seed of [-1, 1.2, NaN, 0x1_0000_0000]) assert.throws(() => journeyFixture('traveler', seed));
  assert.equal(journeyFixture('traveler', 0xffffffff).worlds[0]!.seed, 0xffffffff);
});

test('复测开放真实的潮位观察窗口，感兴趣者可错过，创作须由完成的现场观察解锁', () => {
  const { c, s, emit, complete } = scenario();
  const station = s.journey!.world.stations[0]!;
  station.level = 5;
  station.alert = { source: 'initial:test-water', level: 5, assignment: null };
  station.nextWeatherAt = s.time + 600;
  s.journey!.world.nextCheck = s.time;
  generateJourney(c, s, emit);
  const survey = s.opportunities.find(o => o.kind === 'journey_survey' && o.location === station.location)!;
  assert.ok(survey);
  assert.ok(!s.opportunities.some(o => o.kind === 'journey_fieldnote'));
  complete(survey);
  const observations = s.opportunities.filter(o => o.kind === 'journey_fieldnote');
  assert.ok(observations.some(o => o.actor === 'hero') && observations.some(o => o.actor === 'mei'));
  assert.ok(observations.every(o => o.deadline <= station.nextWeatherAt));
  assert.ok(!s.opportunities.some(o => o.kind === 'create'));
  const mine = observations.find(o => o.actor === 'hero')!;
  complete(mine);
  const creation = s.opportunities.find(o => o.kind === 'create' && o.actor === 'hero')!;
  assert.ok(creation.sourceRefs.includes(s.journey!.world.fieldNotes.hero!['bookstore:high']!.source));
  assert.equal(s.opportunities.filter(o => o.actor === 'mei' && o.kind === 'create').length, 0);
  const missed = observations.find(o => o.actor === 'mei')!;
  s.time = missed.deadline + 1;
  assert.throws(() => complete(missed));
});

test('漂枝占满的归还点会被绕过，同一批漂枝只能在场清理一次', () => {
  const {c,s,emit,complete} = scenario(), world = s.journey!.world;
  const st = world.stations.find(t=>t.location==='ford')!;
  for (const station of world.stations) {
    station.rack!.baskets = 12;
    station.reportedLevel = 2;
  }
  const book = world.books.find(b=>b.home!=='ford' && !b.assignment)!;
  book.status='loan';
  book.nextAt=s.time;
  s.worlds.hero!.locationId=st.location;
  world.nextCheck=s.time;
  generateJourney(c,s,emit);
  assert.equal(book.location,book.home);
  const op=s.opportunities.find(o=>o.kind==='journey_clear' && o.objectId==='ford')!;
  assert.ok(op);
  assert.equal(op.actor,'hero');
  world.nextCheck=s.time;
  generateJourney(c,s,emit);
  assert.equal(st.rack!.assignment?.opportunity,op.id);
  assert.throws(()=>finishJourney(c,s,op,'early',emit));
  complete(op);
  assert.equal(st.rack!.baskets,9);
  assert.throws(()=>complete(op));
  assert.equal(st.rack!.baskets,9);
});

test('当面交流引用本人的一次真实经历，人在异地无法发起相同的当面交流', () => {
  const {c,s,emit,complete} = scenario();
  const op=s.opportunities.find(o=>o.kind==='journey_collect')!;
  complete(op);
  s.memories.push({actor:op.actor,topic:op.kind,text:op.subject,source:'v-trip',opportunity:op.id});
  for (const [i,p] of c.people.entries()) {
    s.socialNeed[p.id]=c.rules.socialAfter;
    s.worlds[p.id]!.locationId=['bookstore','ford','ridge'][i]!;
  }
  const refresh=()=>{s.journey!.world.nextCheck=s.time;generateJourney(c,s,emit);};
  refresh();
  assert.ok(!s.opportunities.some(o=>o.rule==='journey/local-conversation/1'));
  for(const p of c.people)s.worlds[p.id]!.locationId='bookstore';
  refresh();refresh();
  const conversations=s.opportunities.filter(o=>o.rule==='journey/local-conversation/1');
  assert.equal(conversations.length,1);
  assert.equal(conversations[0]!.objectId,op.id);
  assert.deepEqual(conversations[0]!.sourceRefs,['v-trip']);
});

test('异地写信须有亲身经历与实际空档；来信可跨日保留，回复只结算一次', () => {
  const {c,s,complete,emit}=scenario();
  const experience=s.opportunities.find(o=>o.kind==='journey_collect')!;
  complete(experience);
  const sender=experience.actor;
  s.memories.push({actor:sender,source:'v-own',text:experience.subject,topic:experience.kind,opportunity:experience.id});
  for(const p of c.people){
    s.worlds[p.id]!.locationId=p.id===sender?'ford':'ridge';
    s.socialNeed[p.id]=720;
  }
  assert.equal(offerMessage(c,s,sender,emit),false);
  s.history.push({actor:sender,kind:'journey_collect',from:s.time-30,until:s.time,ref:'v-own'});
  assert.equal(offerMessage(c,s,sender,emit),false);
  assert.equal(offerMessage({...c,journeyRevision:2},s,sender,emit,true),false);
  assert.ok(offerMessage(c,s,sender,emit,true));
  const news=s.opportunities.at(-1)!, receiver=news.objectId!;
  const trust=s.relations.find(r=>[r.a,r.b].includes(sender) && [r.a,r.b].includes(receiver))!;
  const before=trust.trust;
  assert.equal(offerMessage(c,s,sender,emit),false);
  finishMessage(s,news,'v-sent');
  assert.throws(()=>finishMessage(s,news,'v-again'));
  assert.equal(trust.trust,before);
  s.time+=1440;
  s.history.push({actor:receiver,kind:'waiting',from:s.time-30,until:s.time,ref:'v-available'});
  const reunited=structuredClone(s);
  reunited.worlds[sender]!.locationId=reunited.worlds[receiver]!.locationId;
  assert.equal(offerMessage({...c,journeyRevision:6},reunited,receiver,emit),false);
  assert.ok(offerMessage(c,reunited,receiver,emit),'送信之后到同一地点，先前的来信仍可读');
  const localReply=reunited.opportunities.at(-1)!;
  assert.equal(localReply.rule,'journey/reply/1');
  assert.equal(localReply.sourceRefs[0],'v-sent');
  finishMessage(reunited,localReply,'v-same-place');
  assert.throws(()=>finishMessage(reunited,localReply,'v-duplicate'));
  assert.ok(offerMessage(c,s,receiver,emit));
  const reply=s.opportunities.at(-1)!;
  assert.equal(reply.rule,'journey/reply/1');
  assert.ok(reply.sourceRefs.includes('v-sent'));
  finishMessage(s,reply,'v-read');
  assert.equal(s.journey!.world.inbox![receiver]![sender],undefined);
  assert.equal(trust.trust,before+1);
  assert.throws(()=>finishMessage(s,reply,'v-repeat'));
});

test('旅途手记只采用本人已完成的旅途经历，同一来源只收录一次', async () => {
  const {offerJournal}=await import('../src/journey/journal.ts');
  const {c,s,complete,emit}=scenario();
  const experience=s.opportunities.find(o=>o.kind==='journey_collect')!;
  complete(experience);
  const id=experience.actor;
  s.history.push({actor:id,kind:'waiting',from:s.time-90,until:s.time,ref:'v-wait'});
  const memory={actor:id,topic:experience.kind,text:experience.subject,source:'v-own',opportunity:experience.id};
  assert.equal(offerJournal(c,s,id,emit),false);
  s.memories.push({...memory,actor:'other'});
  assert.equal(offerJournal(c,s,id,emit),false);
  s.memories.push(memory);
  assert.equal(offerJournal(c,s,id,emit),true);
  assert.deepEqual(s.opportunities.at(-1)!.sourceRefs,['v-own']);
  assert.equal(offerJournal(c,s,id,emit),false);
});
