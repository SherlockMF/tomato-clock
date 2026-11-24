import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initial32} from '../src/life32r3/state.ts';
import {generate32} from '../src/life32r3/sources.ts';
import type {Emit32,Opportunity32} from '../src/life32r3/types.ts';
import {rememberMiss,relationship,repairRelationship} from '../src/journey/relationship.ts';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {JourneyNarrator,paragraphPlan,localParagraph} from '../src/studio/journey-narrator.ts';
import {readScene} from '../src/studio/journey-reader.ts';
import {Store32} from '../src/life32r3/store.ts';
import {journeyFixture} from '../src/journey/world.ts';

test('失约记在双方关系上，两次失约会改变下一次邀请谁，凭实际接触修复',()=>{
  const c=journeyFixture('creator',19), s=initial32(c);
  const [a,b,other]=c.people.map(p=>p.id) as [string,string,string];
  const rows:Parameters<Emit32>[0][]=[];
  const emit:Emit32=row=>'v'+rows.push(row);
  const pair=relationship(s,a,b)!;
  const ap={opportunity:'o1',start:s.time,end:s.time+30,source:'v0',participants:[a,b]};
  const op={id:'o1',participants:[a,b],actor:a} as Opportunity32;
  rememberMiss(c,s,op,'declined',emit);
  assert.equal(pair.distance,undefined);
  s.appointments![op.id]=ap;
  const contact=()=>{
    const next=structuredClone(s);
    next.worlds[b]!.locationId=next.worlds[a]!.locationId;
    next.worlds[other]!.locationId='ridge';
    next.socialNeed[a]=c.rules.socialAfter;
    generate32(c,next,emit);
    return next.opportunities.find(o=>o.actor===a && o.kind==='contact')!;
  };
  assert.equal(contact().objectId,b);
  rememberMiss(c,s,op,'miss1',emit);
  const incident=pair.source;
  assert.equal(contact().objectId,b);
  assert.ok(contact().sourceRefs.includes(incident));
  const again={...op,id:'o2'};
  s.appointments![again.id]={...ap,opportunity:again.id};
  rememberMiss(c,s,again,'miss2',emit);
  assert.equal(pair.trust,34);
  assert.equal(contact().objectId,other);
  const twice=pair.source;
  repairRelationship(s,a,other,'unrelated',emit);
  assert.equal(pair.source,twice);
  repairRelationship(s,b,a,'reply',emit);
  assert.deepEqual(rows.at(-1)!.causes,[twice,'reply']);
  assert.equal(contact().objectId,b);
});

test('叙事校验失败后可重试，同窗并发只推理一次，重启复用已核准的文字',async()=>{
  const root=mkdtempSync(join(tmpdir(),'journey-narrator-')),file=join(root,'sim.sqlite');
  let calls=0;
  let narrator=new JourneyNarrator(root,async plan=>{
    await Promise.resolve();
    if(++calls===1)return {lead:'捏造事件',end:''};
    return {lead:plan.lead.at(-1),end:plan.end[0]};
  });
  try{
    using store=new Store32(file,journeyFixture('creator',19));
    for(let sequence=1;sequence<=25;sequence++){
      store.submit({id:'w'+sequence,sequence,rate:8,realMinutes:25});
      const {e,scene}=readScene(file,sequence),plan=paragraphPlan(e,scene);
      if(plan.lead.length===1 && plan.end.length===1)continue;
      const render=()=>narrator.render(e,scene,'same-experiment');
      assert.equal((await render()).source,'controlled_fallback');
      const [first,second]=await Promise.all([render(),render()]);
      assert.deepEqual(first,second);
      assert.equal(first.source,'local_model');assert.equal(calls,2);
      await narrator.close();
      narrator=new JourneyNarrator(root,async()=>{throw Error('offline');});
      assert.deepEqual(await render(),first);
      narrator.db.exec("UPDATE paragraphs SET payload='broken'");
      assert.equal((await render()).source,'controlled_fallback');
      assert.deepEqual(store.verify(),store.state());
      return;
    }
    assert.fail('缺少有两种合法措辞的实测窗口');
  }finally{await narrator.close();rmSync(root,{recursive:true,force:true});}
});

test('本地模型只可选择本窗合法的句子编号，拒绝越界、类型错误和截断结果',async()=>{
  let content='{"lead":0,"end":0}',stop='eos';
  const server=createServer((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({content,stop_type:stop}));});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const addr=server.address();assert.ok(addr && typeof addr==='object');
    const plan={lead:['原句。','改写。'],end:['结果。'],refs:['v1']};
    const generate=()=>localParagraph(plan,addr.port);
    assert.deepEqual(await generate(),{lead:'改写。',end:'结果。'});
    for(content of ['{"lead":2,"end":0}','{"lead":"0","end":0}','{"lead":0,"end":-1}','{"lead":0,"end":0,"cash":12}','{}','not json']){
      await assert.rejects(generate());
    }
    content='{"lead":0,"end":0}';stop='limit';await assert.rejects(generate());
  }finally{server.close();await once(server,'close');}
});

test('跨月存档完整核验按委托方实付与工人实收对账',()=>{
  const c=journeyFixture('low_assets',41);
  for(const w of c.worlds)w.start+=26*1440;
  using store=new Store32(':memory:',c);
  store.submit({id:'month',sequence:1,realMinutes:100,rate:8});
  assert.ok(store.db.prepare("SELECT 1 FROM records32 WHERE kind='service_invoice_paid'").get());
  assert.deepEqual(store.verify(),store.state());
});

test('叙事模型提交的新人物、数额、漏句和多余字段被拦截',async()=>{
  const {checkedParagraph}=await import('../src/studio/journey-narrator.ts');
  const p={lead:['知夏在渡口还了书。'],end:['它回到了架上。'],refs:['v2']};
  assert.equal(checkedParagraph(p,{lead:p.lead[0],end:p.end[0]}),p.lead[0]!+p.end[0]!);
  for(const wrong of [{lead:'知夏挣了300元。',end:p.end[0]},{lead:p.lead[0],end:'小明来了。'},{lead:p.lead[0]},{lead:p.lead[0],end:p.end[0],cash:900},null])assert.throws(()=>checkedParagraph(p,wrong));
});
