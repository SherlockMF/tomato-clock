import test from 'node:test';import assert from 'node:assert/strict';import{mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{setTimeout}from'node:timers/promises';import{createStudioServer}from'../../src/studio/server.ts';
import {studioConfig32}from'../../src/studio/life32r3-catalog.ts';import{fixture32}from'../../src/life32r3/state.ts';
test('Studio32R3拒绝不会生效的未知规则',()=>{const c=fixture32();Object.assign(c.rules,{forceStory:true});assert.throws(()=>studioConfig32(c));});
test('Studio32R3独立模式真实专注、段落依据和旧模式隔离',async()=>{
 const root=mkdtempSync(join(tmpdir(),'studio32r2-')),app=createStudioServer({root});await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const addr=app.server.address() as {port:number},base=`http://127.0.0.1:${addr.port}`;
 const api=async(p:string,body?:unknown,key='test')=>{const r=await fetch(base+'/api/v1'+p,body?{method:'POST',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body)}:{});assert.ok(r.ok,await r.clone().text());return await r.json();};
 try{const b=await api('/life32r3/bootstrap');assert.equal(b.presets.length,4);const e=await api('/life32r3/experiments',{name:'32',config:b.presets[0].config});const job=await api(`/life32r3/experiments/${e.id}/jobs`,{mode:'focus',realMinutes:25,rate:8},'run');let final;
  for(let i=0;i<500;i++){final=await api('/life32r3/jobs/'+job.id);if(!['queued','running'].includes(final.status))break;await setTimeout(10);}assert.equal(final.status,'completed',final.message);
  const story=await api(`/life32r3/experiments/${e.id}/story?sequence=1`);assert.equal(story.awakeMinutes,200);assert.deepEqual(story.errors,[]);assert.ok(story.story.paragraphs.length);const ref=story.story.paragraphs[0].refs[0],proof=await api(`/life32r3/experiments/${e.id}/records/${ref}`);assert.equal(proof.record.id,ref);
  for(const route of ['/api/v1/life/experiments','/api/v1/experiments']){
    const old=await fetch(base+route);assert.equal(old.status,404);await old.json();
  }
 }finally{await app.close();assert.ok(root.startsWith(join(tmpdir(),'studio32r2-')));rmSync(root,{recursive:true,force:true});}
});
