import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {setTimeout} from 'node:timers/promises';
import {createStudioServer} from '../../src/studio/server.ts';
import {Store32} from '../../src/life32r3/store.ts';

async function openStudio(root:string) {
  const app=createStudioServer({root});
  await new Promise<void>(done=>app.server.listen(0,'127.0.0.1',done));
  const address=app.server.address();
  assert.ok(address && typeof address!=='string');
  const base='http://127.0.0.1:'+address.port;
  const request=(path:string,body?:unknown,key='')=>fetch(base+'/api/v1/life32r3'+path,
    body===undefined?{}:{method:'POST',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)});
  async function read(path:string,body?:unknown,key='') {
    const response=await request(path,body,key);
    assert.ok(response.ok, await response.clone().text());
    return response.json();
  }
  async function focus(id:string,key:string) {
    const job=await read('/experiments/'+id+'/jobs',{mode:'focus',realMinutes:25,rate:8},key);
    for(let poll=0;poll<300;poll++) {
      const current=await read('/jobs/'+job.id);
      if(current.status==='completed')return current;
      assert.ok(['running','queued'].includes(current.status),current.message);
      await setTimeout(20);
    }
    assert.fail('专注任务未完成');
  }
  return {app,base,read,request,focus};
}

test('专注 HTTP 入口按到期时间提交，重启和重复点击均只产生一次生活记录',async()=>{
  const root=mkdtempSync(join(tmpdir(),'journey-focus-'));
  let studio=await openStudio(root);
  try{
    const {config}=(await studio.read('/bootstrap')).journeyPresets[0];
    const e=await studio.read('/experiments',{name:'计时验证',config},'timer-test');
    const prefix='/experiments/'+e.id,timer=prefix+'/timer';
    const start={action:'start',id:'study',realMinutes:25,rate:6},end={action:'finish',id:'study'};
    const first=await studio.read(timer,start);
    assert.equal(first.timer.status,'running');
    assert.equal((await studio.request(timer,end)).status,409);
    assert.equal((await studio.request(prefix+'/jobs',{mode:'focus',realMinutes:25,rate:8},'conflict')).status,409);
    assert.equal((await studio.read(prefix)).sessions.length,0);
    await studio.app.close();studio=await openStudio(root);
    assert.equal((await studio.read(timer)).timer.until,first.timer.until);
    studio.app.life32r3.catalog.db.prepare('UPDATE journey_timers SET until=0 WHERE experiment=?').run(e.id);
    const [one,two]=await Promise.all([studio.read(timer,end),studio.read(timer,end)]);
    assert.deepEqual(one.timer,two.timer);
    const saved=await studio.read(prefix);
    assert.equal(saved.sessions.length,1);assert.equal(saved.sessions[0].rate,6);assert.equal(saved.sessions[0].realMinutes,25);
    assert.ok((await studio.read(prefix+'/recap?sequence=1')).text);
  }finally{await studio.app.close();rmSync(root,{recursive:true,force:true});}
});

test('Studio旅途按背景创建，已提交属性变化能溯源，重启从原地点与属性继续',async()=>{
  const root=mkdtempSync(join(tmpdir(),'studio-journey-'));
  let studio=await openStudio(root);
  try {
    const boot=await studio.read('/bootstrap');
    assert.equal(boot.presets.length,4);
    assert.ok(boot.journeyPresets?.length,'缺少旅途预设');
    const preset=boot.journeyPresets.find((p:{config:{background:string}})=>p.config.background==='traveler');
    assert.equal(preset.config.journey,true);
    const config=structuredClone(preset.config);
    config.worlds[0].initialCashCents+=100;
    const e=await studio.read('/experiments',{name:'阿远的旅途',config},'create');
    const legacy=await studio.read('/experiments',{name:'原定居配置',config:boot.presets[0].config},'legacy');
    assert.equal((await studio.read('/experiments/'+legacy.id)).state.journey,undefined);
    assert.equal((await studio.read('/experiments')).items.find((item:{id:string})=>item.id===e.id).journey,true);
    await studio.focus(e.id,'first-focus');
    const prefix='/experiments/'+e.id;
    const first=await studio.read(prefix+'/story?sequence=1');
    assert.equal(first.awakeMinutes,200);
    assert.ok(first.attributeChanges.length>0);
    for(const change of first.attributeChanges) {
      assert.equal(change.kind,'attribute_changed');
      assert.ok(boot.attributeLabels[change.data.attribute]);
      const cause=first.facts.find((r:{id:string})=>r.id===change.causes[0]);
      assert.ok(cause?.fact.actors.includes(change.actor));
      assert.notEqual(change.data.before,change.data.after);
    }
    const recap=await studio.read(prefix+'/recap?sequence=1');
    assert.deepEqual(Object.keys(recap).sort(),['companions','refs','text']);
    assert.deepEqual(Object.keys((await studio.read(prefix+'?view=hero')).state.worlds),[config.hero]);
    for(const ref of recap.refs)assert.ok((await studio.read(prefix+'/records/'+ref)).record);
    assert.equal((await studio.request(prefix+'/recap?sequence=1&ask=unknown')).status,404);
    const saved=await studio.read(prefix);
    assert.ok(config.worlds[0].places.some((p:{id:string})=>p.id===saved.state.worlds[config.hero].locationId));
    await studio.app.close();
    studio=await openStudio(root);
    assert.deepEqual((await studio.read(prefix)).state,saved.state);
    await studio.focus(e.id,'next-focus');
    const second=await studio.read(prefix+'/context?sequence=2');
    assert.deepEqual(second.before,saved.state);
    assert.equal(second.after.worlds[config.hero].awakeMinutes-saved.state.worlds[config.hero].awakeMinutes,200);
    assert.deepEqual(await studio.read(prefix+'/story?sequence=1'),first);

    assert.deepEqual(await studio.read(prefix+'/recap?sequence=1'),recap);
    const invalid=structuredClone(config);
    invalid.worlds[0].places[0].name='未登记的地点';
    assert.equal((await studio.request('/experiments',{name:'异常地图',config:invalid},'tampered')).status,422);
    const disabled=structuredClone(config);
    disabled.rules.continuity=false;
    assert.equal((await studio.request('/experiments',{name:'关闭必需规则',config:disabled},'disabled')).status,422);
  } finally {
    await studio.app.close();
    assert.ok(root.startsWith(join(tmpdir(),'studio-journey-')));
    rmSync(root,{recursive:true,force:true});
  }
});

