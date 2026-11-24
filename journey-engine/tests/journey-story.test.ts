import assert from 'node:assert/strict';
import test from 'node:test';
import { journeyFixture, journeyRegion } from '../src/journey/world.ts';
import { Runtime32 } from '../src/life32r3/engine.ts';
import { story32 } from '../src/life32r3/narrative.ts';

test('旅途回顾保留真实跨区到达，同一班次按本窗全部工时和实收工资展示', () => {
  const config = journeyFixture('low_assets', 19), rt = new Runtime32(config);
  let crossings = 0, combinedShifts = 0;
  for (let sequence = 1; sequence <= 3; sequence++) {
    const before = rt.state, { state: after, records } = rt.advance(960);
    const receipt = { id:'window-'+sequence, sequence, realMinutes:120, rate:8 as const, from:before.time,
      until:after.time, start:before.serial, end:after.serial, digest:'test' };
    const story = story32({config, before, after, records, receipt, digest:'test'});
    let region = journeyRegion(before.worlds.hero!.locationId);
    for (const row of records) {
      if (row.actor !== 'hero' || row.fact?.kind !== 'move') continue;
      const next = journeyRegion(row.fact.location);
      if (region !== next) {
        assert.ok(story.paragraphs.some(p => p.refs.includes(row.id)), '跨区到达被同窗其他事务遮住');
        crossings++;
      }
      region = next;
    }
    for (const paragraph of story.paragraphs) {
      const work = records.filter(r => paragraph.refs.includes(r.id) && r.fact?.kind === 'work');
      if (work.length < 2) continue;
      const minutes = work.reduce((sum, r) => sum + r.fact!.until - r.fact!.from, 0);
      assert.ok(paragraph.text.includes(minutes+'分钟') && paragraph.text.includes(minutes*config.employer.hourlyWageCents/6000+'元'));
      combinedShifts++;
    }
  }
  assert.ok(crossings > 0 && combinedShifts > 0);
});

test('跨窗回顾只串起主角可见且直接引用的事实，待办取自当前窗末', async () => {
  const {journeyThread}=await import('../src/studio/journey-thread.ts');
  const config=journeyFixture('creator',19), rt=new Runtime32(config);
  let incoming=0, outgoing=0;
  for(let sequence=1;sequence<=20;sequence++){
    const before=rt.state,{state:after,records}=rt.advance(200);
    const e={config,before,after,records,digest:'test',receipt:{id:'w'+sequence,sequence,realMinutes:25,rate:8 as const,from:before.time,until:after.time,start:before.serial,end:after.serial,digest:'test'}};
    const thread=journeyThread(e);
    assert.deepEqual(journeyThread({...e,records:[]}),null);
    if(!thread)continue;
    const outcome=records.find(r=>r.id===thread.outcome.ref)!.fact!;
    assert.ok(after.memories.some(m=>m.actor===config.hero && m.source===thread.outcome.ref));
    if(thread.origin){
      incoming++;
      assert.ok(before.memories.some(m=>m.actor===config.hero && m.source===thread.origin!.ref));
      assert.ok(after.opportunities.find(o=>o.id===outcome.opportunity)!.sourceRefs.includes(thread.origin.ref));
      assert.ok(!journeyThread({...e,before:{...before,memories:before.memories.filter(m=>m.actor!==config.hero)}})?.origin);
    }
    if(thread.followUp){
      outgoing++;
      assert.ok(after.opportunities.some(o=>o.createdRef===thread.followUp!.ref && o.sourceRefs.includes(thread.outcome.ref) && ['pending','active','paused'].includes(o.status)));
    }
  }
  assert.ok(incoming>0 && outgoing>0);
});
