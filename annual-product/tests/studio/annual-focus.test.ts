import assert from 'node:assert/strict';
import test from 'node:test';
import {annualBook,annualJourney} from '../../src/studio/annual-book.ts';
import {allTypes} from '../../src/travel-story/beijing-mbti.ts';
const {nextFocus,types}=await import(new URL('../../studio/annual-state.mjs',import.meta.url).href);

test('结束一次只揭晓一窗；过期的回调、取消和多天离开都不能额外推进',()=>{
  const start=nextFocus(null,{kind:'create',type:'ISTJ',gender:'女',id:'a'},500);
  assert.equal(start.unlocked,0);
  assert.equal(start.deadline,1500500);
  assert.deepEqual(nextFocus(start,{kind:'settle',id:'a'},1500499),start);
  const done=nextFocus(start,{kind:'settle',id:'a'},900000000);
  assert.equal(done.unlocked,1);assert.equal(done.deadline,null);
  const running=nextFocus(done,{kind:'start',id:'b',unlocked:1},900000000);
  assert.deepEqual(nextFocus(running,{kind:'cancel',id:'a'},900000100),running);
  assert.deepEqual(nextFocus(done,{kind:'settle',id:'a'},900000000),done);
  const paused=nextFocus(running,{kind:'pause',id:'b'},900001234);
  assert.equal(paused.remaining,1500000-1234);
  const resumed=nextFocus(paused,{kind:'resume',id:'b'},910000000);
  assert.equal(resumed.deadline,910000000+paused.remaining);
  assert.equal(nextFocus(paused,{kind:'cancel',id:'b'},910000000).unlocked,1);
  assert.deepEqual(nextFocus(done,{kind:'start',id:'late',unlocked:0},900000001),done);
  const last=nextFocus({...running,unlocked:1751},{kind:'settle',id:'b'},999999999);
  assert.equal(last.unlocked,1752);
  assert.deepEqual(nextFocus(last,{kind:'start',id:'z',unlocked:1752},999999999),last);
});


test('年度读本覆盖所有人格、跨夜时间与现金，非法人格没有读本',()=>{
  assert.deepEqual(types,allTypes);
  for(const t of allTypes){
    const cards=annualBook(t);
    assert.equal(cards.length,1752);
    assert.equal(cards[0]!.number,1);
    assert.ok(cards[0]!.events.some(e=>e.city.includes('北京')));
    assert.equal(cards.at(-1)!.events.at(-1)!.day,365);
    assert.ok(cards.every((w,i)=>w.number===i+1 && w.events.length && Number.isSafeInteger(w.account.cash)));
    assert.ok(cards.some(w=>w.sleep===480 && w.events.some(e=>e.at.slice(0,10)!==w.from.slice(0,10))));
  }
  assert.throws(()=>annualBook('XXXX'),/找不到这条旅程/);
  assert.ok(annualBook('ESFJ')[1187]!.account.items.some(s=>s.includes('-48 元')));
});
test('初始人物只建立一次，无效人格和性别不产生存档',()=>{
  for(const [type,gender] of [['NONE','男'],['ENFP','无']]){
    assert.equal(nextFocus(null,{kind:'create',id:'A',type,gender},100),null);
  }
  const first=nextFocus(null,{kind:'create',type:'ISTJ',gender:'女',id:'A'},150);
  assert.deepEqual(nextFocus(first,{kind:'create',type:'ENFP',gender:'男',id:'B'},151),first);
  const late=nextFocus(first,{kind:'cancel',id:'A'},1500150);
  assert.equal(late.unlocked,1);
});

test('昵称贯穿人物称呼，兼容旧档和昵称中的替换符',async()=>{
  const {storyText,displayName}=await import(new URL('../../studio/annual-state.mjs',import.meta.url).href);
  const old={type:'INTJ',gender:'男',unlocked:8,id:null,deadline:null,remaining:1500000};
  assert.equal(displayName(old),'小川');
  const named=nextFocus(old,{kind:'rename',nickname:'  阿$&  '},0);
  assert.equal(named.unlocked,8);
  assert.equal(storyText('小禾问阿宁。阿宁叫住小禾：“{称呼}！”',named),'阿$&问阿宁。阿宁叫住阿$&：“小伙子！”');
  assert.equal(displayName({...old,gender:'女'}),'小禾');
});
test('测试跳过仅解锁一窗，重复请求、过期计时和年末不重复登记',()=>{
  const first=nextFocus(null,{kind:'create',preview:true,type:'ESFP',gender:'女',nickname:'林一',id:'a'},0);
  assert.deepEqual(first.testWindows,[1]);assert.equal(first.deadline,null);
  const skip={kind:'skip',unlocked:1,id:null};
  const second=nextFocus(first,skip,5);
  assert.deepEqual(second.testWindows,[1,2]);assert.equal(second.unlocked,2);
  assert.deepEqual(nextFocus(second,skip,6),second);
  const active=nextFocus(second,{kind:'start',unlocked:2,id:'b'},10);
  assert.deepEqual(nextFocus(active,{kind:'skip',unlocked:2,id:null},15),active);
  const paused=nextFocus(active,{kind:'pause',id:'b'},20);
  assert.equal(nextFocus(paused,{kind:'skip',unlocked:2,id:'b'},30).unlocked,3);
  const done=nextFocus(active,{kind:'skip',unlocked:2,id:'b'},1500010);
  assert.deepEqual(done.testWindows,[1,2]);assert.equal(done.unlocked,3);
  const end={...second,unlocked:1752};
  assert.deepEqual(nextFocus(end,{kind:'skip',unlocked:1752,id:null},50),end);
});