test('Studio按已核验的引擎版本和配置接续原存档', async()=>{
  const root=mkdtempSync(join(tmpdir(),'studio-journey-'));
  const studio=await openStudio(root);
  try {
    const {presets,journeyPresets}=await studio.read('/bootstrap');
    const config=presets[0].config, oldJourney=structuredClone(journeyPresets[0].config);
    delete oldJourney.journeyRevision;
    const previousJourney=structuredClone(oldJourney);
    delete oldJourney.localActivities;
    const e=await studio.read('/experiments',{name:'历史连续生活',config},'historic');
    const old=structuredClone(e);
    const catalog=studio.app.life32r3.catalog;
    const insert=catalog.db.prepare('INSERT INTO experiments(id,payload) VALUES(?,?)');
    for(const [id,engine,sourceConfig] of [
      ['focus-clock-journey','life32r3-f4387640471649d2',{...previousJourney,journeyRevision:6}],
      ['persistent-relations-journey','life32r3-8c163a4c3d3413b3',{...previousJourney,journeyRevision:5}],
      ['adaptive-personality-journey','life32r3-5e93a25b0e5308a9',{...previousJourney,journeyRevision:4}],
      ['fixed-personality-journey','life32r3-57a5aae32a419902',{...previousJourney,journeyRevision:3}],
      ['previous-journey','life32r3-5a55446d89dbcf55',{...previousJourney,journeyRevision:2}],
      ['local-activities-journey','life32r3-0dd7287154448cbe',previousJourney],
      ['prior-journey','life32r3-b96203c209b237cf',oldJourney],
      ['original-journey','life32r3-4a0aaa6f380a9bb5',oldJourney],
      ['round3-with-journey-build','life32r3-4a0aaa6f380a9bb5',config],
      ['original-round3','life32r3-0f5c87055ba29b2d',config],
    ] as const) {
      Object.assign(old,{id,engine,config:sourceConfig});
      insert.run(id,JSON.stringify(old));
      {
        using store=new Store32(catalog.file(id),sourceConfig);
        store.submit({id:'historical-first',sequence:1,realMinutes:25,rate:8});
      }
      const prefix='/experiments/'+id;
      const original=await studio.read(prefix+'/story?sequence=1');
      await studio.focus(id,'resume-'+id);
      const saved=await studio.read(prefix);
      assert.equal(saved.sessions.length,2);
      assert.deepEqual(await studio.read(prefix+'/story?sequence=1'),original);
    }
    old.id='unknown-revision';
    old.engine='life32r3-unknown';
    insert.run(old.id,JSON.stringify(old));
    const blocked=await studio.request('/experiments/'+old.id+'/jobs',{mode:'focus',realMinutes:25,rate:8},'wrong-version');
    assert.equal(blocked.status,409);
    assert.equal((await blocked.json()).error.code,'engine_changed');
    old.id='journey-with-old-stamp';
    old.config=journeyPresets[0].config;
    old.engine='life32r3-0f5c87055ba29b2d';
    insert.run(old.id,JSON.stringify(old));
    const mismatched=await studio.request('/experiments/'+old.id+'/jobs',{mode:'focus',realMinutes:25,rate:8},'wrong-mode');
    assert.equal(mismatched.status,409);
    assert.equal((await mismatched.json()).error.code,'engine_changed');
  } finally {
    await studio.app.close();
    assert.ok(root.startsWith(join(tmpdir(),'studio-journey-')));
    rmSync(root,{recursive:true,force:true});
  }
});
