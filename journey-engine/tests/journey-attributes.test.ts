import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture32, initial32} from '../src/life32r3/state.ts';
import {Runtime32} from '../src/life32r3/engine.ts';
import {journeyFixture} from '../src/journey/world.ts';
import type {Activity, Decision32, Fact32, Opportunity32, Record32} from '../src/life32r3/types.ts';
import {applyJourneyFact, initialProfiles, scoreJourneyAttributes} from '../src/journey/attributes.ts';

function opportunity(kind: Activity, id: string, participants = ['hero']): Opportunity32 {
  return {
    id, actor: participants[0]!, participants, kind, subject: kind, location: 'bookstore',
    source: 'environment', sourceRefs: ['initial:fixture'], sourceKey: id, rule: 'test',
    createdRef: 'initial:fixture', goal: id, objectId: null, available: 0, deadline: 10000,
    progress: 60, minutes: 60, inFlight: null, status: 'active', semantic: kind,
  };
}

function fact(o: Opportunity32): Fact32 {
  return {kind: o.kind, actors: o.participants, location: o.location, from: 30, until: 60, title: o.subject,
    text: o.subject, progress: true, semantic: o.semantic, newState: [], opportunity: o.id};
}

function setup(opportunities: Opportunity32[]) {
  const c = fixture32('traveler');
  const state = {journey: {profiles: initialProfiles(c)}, opportunities};
  const changes: Omit<Record32, 'id' | 'sequence' | 'time'>[] = [];
  const emit = (record: typeof changes[number]) => { changes.push(record); return 'test-change'; };
  return {c, state, changes, emit};
}

function decision(opportunities: Opportunity32[]): Decision32 {
  return {actor: 'hero', reason: 'highest_feasible_score', chosen: null, goals: [],
    needs: {hunger: 0, fatigue: 0, cash: 400, social: 0, strain: 0},
    candidates: opportunities.map(o => ({id: o.id, kind: o.kind, score: 50, factors: {base: 50}, reasons: [], travelMinutes: 0}))};
}

test('旅途属性按人物建立；完整事实影响参与者，等待、未完成片段、重放不会多给成长', () => {
  const study = opportunity('study', 'study');
  const chat = opportunity('social', 'meeting', ['hero', 'mei']);
  const {c, state, changes, emit} = setup([study, chat]);
  const profiles = state.journey.profiles;
  assert.notDeepEqual(profiles.hero!.values, profiles.mei!.values);
  assert.notDeepEqual(profiles.hero!.values, initialProfiles(fixture32('settled')).hero!.values);
  const before = structuredClone(profiles);
  study.progress = 30;
  applyJourneyFact(c, state, fact(study), 'v2', emit);
  applyJourneyFact(c, state, {...fact(study), kind: 'waiting', opportunity: null}, 'v3', emit);
  assert.deepEqual(profiles, before);
  study.progress = 60;
  applyJourneyFact(c, state, fact(chat), 'v4', emit);
  assert.ok(profiles.hero!.values.connectionNeed < before.hero!.values.connectionNeed);
  assert.ok(profiles.mei!.values.connectionNeed < before.mei!.values.connectionNeed);
  assert.deepEqual(profiles.lin, before.lin);
  const change = changes.find(row => row.actor === 'mei' && row.data?.attribute === 'connectionNeed')!;
  assert.equal(change.kind, 'attribute_changed');
  assert.deepEqual(change.causes, ['v4']);
  assert.equal(change.data!.before, before.mei!.values.connectionNeed);
  assert.equal(change.data!.after, profiles.mei!.values.connectionNeed);
  const after = structuredClone(profiles);
  applyJourneyFact(c, state, fact(chat), 'v4', emit);
  assert.deepEqual(profiles, after);
});

test('整次重复锻炼的体能收益递减，长期数值保持有界', () => {
  const {c, state, emit} = setup([]);
  const profile = state.journey.profiles.hero!;
  const gains: number[] = [];
  for (let i = 1; i <= 180; i++) {
    const exercise = opportunity('exercise', 'exercise' + i);
    state.opportunities.push(exercise);
    const oldValue = profile.values.stamina;
    applyJourneyFact(c, state, fact(exercise), 'v' + i, emit);
    gains.push(profile.values.stamina - oldValue);
  }
  assert.ok(gains[0]! > gains[1]! && gains[1]! >= 0);
  assert.ok(Object.values(profile.values).every(n => n >= 0 && n <= 100));
  assert.ok(profile.recent.length < 20);
  assert.notEqual(profile.values.curiosity, 100);
});

test('单独改变探索或社交意愿会反转可选行动的名次，硬阻挡仍然保留', () => {
  const explore = opportunity('visit', 'visit'), study = opportunity('study', 'study'), social = opportunity('social', 'social');
  const {c, state} = setup([explore, study, social]);
  const profile = state.journey.profiles.hero!;
  profile.values.stamina = profile.values.craft = 50;
  profile.values.connectionNeed = 50;
  profile.values.curiosity = 5;
  assert.equal(scoreJourneyAttributes(c, state, 'hero', decision([explore, study])).chosen, study.id);
  profile.values.curiosity = 95;
  assert.equal(scoreJourneyAttributes(c, state, 'hero', decision([explore, study])).chosen, explore.id);
  profile.values.curiosity = 45;
  profile.values.connectionNeed = 5;
  assert.equal(scoreJourneyAttributes(c, state, 'hero', decision([study, social])).chosen, study.id);
  profile.values.connectionNeed = 95;
  assert.equal(scoreJourneyAttributes(c, state, 'hero', decision([study, social])).chosen, social.id);
  const d = decision([study, social]);
  d.candidates[1]!.reasons.push('participant_not_ready');
  assert.equal(scoreJourneyAttributes(c, state, 'hero', d).chosen, study.id);
  assert.deepEqual(d.candidates[1]!.reasons, ['participant_not_ready']);
});