test('分享配图优先使用本段的具体场景，日常用语不冒充新场景',async()=>{
  const {sceneFor}=await import(new URL('../../studio/annual-share.mjs',import.meta.url).href);
  for(const [text,expected] of [
    ['乐手把谱架推回幕布后，合唱队还在排练。','rehearsal'],
    ['换好泳衣，小禾才敢往浅水池走。','pool'],
    ['容青按下快门，又把刚才的样片放大给客人看。','photo'],
    ['楼梯口的灯亮了，邻居把晾衣架推回院子里。','courtyard'],
    ['她问旧书铺还收不收这套旧书。','bookshop'],
    ['谢莹抱着猫粮进屋，小禾过去洗猫碟。','pet'],
    ['回房躺到床头，手机上还留着一张照片。','room'],
    ['两人路过公园，望见水鸟掠过水面。','park'],
    ['端着水杯坐了一会儿。','room'],
  ]){
    assert.equal(sceneFor([{events:[{day:6,id:'6.1',text}]}],0),expected);
  }
});

test('同一地点的分享图跟随本段动作，回看稳定，不借下一段的动作',async()=>{
  const {sceneFor}=await import(new URL('../../studio/annual-share.mjs',import.meta.url).href);
  for(const [type,n,expected] of [['ESFP',185,'plum'],['ESFP',227,'tofu'],['ISTP',641,'football'],['ISFJ',1244,'bicycle'],['INFP',12,'kitchen']] as const){
    const book=annualBook(type);
    assert.equal(sceneFor(book,n-1),expected);
    sceneFor(book,n);
    assert.equal(sceneFor(book,n-1),expected);
  }
  const w=(text:string)=>({events:[{day:7,id:'7.1',text}]});
  assert.equal(sceneFor([w('厨房里的人说了一会儿话。'),w('许嫂把豆腐切成两份。')],0),'kitchen');
  assert.notEqual(sceneFor([w('院里停着送快递的自行车。')],0),'bicycle');
  assert.notEqual(sceneFor([w('她把豆腐脑喝完，推碗起身。')],0),'tofu');
});

test('偏好按存档时点生效，过期专注先结算，同窗可修改，旧档可继续',()=>{
  const initial=nextFocus(null,{kind:'create',id:'x',type:'INFP',gender:'男'},0);
  const saved=nextFocus(initial,{kind:'preference',letter:'S',note:'留意细节'},1500000);
  assert.equal(saved.unlocked,1);
  assert.deepEqual(saved.preferences,[{from:2,letter:'S',note:'留意细节'}]);
  const revised=nextFocus(saved,{kind:'preference',letter:'N',note:'换个角度'},1500001);
  assert.equal(revised.preferences.length,1);
  assert.equal(nextFocus(revised,{kind:'preference',letter:'X'},1500002),revised);
  const next=nextFocus(revised,{kind:'skip',id:null,unlocked:1},1500003);
  const more=nextFocus(next,{kind:'preference',letter:'S',note:'观察'},1500004);
  assert.deepEqual(more.preferences.map((p:{letter:string})=>p.letter),['N','S']);
  assert.equal(more.preferences[1].from,3);
});

test('个人偏好真实改变武汉的故事，回忆和人格依据跟随已发生的分支',()=>{
  const baseline=annualBook('INFP');
  const run=annualJourney('INFP',[{from:2,letter:'S'}]);
  const same=annualJourney('INFP',[{from:2,letter:'N'}]);
  assert.ok(run.cards && same.cards);
  assert.deepEqual(run.cards[0],baseline[0]);
  assert.match(run.cards[5]!.events[0]!.text,/面/);
  assert.notEqual(run.cards[5]!.events[0]!.id,baseline[5]!.events[0]!.id);
  const first=run.changes.find(c=>c.influence)!;
  assert.equal(first.influence!.natural,'N');assert.equal(first.influence!.chosen,'S');
  assert.ok(first.after<first.before && run.cards[first.number-1]!.events.some(e=>e.id===first.source));
  const aligned=same.changes.find(c=>c.influence)!;
  assert.equal(aligned.influence!.natural,aligned.influence!.chosen);
  const late=annualJourney('INFP',[{from:6,letter:'S'}]);
  assert.deepEqual(late.cards!.slice(0,9),baseline.slice(0,9));
  assert.throws(()=>annualJourney('INFP',[{from:0,letter:'S'}]));
  assert.throws(()=>annualJourney('INFP',[{from:4,letter:'S'},{from:2,letter:'N'}]));
});

test('后加的偏好保留已有正文、流水和成长记录，可追到周内决定和后续回应',()=>{
  const from=450;
  const original=annualJourney('INFP',[]), baseline=annualBook('INFP');
  const run=annualJourney('INFP',[{from,letter:'J'},{from,letter:'E'}]);
  assert.deepEqual(run.cards!.slice(0,from-1),baseline.slice(0,from-1));
  assert.deepEqual(run.changes.filter(c=>c.number<from),original.changes.filter(c=>c.number<from));
  const decision=run.changes.find(c=>c.source.startsWith('w') && c.influence && c.influence.natural!==c.influence.chosen)!;
  assert.ok(decision.number>=from);
  const week=decision.source.split('.')[0]!.slice(1);
  assert.ok(run.cards!.some(w=>w.events.some(e=>e.id==='reply.'+week+'.'+decision.influence!.chosen)));
});
