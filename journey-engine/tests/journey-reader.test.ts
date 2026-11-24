import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {read32,Store32} from '../src/life32r3/store.ts';
import {journeyFixture} from '../src/journey/world.ts';
import {Runtime32} from '../src/life32r3/engine.ts';
import type {Evidence32} from '../src/life32r3/store.ts';
import {JourneyReading, readerChoices, pickScene, renderScene, askCompanion, readScene} from '../src/studio/journey-reader.ts';
import {connectScene} from '../src/studio/journey-context.ts';
import type {Record32} from '../src/life32r3/types.ts';

test('同一排班跨窗后，已动手清网可以入正文；只有班内进展时仍讲真实收尾',()=>{
  const config=journeyFixture('settled',19),rt=new Runtime32(config);
  const normal=new JourneyReading(),onlyWork=new JourneyReading();
  for(let n=1;n<=262;n++){
    const before=rt.state,minutes=n%5===0?160:200,{state:after,records}=rt.advance(minutes);
    const e:Evidence32={config,before,after,records,digest:'test',receipt:{id:'w'+n,sequence:n,rate:8,realMinutes:minutes/8,
      from:before.time,until:after.time,start:before.serial,end:after.serial,digest:'test'}};
    const actual=normal.select(e);
    const withoutClearing={...e,records:n===262?records.filter(r=>r.fact?.kind!=='journey_clear'):records};
    const rest=onlyWork.select(withoutClearing);
    if(n!==262)continue;
    assert.equal(actual.row?.fact?.kind,'journey_clear');
    const recap=renderScene(e,actual);
    assert.match(recap.text,/60分钟/);assert.doesNotMatch(recap.text,/清走了|清空了/);
    assert.ok(recap.refs.every(ref=>records.some(r=>r.id===ref)));
    assert.equal(rest.row?.fact?.kind,'work');
    const close=renderScene(withoutClearing,rest);
    assert.match(close.text,/180分钟/);assert.match(close.text,/50元/);
    assert.ok(close.refs.some(ref=>records.find(r=>r.id===ref)?.kind==='plan_completed'));
  }
});

test('小周的十窗保留交书与清完拦网，同一次排班的两笔工资按实际到账合讲',()=>{
  const config=journeyFixture('low_assets',19), rt=new Runtime32(config), reading=new JourneyReading();
  const keys=new Set<string>();
  const past=new Map<string,Record32>();
  for(let n=1;n<=85;n++){
    const before=rt.state,minutes=n%5===0?160:200,{state:after,records}=rt.advance(minutes);
    const e:Evidence32={config,before,after,records,digest:'test',receipt:{id:'w'+n,sequence:n,rate:8,realMinutes:minutes/8,
      from:before.time,until:after.time,start:before.serial,end:after.serial,digest:'test'}};
    const scene=reading.select(e);
    for(const r of records)if(r.fact?.kind==='journey_clear' || r.kind==='river_rack_cleared')past.set(r.id,r);
    if(n<76)continue;
    const f=scene.row!.fact!, recap=renderScene(e,scene);
    keys.add(JSON.stringify([f.kind,f.title,f.location]));
    if(n===80)assert.equal(f.kind,'journey_deliver');
    if(n===81){
      assert.equal(f.kind,'work');assert.match(recap.text,/120分钟/);assert.match(recap.text,/100元/);
      assert.deepEqual(recap.refs,['v81301','v81519']);
      const incomplete={...e,records:records.map(r=>r.id==='v81301'?{...r,causes:[]}:r)};
      assert.equal(renderScene(incomplete,scene).refs.length,1);
      assert.doesNotMatch(renderScene(incomplete,scene).text,/100元/);
    }
    if(n===84){
      assert.equal(f.kind,'journey_clear');
      const linked=connectScene(e,scene,id=>past.get(id));
      assert.match(linked.context!.text,/上次.*3筐.*这回.*清空/);
      assert.deepEqual(linked.context!.refs,['v82966','v82970','v85241','v85245']);
      past.delete('v82970');
      assert.equal(connectScene(e,scene,id=>past.get(id)).context,undefined);
    }
  }
  assert.ok(keys.size>=8,'这十个窗口至少有八件不同的主事件可讲');
});

test('主角每窗只读一段，能换题时换题，交互可追问此前亲历，未询问时保留幕后',()=>{
  const config=journeyFixture('creator',19), runtime=new Runtime32(config);
  let last='', variety=0, questions=0;
  for(let i=1;i<=36;i++){
    const before=runtime.state,{state:after,records}=runtime.advance(200);
    const e:Evidence32={config,before,after,records,digest:'test',receipt:{id:'w'+i,sequence:i,from:before.time,until:after.time,start:before.serial,end:after.serial,rate:8,realMinutes:25,digest:'test'}};
    const choices=readerChoices(e), scene=pickScene(choices,last), recap=renderScene(e,scene);
    assert.ok(recap.text.length>0 && !recap.text.includes('\n'));
    assert.ok(recap.refs.every(ref=>records.some(r=>r.id===ref) || before.memories.some(m=>m.actor===config.hero && m.source===ref)));
    if(choices.length>1 && last===choices[0]!.topic){assert.notEqual(scene.topic,last);variety++;}
    if(scene.row?.fact)assert.ok(scene.row.fact.actors.includes(config.hero)||scene.row.fact.affected?.includes(config.hero));
    const privateOnly={...e,records:records.filter(r=>r.fact && !r.fact.actors.includes(config.hero) && !r.fact.affected?.includes(config.hero))};
    assert.equal(readerChoices(privateOnly)[0]!.row,null);
    assert.equal(askCompanion(e,scene,'unknown'),undefined);
    for(const npc of recap.companions){
      const answer=askCompanion(e,scene,npc.id);
      assert.ok(answer);
      if(answer.ref){
        const past=after.history.find(h=>h.actor===npc.id && h.ref===answer.ref);
        const encounter=records.find(r=>recap.refs.includes(r.id) && r.actor===npc.id && r.fact?.kind==='review')??scene.row!;
        assert.ok(past && past.until<=encounter.fact!.from);
        questions++;
      }
    }
    last=scene.topic;
  }
  assert.ok(variety>0 && questions>0);
});

test('直接打开旧窗和顺读选到同一件事，长短专注沿用同一条世界时间线',()=>{
  const dir=mkdtempSync(join(tmpdir(),'journey-reader-')), file=join(dir,'trip.sqlite');
  try{
    const config=journeyFixture('creator',19);
    using db=new Store32(file,config);
    const expected:string[]=[];
    const reading=new JourneyReading();
    const rows=new Map<string,Record32>();
    const runtime=new Runtime32(config);
    for(let i=1;i<=12;i++){
      const realMinutes=i%2?25:50;
      db.submit({id:'read-'+i,sequence:i,rate:8,realMinutes});
      const e=read32(file,i),scene=reading.select(e);
      for(const r of e.records)rows.set(r.id,r);
      expected.push(renderScene(e,connectScene(e,scene,id=>rows.get(id))).text);
      runtime.advance(realMinutes*8);
    }
    assert.deepEqual(runtime.state,db.state());
    for(const i of [12,2,8,5,1,12]){
      const {e,scene}=readScene(file,i);
      assert.equal(renderScene(e,scene).text,expected[i-1]);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
