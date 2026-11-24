import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture32} from '../src/life32r3/state.ts';
import {Runtime32} from '../src/life32r3/engine.ts';
import {diagnostics32} from '../src/life32r3/diagnostics.ts';

test('32r3诊断区分动作、长期变化与人工阅读，按实际清醒分钟统计',()=>{
 const c=fixture32(),r=new Runtime32(c).advance(400),d=diagnostics32(c,r.state,r.records);
 assert.equal(d.time.awakeMinutes,400);
 assert.ok(d.opportunities.currentGoals.length>=2);
 assert.ok(d.time.itineraries.length>0);
 assert.equal(d.story.quality,'HUMAN_PENDING');
 assert.equal(d.story.longTermTransitions.length,r.records.filter(r=>r.kind==='life_goal_progress'&&r.actor==='hero').length);
});

test('32r3无行动诊断不虚构发展，零时段不产生非法比例',()=>{
 const c=fixture32(),r=new Runtime32(c).advance(0),d=diagnostics32(c,r.state,[]);
 assert.equal(d.time.awakeMinutes,0);assert.equal(d.time.commuteRatio,0);
 assert.equal(d.story.longTermTransitions.length,0);
});
