import assert from 'node:assert/strict';
import test from 'node:test';
import {allTypes} from '../src/travel-story/beijing-mbti.ts';
import {simulateYear,yearWindows} from '../src/travel-story/roaming-year.ts';

test('南京送面与试台从清早走到次晨，两位主角自行承担不同后果',()=>{
  for(const type of ['ESFJ','ESFP']){
    const r=simulateYear(type);
    const pilot=r.events.filter(e=>e.id.includes('nanjing.') && e.day>=236 && e.day<=250);
    assert.equal(pilot.length,15*6);
    assert.ok(pilot.every(e=>e.city==='南京'));
    assert.deepEqual(r.ledger.filter(l=>l.kind==='小剧场戏票').map(l=>[l.day,l.amount]),type==='ESFJ'?[[248,-48]]:[]);
    for(const day of [265,365])assert.ok(r.events.some(e=>e.day===day && e.id.startsWith('nanjing.after')));
  }
});
test('每条全年线均有离职、迁居和年后安排；每次小章后续均能回溯当天分支',()=>{
  for(const type of allTypes){
    const r=simulateYear(type);
    for(const day of [1,12,33,55,60,83,108,133,158,170,190,224,257,280,324,365]){
      assert.ok(r.events.some(e=>e.day===day && e.id==='arc.'+type+'.'+day),type+' '+day);
    }
    for(const w of r.weeks){
      if(w.withoutGrowth===null)continue;
      assert.ok(r.events.some(e=>e.day===w.day+5 && e.id==='reply.'+w.week+'.'+w.choice));
    }
    assert.equal(r.events.filter(e=>e.id.startsWith('finale.')).length,3);
    assert.ok(yearWindows(r.events).every(w=>w.events.length>0));
  }
});

test('个人插章和换城车厢使用各自完整的正文，机会成本与实际支出分开',()=>{
  const roadTexts=new Set<string>();
  for(const type of allTypes){
    const r=simulateYear(type);
    for(const day of [82,148,214,346]){
      assert.equal(r.events.filter(e=>e.day===day && e.id.includes('interlude.'+type+'.')).length,6);
    }
    assert.ok(r.events.every(e=>!(/禾禾|禾时候|禾孩/.test(e.text))),'角色姓名和普通用词被误替换');
    for(const prefix of ['personal.','seasonal.'])assert.equal(r.events.filter(e=>e.id.startsWith(prefix)).length,8);
    assert.deepEqual(r.journeys.map(j=>j.depart),[60,170,280]);
    for(const j of r.journeys){
      assert.ok(r.events.some(e=>e.id===j.source && e.day===j.depart-2 && e.city===j.from));
      for(const [i,delta] of [1,4,7].entries())assert.ok(r.events.some(e=>e.day===j.depart+delta && e.id==='visit.'+j.depart+'.'+(i+1) && e.city===j.to));
    }
    const previous=r.projects.findLast(p=>p.accepted);
    const source=previous?'deliver.'+previous.day:'offer.302';
    assert.ok(r.events.some(e=>e.id===source));
    assert.ok(r.events.some(e=>e.id==='return.'+source && e.day===364));
    for(const day of [60,170,280]){
      const scenes=r.events.filter(e=>e.day===day && e.id.includes('.ride'));
      assert.equal(scenes.length,2);
      for(const e of scenes){assert.match(e.city,/→/);roadTexts.add(e.text);}
    }
    const pilot=['ESFJ','ESFP'].includes(type);
    assert.equal(r.events.filter(e=>e.id.includes('private.'+type+'.')).length,pilot?0:42);
    assert.equal(r.weeks.filter(w=>w.withoutGrowth===null).length,pilot?2:1);
    for(const p of r.projects){
      for(const age of [1,10])assert.ok(r.events.some(e=>e.day===p.day+age && e.id==='tradeoff.'+p.day+'.'+age));
    }
  }
  assert.equal(roadTexts.size,96);
});

test('旧版南京连续重合的144窗中保留不同的实际经历',()=>{
  const text=(type:string)=>yearWindows(simulateYear(type).events).slice(1128,1272)
    .map(w=>w.events.map(e=>e.text).join('\n'));
  const a=text('ESFJ'),b=text('ESFP');
  assert.equal(a.length,144);
  assert.ok(a.filter((v,i)=>v===b[i]).length<10);
});
