import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {JourneyClock} from '../src/studio/journey-clock.ts';
import {connectScene} from '../src/studio/journey-context.ts';
import {Runtime32} from '../src/life32r3/engine.ts';
import {journeyFixture} from '../src/journey/world.ts';
import {pickScene,readerChoices,renderScene} from '../src/studio/journey-reader.ts';
import type {Record32} from '../src/life32r3/types.ts';
import type {Evidence32} from '../src/life32r3/store.ts';

test('专注只能到期结算一次，刷新、重试和取消均保留正确窗口',()=>{
  using db=new DatabaseSync(':memory:');let now=0,commits=0;
  const clock=new JourneyClock(db,()=>now);
  const submit=()=>++commits;
  const start={action:'start',id:'first',realMinutes:25,rate:6};
  clock.command('demo',start,submit);
  assert.equal(new JourneyClock(db,()=>now).latest('demo')?.until,1500000);
  assert.throws(()=>clock.command('demo',{action:'finish',id:'first'},submit));
  assert.throws(()=>clock.command('demo',{...start,id:'second'},submit));
  clock.command('demo',{action:'cancel',id:'first'},submit);
  assert.equal(clock.command('demo',start,submit).status,'cancelled');
  assert.throws(()=>clock.command('demo',{action:'finish',id:'first'},submit));
  const second={...start,id:'second',realMinutes:50,rate:8};
  clock.command('demo',second,submit);now=3000000;
  const finish={action:'finish',id:'second'};
  assert.throws(()=>clock.command('demo',finish,()=>{throw Error('offline');}));
  assert.equal(clock.command('demo',finish,submit).sequence,1);
  assert.equal(clock.command('demo',finish,submit).sequence,1);
  assert.equal(commits,1);assert.throws(()=>clock.command('demo',{...second,rate:6},submit));
});

test('无钱吃饭且夜班未开放时能处理身边的事务，白班到账后才花钱吃饭',()=>{
  const c=journeyFixture('low_assets',11),w=c.worlds[0]!;
  w.initialCashCents=w.monthlyIncomeCents=0;w.initialFatigue=w.sleepAfterMinutes;
  const records=new Runtime32(c).advance(960).records, facts=records.filter(r=>r.actor===c.hero && r.fact);
  const work=facts.findIndex(r=>r.fact!.kind==='work');
  assert.ok(work>=0 && facts.slice(0,work).some(r=>r.fact!.location===w.locationId && ['journey_collect','care'].includes(r.fact!.kind)));
  assert.equal(facts.slice(0,work).some(r=>r.fact!.kind==='eat'),false);
  assert.ok(facts.slice(work+1).some(r=>r.fact!.kind==='eat'));
});

test('第206窗从回信追到同一拦网的两次清理，缺失或串错地点时只显示原文',()=>{
  const config=journeyFixture('creator',19);config.journeyRevision=5;
  const rt=new Runtime32(config);
  const rows=new Map<string,Record32>();let last='';
  for(let i=1;i<=206;i++){
    const before=rt.state,minutes=i%7===0?60:150,{state:after,records}=rt.advance(minutes);
    const e:Evidence32={config,before,after,records,digest:'test',receipt:{id:'w'+i,sequence:i,rate:6,realMinutes:minutes/6,from:before.time,until:after.time,start:before.serial,end:after.serial,digest:'test'}};
    const scene=pickScene(readerChoices(e),last);last=scene.topic;
    for(const row of records)if(!row.world && !row.decision)rows.set(row.id,row);
    if(i!==206)continue;
    assert.equal(scene.row!.id,'v148493');
    const read=()=>renderScene(e,connectScene(e,scene,id=>rows.get(id)));
    const r=read();assert.match(r.text,/知夏.*3筐/);assert.match(r.text,/小梅.*3筐/);
    assert.ok(r.refs.includes('v138125') && r.refs.includes('v143151'));
    const prior=rows.get('v138125')!;
    rows.set(prior.id,{...prior,fact:{...prior.fact!,location:'ridge'}});
    assert.deepEqual(read(),renderScene(e,scene));
    rows.delete(prior.id);assert.deepEqual(read(),renderScene(e,scene));
  }
});