test('一次真实学习后改变下一步选择，分数因子能原样持久化并重放', () => {
  const study = opportunity('study', 'study');
  const visit = opportunity('visit', 'visit');
  const {c, state, emit} = setup([study, visit]);
  const values = state.journey.profiles.hero!.values;
  values.curiosity = 49;
  values.stamina = 50;
  const before = scoreJourneyAttributes(c, state, 'hero', decision([study, visit]));
  assert.equal(before.chosen, study.id);
  assert.deepEqual(JSON.parse(JSON.stringify(before)), before);
  applyJourneyFact(c, state, fact(study), 'v10', emit);
  assert.equal(scoreJourneyAttributes(c, state, 'hero', decision([study, visit])).chosen, visit.id);
});

test('同一旅程只改初始探索意愿，正常运行入口实际走出不同的行动顺序', () => {
  const config = journeyFixture('traveler', 19);
  function actions(curiosity: number) {
    const state = initial32(config);
    state.journey!.profiles.hero!.values.curiosity = curiosity;
    const {records} = new Runtime32(config, state).advance(400);
    return records.flatMap(row => row.fact?.actors.includes('hero') && row.fact.opportunity ? [row.fact.kind] : []);
  }
  const curious = actions(95), reserved = actions(5);
  assert.ok(curious.includes('journey_deliver') && reserved.includes('journey_deliver'));
  assert.ok(curious.indexOf('observe') >= 0 && curious.indexOf('observe') < curious.indexOf('journey_deliver'));
  assert.ok(reserved.indexOf('work') >= 0 && reserved.indexOf('work') < reserved.indexOf('journey_deliver'));
});

test('同一组可行事务里，单独改变体能或实务能力能反转选择',()=>{
  for(const [attribute,kind,other] of [
    ['stamina','exercise','study'],['craft','work','practice']
  ] as const){
    const a=opportunity(kind,'a'),b=opportunity(other,'b'),{c,state}=setup([a,b]);
    const values=state.journey.profiles.hero!.values;
    values.curiosity=values.connectionNeed=values.stamina=values.craft=50;
    values[attribute]=5;
    assert.equal(scoreJourneyAttributes(c,state,'hero',decision([a,b])).chosen,b.id);
    values[attribute]=95;
    assert.equal(scoreJourneyAttributes(c,state,'hero',decision([a,b])).chosen,a.id);
  }
});

test('旅途 MBTI 的变动逐条来自参与者的完成事实，旧版初值可重放',async()=>{
  const c=journeyFixture('creator',19),before=structuredClone(c);
  const run=new Runtime32(c).advance(960);
  const changes=run.records.filter(r=>r.kind==='personality_changed');
  assert.ok(changes.length>0);
  for(const r of changes){
    const cause=run.records.find(f=>f.id===r.causes[0]);
    assert.ok(cause?.fact?.actors.includes(r.actor) && cause.fact.progress);
    assert.ok(Math.abs(Number(r.data!.after)-Number(r.data!.before))<=.02000001);
  }
  assert.deepEqual(c,before);
  const split=new Runtime32(c);const a=split.advance(400);
  const b=new Runtime32(c,JSON.parse(JSON.stringify(a.state))).advance(560);
  assert.deepEqual([...a.records,...b.records],run.records);
  assert.deepEqual(b.state,run.state);
  const {hash32}=await import('../src/life32r3/store.ts');
  c.journeyRevision=3;
  assert.equal(hash32(new Runtime32(c).advance(960)),'a89de14e76f8ce586b8fa8c70f06b594ee38afe9100b2f0f336f13d772c80a3b');
});

test('人格成长有30天总变动限额，重读同一事实和未完成事务均不重复累计',()=>{
  const c=journeyFixture('creator',19), s=initial32(c), p=s.journey!.profiles.hero!.personality!;
  const social=opportunity('social','o1',['hero','mei']), journal=opportunity('travel_journal','o2');
  s.opportunities.push(social,journal);
  const start=c.worlds[0]!.start, initial=p.values.E, emit=()=>'test';
  const apply=(o:Opportunity32,n:number,until:number)=>applyJourneyFact(c,s,
    {...fact(o),from:until-30,until},'v'+n,emit);
  for(let i=1;i<=180;i++)apply(i%2?social:journal,i,start+30*i);
  assert.equal(p.used.E,3);
  assert.equal(p.values.E,initial);
  assert.deepEqual(s.journey!.profiles.lin!.personality!.values,c.people.find(p=>p.id==='lin')!.personality);
  apply(social,181,start+30*1440);
  assert.equal(p.values.E,initial+.02);
  apply(social,181,start+30*1440);
  social.progress=30;
  apply(social,182,start+30*1440+30);
  assert.equal(p.used.E,.02);
});

test('学到的人格值进入下次候选评分，初始档案仍保留',async()=>{
  const {score32}=await import('../src/life32r3/planner.ts');
  const c=journeyFixture('creator',19), s=initial32(c);
  const meeting=opportunity('social','o1',['hero','mei']),contact=opportunity('contact','o2');
  const now=s.time;contact.available=now;contact.deadline=now+1440;contact.progress=0;
  s.opportunities.push(meeting,contact);
  const score=()=>score32(c,s,'hero').candidates.find(o=>o.id==='o2')!.factors.personality;
  const base=c.people[0]!.personality.E;
  assert.equal(score(),base*.4);
  applyJourneyFact(c,s,{...fact(meeting),from:now,until:now+60},'v1',()=>'test');
  assert.equal(score(),(base+.02)*.4);
  assert.equal(c.people[0]!.personality.E,base);
});
