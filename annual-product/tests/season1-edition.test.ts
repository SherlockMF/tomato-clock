import test from 'node:test';
import assert from 'node:assert/strict';
const {turn, entryText, choiceList, keepsakes, where, windowAt, choiceReply} = await import(new URL('../studio/season1-state.mjs',import.meta.url).href);
const {types,duration} = await import(new URL('../studio/annual-state.mjs',import.meta.url).href);
const {seasonIllustration}=await import(new URL('../studio/season1-edition.mjs',import.meta.url).href);
const {seasonArt}=await import(new URL('../studio/annual-share.mjs',import.meta.url).href);
const create=(type:string,mode:string,preview:boolean,minutes=25)=>turn(null,{kind:'create',edition:2,mode,type,gender:'男',nickname:'阿舟',id:'first',preview,minutes},0);

test('分享背景取自当窗的现场，两个车次、夜市和试稿分支有对应插画',()=>{
  const s={choices:{},ledger:[]};
  for(let n=1;n<=72;n++)assert.ok(seasonArt.includes(seasonIllustration(n,s)));
  assert.equal(seasonIllustration(4,s),'noodles');
  assert.equal(seasonIllustration(26,s),'street');
  assert.equal(seasonIllustration(26,{...s,ledger:[{n:25,amount:-80}]}),'journey');
  assert.equal(seasonIllustration(32,{...s,choices:{31:'stall'}}),'street');
  assert.equal(seasonIllustration(32,{...s,choices:{31:'cafe'}}),'room');
  assert.equal(seasonIllustration(54,{...s,choices:{53:'photo'}}),'ferry');
  assert.equal(seasonIllustration(54,{...s,choices:{53:'rest'}}),'room');
});

test('新版 25/50 分钟结算、跨抉择余量、正式版隔离试读',()=>{
  let s=create('INFP','focus',true,25);
  assert.equal(s.unlocked,0);assert.equal(s.balance,2600);
  assert.equal(turn(s,{kind:'skip',unlocked:0,id:'first'},1),s);
  s=turn(s,{kind:'settle'},duration);
  assert.equal(s.unlocked,1);
  s=turn(s,{kind:'start',unlocked:1,id:'second',minutes:50},duration+1);
  const paused=turn(s,{kind:'pause',id:'second'},duration+1001);
  assert.equal(paused.remaining,2*duration-1000);
  s=turn(paused,{kind:'resume',id:'second'},2*duration);
  s=turn(s,{kind:'settle'},4*duration);
  assert.equal(s.unlocked,2);assert.equal(s.credit,1);
  assert.equal(s.sessions.length,2);assert.deepEqual(s.sessions.map((v:{minutes:number})=>v.minutes),[25,50]);
  assert.equal(turn(s,{kind:'settle'},4*duration+1),s);
  s=turn(s,{kind:'choose',unlocked:2,key:'desk'},4*duration+2);
  assert.equal(s.unlocked,3);assert.equal(s.credit,0);
  assert.equal(turn(s,{kind:'choose',unlocked:2,key:'desk'},4*duration+3),s);
  assert.equal(s.testWindows.length,0);
});

