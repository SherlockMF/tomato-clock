import test from 'node:test';
import assert from 'node:assert/strict';

const {turn,windowAt,visibleText,entryText}=await import(new URL('../studio/season1-state.mjs',import.meta.url).href);
const {nodes,optionsFor}=await import(new URL('../studio/season1-story.mjs',import.meta.url).href);
const {types,duration}=await import(new URL('../studio/annual-state.mjs',import.meta.url).href);
const start=(type='INFP')=>turn(null,{kind:'create',id:'first',type,gender:'男',nickname:'阿舟',preview:true},10);
test('旧手记按当时的选择和流水换版，后加偏好不会重演旧决定',()=>{
  let s=start();
  s=turn(s,{kind:'pref',letter:'E'},11);
  for(let n=2;n<=72;n++){
    s=turn(s,{kind:'skip',unlocked:n-1,id:null},20);
    if(nodes[n])s=turn(s,{kind:'choose',unlocked:n,key:optionsFor(n,s.choices)[0][0]},20);
    if(n===4)s=turn(s,{kind:'pref',letter:'I'},21);
  }
  const saved=structuredClone(s);
  saved.entries.fill('旧版手记');
  const before=structuredClone(saved);
  for(let n=1;n<=72;n++)assert.equal(entryText(saved,n),s.entries[n-1]);
  assert.match(entryText(saved,4),/拼桌/);
  assert.deepEqual(saved,before);
});
test('全季混合选择、账本、双轨溯源和十五天时间边界',()=>{
  assert.deepEqual(Object.keys(nodes),['2','6','31','53','71']);
  const endings=new Set(),openings=new Set();
  for(const type of types)for(let mask=0;mask<32;mask++){
    let s=start(type),i=0;
    for(let n=1;n<=72;n++){
      if(n>1)s=turn(s,{kind:'skip',unlocked:s.unlocked,id:null},20);
      assert.equal(s.unlocked,n);assert.ok(s.entries.at(-1).length>20);
      if(n===10 && mask===0)openings.add(s.entries.join(''));
      if(!nodes[n])continue;
      const options=optionsFor(n,s.choices);
      assert.equal(options.length,2);assert.ok(options.every((o:[string,string])=>!/[A-Z\d±]/.test(o[1])));
      assert.equal(turn(s,{kind:'skip',unlocked:n,id:null},20),s);
      const selected=options[(mask>>i++)&1][0],action={kind:'choose',unlocked:n,key:selected};
      s=turn(s,action,20);assert.equal(turn(s,action,20),s);
    }
    endings.add(s.choices[71]);assert.equal(s.entries.length,72);assert.equal(s.testWindows.length,72);
    assert.equal(s.balance,(type.endsWith('J')?20000:28000)+s.ledger.reduce((v:number,r:{amount:number})=>v+r.amount,0));
    assert.equal(s.ledger.some((r:{amount:number,n:number})=>r.amount===3200&&r.n===8),s.choices[6]==='job');
    assert.equal(s.ledger.some((r:{amount:number})=>r.amount===500),s.choices[2]==='carry');
    assert.equal(turn(s,{kind:'start',unlocked:72,id:'end'},22),s);
    let last=0,k=0;
    for(const r of s.trace){
      if(r.kind==='key'){k++;assert.ok(r.delta>=4&&r.delta<=6);}
      else{if(last)assert.ok(r.n-last>=2&&r.n-last<=3);last=r.n;assert.ok(r.delta>=1&&r.delta<=2);}
    }
    assert.equal(k,5);
  }
  assert.equal(openings.size,16);assert.equal(endings.size,3);
  assert.deepEqual(windowAt(5),{start:{day:1,time:'20:20'},end:{day:2,time:'07:40'}});
  assert.deepEqual(windowAt(72).end,{day:15,time:'23:00'});
});
test('偏好只影响后续匹配的决定，50 分持平，过线留痕',()=>{
  let s=start('INFJ');
  s=turn(s,{kind:'pref',letter:'E',note:'先和邻桌打招呼'},15);
  s=turn(s,{kind:'skip',unlocked:1,id:null},20);
  s=turn(s,{kind:'choose',unlocked:2,key:'carry'},20);
  assert.equal(s.scores.JP,50);assert.equal(s.current,'INFJ');
  s=turn(s,{kind:'skip',unlocked:2,id:null},20);
  s=turn(s,{kind:'skip',unlocked:3,id:null},20);
  assert.match(s.entries[3],/拼桌/);assert.equal(s.trace.at(-1).preference.note,'先和邻桌打招呼');
  s=turn(s,{kind:'pref',letter:'I',note:'留点独处时间'},21);
  assert.equal(s.trace.at(-1).preference.note,'先和邻桌打招呼');
  assert.match(visibleText(s,s.entries[0]),/阿舟/);
  for(const n of [4,5])s=turn(s,{kind:'skip',unlocked:n,id:null},21);
  s=turn(s,{kind:'choose',unlocked:6,key:'job'},22);
  assert.equal(s.current,'INTJ');assert.equal(s.trace.at(-1).previous,'INFJ');
});
test('挂起结算、逾期保存偏好和旧页重试均不会重复解锁',()=>{
  let s=turn(null,{kind:'create',type:'ENFP',gender:'女',id:'a'},0);
  s=turn(s,{kind:'pref',letter:'J'},duration+10);
  assert.equal(s.unlocked,1);assert.equal(s.testWindows.length,0);assert.equal(s.trace[0].preference,null);
  s=turn(s,{kind:'start',id:'b',unlocked:1},duration+20);
  const done=turn(s,{kind:'skip',id:'b',unlocked:1},duration+30);
  assert.deepEqual(done.testWindows,[2]);assert.equal(turn(done,{kind:'skip',id:'b',unlocked:1},duration+40),done);
});
