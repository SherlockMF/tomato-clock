import assert from 'node:assert/strict';
import test from 'node:test';
import {allTypes} from '../src/travel-story/beijing-mbti.ts';
import {simulateYear,yearWindows} from '../src/travel-story/roaming-year.ts';

test('16条完整年度线的时钟、记账、先约后付与人格依据',()=>{
  const signatures=new Set<string>();
  const workChoices=new Set<string>(), destinations=new Set<string>();
  for(const type of allTypes){
    const run=simulateYear(type);
    const windows=yearWindows(run.events);
    assert.equal(windows.length,1752);
    assert.equal(run.months.length,12);
    assert.equal(run.days.length,365);
    assert.equal(run.events.filter(e=>e.id.startsWith('wake.')).length,364);
    assert.equal(windows[0]!.from,0);
    assert.equal(windows.at(-1)!.until,365*1440-480);
    const presented=windows.flatMap(w=>w.events);
    assert.equal(presented.length,run.events.length);
    assert.equal(new Set(presented.map(e=>e.id)).size,presented.length);
    assert.ok(windows.every(w=>w.events.length && w.until-w.from-w.sleep===200));
    assert.ok(run.events.every(e=>e.at%1440<960 && !/E值|人格分数|[EISNTFJP]值|[{}](?!称呼)/.test(e.text.replaceAll('{称呼}','姑娘'))));
    let cash=run.initial.cash;
    for(const row of run.ledger){cash+=row.amount;assert.equal(cash,row.balance);assert.ok(cash>=0);}
    assert.equal(cash,run.months.at(-1)!.cash);
    assert.equal(run.ledger.filter(x=>x.kind==='授权入账').length,type.endsWith('J')?12:0);
    assert.equal(run.ledger.filter(x=>x.kind==='六月底预付').length,1);
    for(const job of run.projects){
      const pay=run.ledger.filter(row=>row.source==='deliver.'+job.day);
      assert.equal(pay.length,Number(job.accepted));
      if(job.accepted){assert.equal(pay[0]!.day,job.day+9);assert.equal(pay[0]!.amount,job.fee);}
    }
    if(type.endsWith('J'))assert.ok(!run.ledger.some(x=>x.kind==='当夜住宿'&&x.day>=30&&x.day<=43));
    if(type.endsWith('P'))assert.ok(!run.ledger.some(x=>x.kind==='城际车票'&&x.day===37));
    assert.ok(run.changes.every(c=>c.before!==c.after && run.events.some(e=>e.id===c.source)));
    assert.ok(run.changes.length>20);
    assert.equal(run.weeks.length,44);
    assert.ok(run.weeks.some(w=>w.withoutGrowth!==null && w.choice!==w.withoutGrowth));
    assert.equal(new Set(run.weeks.map(x=>x.title)).size,44);
    assert.deepEqual(run.days.slice(30,38).map(x=>x.city),type.endsWith('J')?Array(8).fill('贵阳'):['贵阳','贵阳','贵阳','贵阳','贵阳','贵阳','武汉','武汉']);
    assert.deepEqual(run,simulateYear(type));
    signatures.add(run.weeks.map(x=>x.title+'/'+x.choice).join('|'));
    workChoices.add(run.projects.map(p=>Number(p.accepted)).join(''));
    destinations.add(run.days.at(-1)!.city);
  }
  assert.equal(signatures.size,16);
  assert.ok(workChoices.size>1);
  assert.equal(destinations.size,2);
  assert.throws(()=>simulateYear('XXXX'));
});