test('新版 16 种人格的混合选择均可到三个结局，账本、日期、物件和已读文本可重放',()=>{
  const endings=['west','wuhan','beijing'];
  const trains=new Set(),northFares=new Set();
  for(const type of types)for(let mask=0;mask<16;mask++)for(const end of endings){
    let s=create(type,'preview',true),bit=0;
    for(let n=1;n<=72;n++){
      if(n>1)s=turn(s,{kind:'skip',id:null,unlocked:n-1},1);
      assert.equal(s.unlocked,n);assert.ok(s.entries[n-1].length>30);
      assert.equal(entryText(s,n),s.entries[n-1]);assert.ok(s.balance>=0);
      const options=choiceList(s,n);
      if(!options.length)continue;
      assert.equal(options.length,n===71?3:2);
      assert.ok(options.every((o:[string,string])=>!/[A-Z±\d]/.test(o[1])));
      const key=n===71?end:options[(mask>>bit++)&1][0];
      s=turn(s,{kind:'choose',unlocked:n,key},2);
      assert.ok(choiceReply(s,n));
    }
    assert.equal(s.choices[71],end);assert.equal(s.entries.length,72);assert.equal(s.testWindows.length,72);
    assert.equal(s.balance,2600+s.ledger.reduce((sum:number,r:{amount:number})=>sum+r.amount,0));
    const rows=(n:number)=>s.ledger.filter((r:{n:number})=>r.n===n).map((r:{amount:number})=>r.amount);
    assert.ok(rows(1).includes(-398));assert.equal(rows(4).includes(200),s.choices[2]==='carry');
    assert.equal(rows(8).includes(1200),s.choices[6]==='job');assert.equal(rows(16).includes(160),s.choices[6]==='river');
    assert.equal(rows(21).includes(-150),s.trace.find((r:{n:number})=>r.n===21).letter==='F');
    assert.equal(rows(32).includes(-300),s.choices[31]==='stall');assert.equal(rows(35).includes(300),s.choices[31]==='stall');
    assert.equal(rows(35).includes(240),s.choices[31]==='stall');assert.equal(rows(34).includes(180),s.choices[31]==='cafe');
    assert.ok(rows(49).includes(-380));assert.equal(rows(54).includes(-240),s.choices[53]==='rest');assert.equal(rows(54).includes(800),s.choices[53]==='rest');
    assert.equal(keepsakes(s).length,3);assert.deepEqual(keepsakes(s).map((o:{n:number})=>o.n),[4,25,46]);
    assert.equal(s.trace.filter((r:{kind:string})=>r.kind==='key').length,5);
    for(let n=1;n<=72;n++)assert.equal(entryText(s,n),s.entries[n-1]);
    assert.ok(where(s,72).includes(({west:'贵阳',wuhan:'武汉',beijing:'北京'} as Record<string,string>)[end]));
    trains.add(rows(25)[0]);if(end==='beijing')northFares.add(rows(71)[0]);
  }
  assert.deepEqual(trains,new Set([-80,-220]));assert.deepEqual(northFares,new Set([-420,-790]));
  assert.deepEqual(windowAt(72).end,{day:15,time:'23:00'});
});

test('途中新增的偏好使小院灯的方案、收支和八天后的回话一起改变',()=>{
  const route:Record<number,string>={2:'desk',6:'job',31:'cafe',53:'photo'};
  const walk=(preference:boolean)=>{
    let s=create('ISTJ','preview',true);
    for(let n=2;n<=59;n++){
      if(n===21 && preference)s=turn(s,{kind:'pref',letter:'F',note:'先问阿姨夜里怎么开门'},0);
      s=turn(s,{kind:'skip',id:null,unlocked:n-1},1);
      if(route[n])s=turn(s,{kind:'choose',unlocked:n,key:route[n]},2);
      if(n===21)s=turn(s,{kind:'pref',letter:'F',remove:true},3);
    }
    return s;
  };
  const alone=walk(false),help=walk(true);
  assert.deepEqual(help.entries.slice(0,20),alone.entries.slice(0,20));
  assert.match(entryText(alone,21),/划掉/);assert.match(entryText(help,21),/一百五十/);
  assert.match(entryText(alone,59),/一盏/);assert.match(entryText(help,59),/灯钱是你出的/);
  const trace=help.trace.find((r:{n:number})=>r.n===21);
  assert.equal(trace.preference.note,'先问阿姨夜里怎么开门');assert.equal(trace.preferenceEffect,'改变了当时的取舍');
  assert.deepEqual(help.ledger.filter((r:{n:number})=>r.n===21).map((r:{amount:number})=>r.amount),[-150]);
});
