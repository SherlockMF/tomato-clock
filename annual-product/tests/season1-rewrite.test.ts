import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const {turn, entryText, choiceList, choiceReply, keepsakes, seasonLength, where, windowAt} =
  await import(new URL('../studio/season1-state.mjs', import.meta.url).href);
const {chapterAt, closedOption, decisionSummary, lodgingForecast, readingMemory, sceneValue} = await import(new URL('../studio/south-season.mjs', import.meta.url).href);
const {sceneUrl} = await import(new URL('../studio/annual-share.mjs', import.meta.url).href);
const {access} = await import(new URL('../studio/season1-minitool.mjs', import.meta.url).href);
const {types} = await import(new URL('../studio/annual-state.mjs', import.meta.url).href);

type Row = {n:number; title:string; amount:number};
type Trace = {n:number; kind:string; letter:string; delta:number; reason:string; preference?:{note:string} | null; preferenceEffect?:string | null};
type State = {
  type:string; current:string; mode:string; unlocked:number; balance:number; ledger:Row[]; choices:Record<number,string>;
  entries:string[]; highlights:string[]; answers:Record<number,{reply:string;quote:string;preference?:{note:string}}>; scores:Record<string,number>;
  trace:Trace[]; id:string | null; deadline:number | null; remaining:number; credit:number;
  sessions:{minutes:number;from:number}[]; testWindows?:number[]; revisedFrom?:number; travelFrom?:number; itineraryFrom?:number;
  bedOffers?:Record<string,number>;
};
type Option = [string, string, string?, number?, string?];
type Route = Record<number,string>;

const decisions = [
  [5,'job','river'], [10,'credit','break'], [14,'knock','note'],
  [18,'press','shift'], [22,'refund','reprint'], [26,'table','walk'], [32,'meet','earn'],
  [34,'room','workstay'], [40,'speak','stand'], [43,'pull','number'],
] as const;
const endings = ['west','wuhan','beijing'] as const;
const city = {west:'贵阳',wuhan:'武汉',beijing:'北京'};
const openingCash = 2600, duration = 25 * 60_000;
const standardBills:Record<number,number> = {1:-398,3:-60,11:-240,14:-92,16:-165,17:-350,20:-70,27:-100,31:-210,37:-90,41:-90};

function create(type:string, mode='focus', minutes=25, preview=false):State {
  return turn(null,{kind:'create',edition:3,type,mode,minutes,preview,id:'first',nickname:'阿舟'},0);
}

function finishFocus(s:State):State {
  // Advance the real reducer's deadline. No test skip or hand-built saves in the route matrix.
  if (!s.id) s=turn(s,{kind:'start',unlocked:s.unlocked,id:'session-'+(s.unlocked+1),minutes:25},s.unlocked*duration);
  assert.notEqual(s.deadline,null);
  return turn(s,{kind:'settle',id:s.id},s.deadline);
}

function choose(s:State, key:string):State {
  return turn(s,{kind:'choose',unlocked:s.unlocked,key},s.unlocked*duration);
}

function routeFor(mask:number):Route {
  return Object.fromEntries(decisions.map(([n,left,right],i)=>[n,(mask>>i)&1?right:left]));
}

function reach(n:number,route:Route,type='INFP'):State {
  let s=create(type);
  while(s.unlocked<n){
    s=finishFocus(s);
    const key=route[s.unlocked];
    if(s.unlocked<n && key) s=choose(s,key);
  }
  return s;
}

test('纸袋按当时性格和已留偏好自行交接，领件人的回话可在手记重读',()=>{
  let start=reach(1,routeFor(0),'INFP');
  start=turn(start,{kind:'pref',letter:'T',note:'东西交接清楚一点'},duration);
  const bag=finishFocus(start);
  assert.deepEqual(choiceList(bag,2),[]);
  assert.equal(bag.choices[2],'desk');
  assert.match(choiceReply(bag,2),/交接号/);
  assert.match(bag.answers[2]?.preference?.note??'',/交接清楚/);
  assert.deepEqual(bag.scores,start.scores);
  assert.equal(choose(bag,'carry'),bag);
});

function assertChanges(before:State, after:State, expected:number[]) {
  const added=after.ledger.slice(before.ledger.length);
  assert.deepEqual(added.map(row=>row.amount),expected,'账目数量或金额不符，第'+after.unlocked+'段');
  assert.ok(added.every(row=>row.n===after.unlocked && row.title.trim().length>0));
  assert.equal(after.balance,before.balance+expected.reduce((sum,x)=>sum+x,0));
  assert.ok(after.balance>=0,'余额不能为负');
}

function chapterBills(n:number, route:Route):number[] {
  const fixed=standardBills[n];
  const shifts=route[34]==='workstay';
  if(n===37 && shifts)return [60,-90];
  if(n===40 && shifts)return [60];
  if(fixed!==undefined)return [fixed];
  if(n===7 && route[5]==='job')return [680];
  if(n===19)return [route[18]==='shift'?220:90];
  if(n===33 && route[32]==='earn')return [300];
  return [];
}

function checkArt(art:string, checked:Set<string>) {
  if(checked.has(art))return;
  const file=sceneUrl(art);
  assert.equal(file,'/annual-scenes/'+art+'.webp');
  const image=readFileSync(new URL('../studio'+file,import.meta.url));
  assert.equal(image.toString('ascii',0,4),'RIFF',art);
  assert.equal(image.toString('ascii',8,12),'WEBP',art);
  assert.ok(image.length>12,art);
  checked.add(art);
}

function checkReading(s:State, n:number, art:Set<string>) {
  const chapter=chapterAt(n), text=entryText(s,n), quote=s.highlights[n-1];
  assert.ok(text && text===s.entries[n-1] && quote && [...quote].length<=55 && text.includes(quote),'正文摘句，第'+n+'段');
  assert.ok(!text.includes('{反应}'),'未展开的人格反应，第'+n+'段');
  assert.deepEqual(windowAt(n,s),{start:{day:Math.ceil(n/3)},end:{day:Math.ceil(n/3)},part:['早上','午后','夜里'][(n-1)%3]});
  checkArt(sceneValue(chapter.art,s),art);
}

function checkAnswer(s:State,n:number) {
  const answer=s.answers[n];
  assert.ok(answer && answer.quote && [...answer.quote].length<=55 && answer.reply.includes(answer.quote),'选择摘句，第'+n+'段');
  assert.equal(answer.reply,choiceReply(s,n));
}

test('从北京带同一笔旅费出发，后院通铺在真实旅程中可订，还能决定要不要继续往西',()=>{
  const tight={...routeFor(0),5:'river',18:'press',22:'refund',32:'meet'};
  const desk=reach(34,tight);
  assert.equal(desk.balance,670);
  assert.deepEqual(choiceList(desk,34).map(([key]:Option)=>key),['dorm','workstay']);
  assert.equal(choose(desk,'room'),desk);
  const withDrawing={...tight,32:'earn'};
  const more=reach(34,withDrawing);
  assert.deepEqual(choiceList(more,34).map(([key]:Option)=>key),['room','dorm','workstay']);
  for(const [bed,projected] of [['room',510],['dorm',660],['workstay',840]] as const){
    const booked=choose(more,bed), end=reach(44,{...withDrawing,34:bed});
    assert.match(lodgingForecast(booked,bed),new RegExp(projected+' 元'));
    assert.equal(end.balance,projected);
    assert.equal(choiceList(end,44).some(([key]:Option)=>key==='west'),projected>=520);
    assert.equal(entryText(end,38).includes('七点半看排戏'),bed!=='workstay');
  }
});

test('许兰自己收照片，旅人留给陈渡的举动才受偏好影响，后文记得那一晚',()=>{
  const route=routeFor(0), before=reach(35,route);
  const advance=(letter:string)=>{
    const saved=turn(before,{kind:'pref',letter,note:'试着陪他一会儿'},35*duration);
    return finishFocus(saved);
  };
  const quiet=advance('I'), talk=advance('E');
  assert.equal(quiet.choices[36],'sit');assert.equal(talk.choices[36],'ask');
  for(const s of [quiet,talk]){
    assert.match(entryText(s,36),/许兰.*私样.*戏袍/);
    assert.deepEqual(s.trace,before.trace);
    assert.equal(s.answers[36]?.preference?.note,'试着陪他一会儿');
    assert.match(entryText(finishFocus(finishFocus(s)),38),s===quiet?/半张凳子/:/澡盆/);
  }
});

test('从真实专注结算遍历三种住宿与其余抉择的组合，逐次尝试三个去向并逐笔核账',()=>{
  let endingsRead=0, westDenied=0, routesRead=0, exchangedBeds=0, dormStays=0, workStayEndings=0, northernSeat=0, minimum=Infinity;
  const art=new Set<string>(), profiles=new Set<string>();
  const candidates=Array.from({length:2**decisions.length},(_,mask)=>{
    const route=routeFor(mask);
    return route[34]==='room'?[route,{...route,34:'dorm'}]:[route];
  }).flat();
  for(const [i,route] of candidates.entries()){
    let s=create(types[i%types.length]);
    let unavailable=false;
    profiles.add(s.type);
    assert.equal(seasonLength(s),45);
    assert.equal(s.balance,openingCash);
    for(let n=1;n<=44;n++){
      const before=s;
      s=finishFocus(s);
      assert.equal(s.unlocked,n);
      assertChanges(before,s,chapterBills(n,route));
      checkReading(s,n,art);
      if(n===31)assert.match(entryText(s,n),s.choices[28]==='hold'?/价目表/:/只供量框/);
      if(n===34){
        const afterRegular=s.balance-280-180;
        const offered=['room','dorm','workstay'].filter(k=>k==='room'?afterRegular>=238:k==='dorm'?afterRegular<520:true);
        assert.deepEqual(choiceList(s,n).map(([k]:Option)=>k),offered);
        if(!offered.includes(route[34]!)){
          assert.equal(choose(s,route[34]!),s);
          unavailable=true;break;
        }
        if(route[34]==='workstay')exchangedBeds++;
        if(route[34]==='dorm')dormStays++;
        assert.deepEqual(s.ledger.filter(row=>row.n===34),[]);
        assert.match(entryText(s,n),/十三、十四号两个前台早班/);
        assert.match(entryText(s,n),route[22]==='refund'?/唐青.*日期/:/旧版三/);
      }
      if(n===38 || n===41){
        const work=route[34]==='workstay';
        assert.equal(entryText(s,n).includes('早班'),work);
      }
      if(n===42)assert.match(entryText(s,n),s.choices[28]==='hold'?/按停机器/:/只供量框的灰样/);
      if(n===44)break;
      const key=route[n];
      if(!key){assert.deepEqual(choiceList(s,n),[]);if([2,28,36].includes(n))checkAnswer(s,n);continue;}
      const options:Option[]=choiceList(s,n);
      if(n!==34)assert.deepEqual(options.map(([k])=>k),decisions.find(([at])=>at===n)?.slice(1));
      const previous=s;
      s=choose(s,key);
      assert.equal(s.choices[n],key);
      const cost=n===18 && key==='press'?-260:n===22 && key==='refund'?-75:n===34?({room:-280,dorm:-130,workstay:-70}[key]??0):0;
      assertChanges(previous,s,cost?[cost]:[]);
      checkAnswer(s,n);
    }
    if(unavailable)continue;
    routesRead++;
    const options:Option[]=choiceList(s,44);
    assert.deepEqual(options.map(([key])=>key),s.balance>=520?endings:['wuhan','beijing']);
    assert.equal(s.trace.filter(row=>row.kind==='key').length,8);
    for(const end of endings){
      const selected=choose(s,end);
      if(end==='west' && s.balance<520){
        assert.equal(selected,s);
        assert.ok(closedOption(s,44,end).includes(String(520-s.balance)));
        westDenied++;
        continue;
      }
      assert.equal(closedOption(s,44,end),'');
      const price=end==='west'?[-220,-300]:end==='wuhan'?[-186]:[s.balance>=880?-790:-238];
      assertChanges(s,selected,price);
      assert.equal(selected.current,s.current);
      assert.deepEqual(selected.scores,s.scores);
      assert.deepEqual(selected.trace,s.trace);
      checkAnswer(selected,44);
      const final=finishFocus(selected);
      assertChanges(selected,final,[]);
      checkReading(final,45,art);
      assert.deepEqual(final.entries.slice(0,44),s.entries);
      assert.deepEqual(final.highlights.slice(0,44),s.highlights);
      assert.equal(where(final,45),'桂林 → '+city[end]);
      if(end==='beijing'){
        const hardSeat=price[0]===-238;
        if(hardSeat)northernSeat++;
        assert.match(entryText(final,45),hardSeat?/硬座/:/高铁/);
        assert.match(entryText(final,45),/玄关.*杯盖/);
      }
      if(end==='west')assert.match(entryText(final,45),/路费和两晚的床都付过了/);
      assert.equal(final.entries.length,45);
      assert.equal(final.sessions.length,45);
      assert.equal(final.balance,openingCash+final.ledger.reduce((sum,row)=>sum+row.amount,0));
      assert.equal(turn(final,{kind:'start',unlocked:45,id:'out-of-season'},46*duration),final);
      const items:{n:number;scene:string}[]=keepsakes(final);
      assert.deepEqual(items.map(item=>item.n),end==='west'?[3,11,15,25,30,37,41,44]:[3,11,15,25,30,37,41]);
      for (const item of items)checkArt(item.scene,art);
      if(route[34]==='workstay')workStayEndings++;
      minimum=Math.min(minimum,final.balance);
      endingsRead++;
    }
  }
  assert.equal(profiles.size,16);
  assert.equal(routesRead,1088);
  assert.equal(westDenied,128);
  assert.equal(endingsRead,3136);
  assert.equal(dormStays,96);
  assert.equal(exchangedBeds,512);
  assert.equal(workStayEndings,1536);
  assert.equal(minimum,20);
  assert.equal(northernSeat,352);
});

test('新人格从57/43出发，纸袋只留下剧情后果，四轴都需要累积才能转向',()=>{
  const axesByChapter:Record<number,string>={5:'TF',10:'SN',14:'IE',18:'JP',22:'TF',26:'IE',32:'JP',40:'SN'};
  for(const [chapter,axis] of Object.entries(axesByChapter)){
    const n=Number(chapter), s=reach(n,routeFor(0));
    assert.deepEqual(new Set(choiceList(s,n).map((o:Option)=>o[2])),new Set(axis));
    assert.ok(choiceList(s,n).every((o:Option)=>o[3]===5));
  }
  for(const type of types){
    const initial=create(type);
    for(const [i,axis] of ['IE','SN','TF','JP'].entries())
      assert.equal(initial.scores[axis],type[i]===axis[0]?57:43);
    const bag=reach(2,routeFor(0),type);
    assert.deepEqual(choiceList(bag,2),[]);
    assert.equal(bag.choices[2],type[2]==='T'?'desk':'carry');
    assert.deepEqual(bag.scores,reach(1,routeFor(0),type).scores);
    assert.equal(bag.current,type);
    const firstKey=reach(5,routeFor(0),type);
    assert.equal(choose(firstKey,type[2]==='T'?'river':'job').current,type);
    const towardsS=type[1]==='N';
    const route={...routeFor(0),10:towardsS?'credit':'break',40:towardsS?'speak':'stand'};
    const day=reach(26,route,type);
    assert.equal(day.current[1],type[1]);
    assert.match(entryText(day,20),towardsS?/绳结/:/取景框/);
    assert.match(entryText(day,26),towardsS?/绳结/:/手心/);
    assert.equal(reach(45,{...route,44:'wuhan'},type).current[1],towardsS?'S':'N');
    const contrary={...routeFor(0),5:type[2]==='T'?'river':'job',14:type[0]==='I'?'knock':'note',
      18:type[3]==='J'?'press':'shift',22:type[2]==='T'?'reprint':'refund',26:type[0]==='I'?'table':'walk',
      32:type[3]==='J'?'earn':'meet',44:'wuhan'};
    const later=reach(45,contrary,type);
    for(const axis of [0,2,3])assert.notEqual(later.current[axis],type[axis],type+' 的第 '+axis+' 维未能自然转向');
  }
});

test('还书从第二段开始，武汉便答出挥手之谜，长沙和阳朔能过自己的日子',()=>{
  const base=routeFor(0), joined=reach(45,{...base,26:'table',44:'wuhan'}),solo=reach(45,{...base,26:'walk',44:'wuhan'});
  assert.match(entryText(joined,1),/辞职/);
  assert.match(entryText(joined,1),/阿宁/);
  assert.doesNotMatch(entryText(joined,1),/陈渡|陈父|老周|展册|底片|北门/);
  assert.match(entryText(joined,2),/唐青/);
  assert.match(entryText(joined,2),/还书|展册/);
  assert.match(entryText(joined,7),/跳板/);
  assert.match(entryText(joined,7),/相机/);
  assert.match(entryText(joined,27),/夜市/);
  assert.notEqual(entryText(joined,27),entryText(solo,27));
  assert.match(entryText(joined,35),/锣/);
  assert.match(entryText(joined,41),/锣/);
  assert.doesNotMatch(joined.entries.join(''),/雨天别从北门走/);
  for(const row of joined.trace)assert.doesNotMatch(row.reason,/。。/,'档案里的决定摘要');
});

test('更新时保留旧分数和已读事实，旧第26段不追加强制选择',()=>{
  const through=reach(26,routeFor(0));
  const old={...through,entries:[...through.entries.slice(0,25),'何姐只约了渡口见面。'],scores:{...through.scores,IE:54},
    highlights:[...through.highlights.slice(0,25),'何姐只约了渡口见面。']};
  delete old.travelFrom;
  assert.deepEqual(choiceList(old,26),[]);
  assert.equal(choose(old,'table'),old);
  const next=finishFocus(old);
  assert.equal(next.unlocked,27);
  assert.equal(next.travelFrom,27);
  assert.equal(next.choices[26],undefined);
  assert.deepEqual(next.entries.slice(0,26),old.entries);
  assert.deepEqual(next.scores,old.scores);
  assert.match(readingMemory(next,26).notes.at(-1).text,/何姐只约了渡口见面/);
  const finished=reach(45,{...routeFor(0),44:'wuhan'});
  assert.equal(turn(finished,{kind:'pref',letter:'N',note:'季终再试'},0),finished);
  assert.equal(turn(finished,{kind:'pref',letter:'N',remove:true},0),finished);
});

test('第43段先听到两难，决定后才抽页；两条路在退房前与陈渡说开',()=>{
  const pending=reach(43,routeFor(0));
  assert.deepEqual(choiceList(pending,43).map((o:Option)=>o[0]),['pull','number']);
  assert.equal(turn(pending,{kind:'start',unlocked:43,id:'early'},0),pending);
  assert.doesNotMatch(entryText(pending,43),/工作人员开始抽|旅人.*报了两遍/);
  const offered=choose(pending,'number'),pulled=choose(pending,'pull');
  for(const s of [offered,pulled]){
    assert.equal(s.balance,pending.balance);
    assert.match(choiceReply(s,43),/抽/);
    assert.match(entryText(finishFocus(s),44),/陈渡/);
    assert.notDeepEqual(readingMemory(s,43),readingMemory(pending,43));
  }
  assert.notEqual(choiceReply(offered,43),choiceReply(pulled,43));
  assert.notEqual(readingMemory(offered,43).notes[0].text,readingMemory(pulled,43).notes[0].text);
  assert.notEqual(entryText(finishFocus(offered),44),entryText(finishFocus(pulled),44));
});

test('50 分钟试读跨抉择分两次揭晓，只记试读；下一次正式专注单独计时',()=>{
  const preview=create('ISFP','preview',25,true);
  const skipped=turn(preview,{kind:'skip',minutes:50,id:null,unlocked:1},1);
  assert.deepEqual([skipped.unlocked,skipped.credit,skipped.sessions.length],[3,0,0]);
  const fourth=turn(skipped,{kind:'skip',minutes:25,id:null,unlocked:3},1);
  const pending=turn(fourth,{kind:'skip',minutes:50,id:null,unlocked:4},1);
  assert.deepEqual([pending.unlocked,pending.credit],[5,1]);
  const continued=choose(pending,'river');
  assert.equal(continued.unlocked,6);
  assert.deepEqual(continued.testWindows,[1,2,3,4,5,6]);
  assert.equal(choose(continued,'river'),continued);
  const focused=finishFocus(continued);
  assert.equal(focused.sessions.length,1);
  assert.deepEqual(focused.testWindows,[1,2,3,4,5,6]);
});

test('接着旧旅程读，仅在新解锁的章节发放石头和第43段的选择',()=>{
  const beforeStone=reach(36,routeFor(0));
  delete beforeStone.revisedFrom;
  const newMorning=finishFocus(choose(beforeStone,'return'));
  assert.deepEqual(newMorning.entries.slice(0,36),beforeStone.entries);
  assert.ok(keepsakes(newMorning).some((item:{n:number})=>item.n===37));
  const beforeCall=reach(42,routeFor(0));
  delete beforeCall.revisedFrom;
  const newCall=finishFocus(beforeCall);
  assert.equal(newCall.revisedFrom,43);
  assert.deepEqual(choiceList(newCall,43).map((o:Option)=>o[0]),['pull','number']);
  assert.ok(!keepsakes(newCall).some((item:{n:number})=>item.n===37));
  const oldCall={...newCall,entries:[...beforeCall.entries,'旅人报了两遍号码，然后请老周抽掉整页。']};
  delete oldCall.revisedFrom;
  assert.deepEqual(choiceList(oldCall,43),[]);
  assert.equal(choose(oldCall,'pull'),oldCall);
  assert.match(readingMemory(oldCall,43).notes.at(-1).text,/先请老周替自己递号码/);
  const resumed=finishFocus(oldCall);
  assert.equal(resumed.unlocked,44);
  assert.equal(resumed.revisedFrom,44);
  assert.deepEqual(resumed.entries.slice(0,43),oldCall.entries);
  assert.deepEqual(resumed.trace,oldCall.trace);
  assert.equal(resumed.balance,oldCall.balance);
  assert.equal(resumed.choices[43],undefined);
  assert.deepEqual(choiceList(resumed,43),[]);
});

test('改变早先一笔工作会打开贵阳；初始人格和结局互不绑定',()=>{
  const poor:Route={...routeFor(0),5:'river',18:'press',22:'refund',32:'meet'};
  for(const type of types){
    const tight=reach(44,{...poor,34:'dorm'},type), paid=reach(44,{...poor,5:'job'},type);
    assert.equal(tight.balance,360);
    assert.equal(paid.balance,890);
    const work=reach(44,{...poor,34:'workstay'},type);
    assert.equal(work.balance,540);
    assert.equal(choose(work,'west').balance,20);
    assert.equal(reach(44,{...poor,22:'reprint',34:'workstay'},type).balance,615);
    assert.equal(choose(tight,'west'),tight);
    assert.equal(choose(paid,'west').choices[44],'west');
    for(const end of ['wuhan','beijing']){
      const selected=choose(tight,end);
      assert.equal(selected.choices[44],end);
      assert.equal(selected.current,tight.current);
    }
  }
});

test('床钱只在选定时支付，两次早班分别结算，两种早晨和去向都可预见',()=>{
  const route={...routeFor(0),5:'river',18:'press',22:'refund',32:'meet'};
  const atDesk=reach(34,route);
  assert.match(lodgingForecast(atDesk,'dorm'),/360 元.*还差 160 元/);
  assert.match(lodgingForecast(atDesk,'workstay'),/540 元.*还能余 20 元/);
  assert.ok(!atDesk.ledger.some(row=>row.n===34));
  for(const bed of ['dorm','workstay']){
    const booked=choose(atDesk,bed);
    assert.equal(choose(booked,bed),booked);
    assert.equal(lodgingForecast(booked,bed),lodgingForecast(atDesk,bed));
    const end=reach(44,{...route,34:bed});
    assert.deepEqual(end.ledger.filter(row=>row.title.includes('班工钱')).map(row=>[row.n,row.amount]),bed==='workstay'?[[37,60],[40,60]]:[]);
    assert.match(entryText(end,38),bed==='workstay'?/许兰学了一声/:/又坐到早上七点半看排戏/);
    assert.match(entryText(end,41),bed==='workstay'?/比划的筷子想象/:/当时在旁边笑/);
  }
});

test('上一版已经读过的两档房价继续履约；许兰旧回复留在手记，旧手选仍可溯源',()=>{
  const route={...routeFor(0),5:'river',18:'press',22:'refund',32:'meet'};
  const pending=reach(34,route);
  delete pending.bedOffers;
  pending.ledger=pending.ledger.map(row=>row.n===17?{...row,amount:-300}:row);
  pending.balance=openingCash+pending.ledger.reduce((sum,row)=>sum+row.amount,0);
  assert.equal(pending.balance,720);
  for(const [bed,amount] of [['room',280],['workstay',120]] as const){
    assert.deepEqual(choiceList(pending,34).map(([key]:Option)=>key),['room','workstay']);
    const booked=choose(pending,bed);
    assertChanges(pending,booked,[-amount]);
    assert.match(decisionSummary(booked,34),bed==='room'?/付清四晚/:/120元/);
    assert.equal(lodgingForecast(booked,bed),lodgingForecast(pending,bed));
    let next=booked;
    while(next.unlocked<38)next=finishFocus(next);
    assert.equal(next.ledger.some(row=>row.n===37&&row.amount===60),bed==='workstay');
    assert.equal(entryText(next,38).includes('值旅舍的早班'),bed==='workstay');
  }
  const old=reach(36,routeFor(0));
  old.choices[36]='return';
  Object.assign(old.answers[36]!,{actor:'许兰自己决定',summary:'许兰带走整格私样。',reply:'走啦，大象也要回家吃饭的。'});
  assert.equal(choiceReply(old,36),'走啦，大象也要回家吃饭的。');
  assert.equal(decisionSummary(old,36),undefined);
  assert.match(readingMemory(old,36).notes.at(-1).text,/许兰亲自给陈父打过电话/);
  old.choices[36]='cover';
  old.answers[36]={reply:'当面裁样，只留跳板。',quote:'只留跳板。'};
  assert.match(decisionSummary(old,36),/一小截跳板/);
});

test('已翻开的旧选项、收条和房费继续有效，新章才使用新的住法和纪念品',()=>{
  const oldOffer=reach(22,routeFor(0));delete oldOffer.itineraryFrom;
  assert.match(choiceList(oldOffer,22)[0][1],/我来赔/);
  assert.equal(choose(oldOffer,'refund').balance,oldOffer.balance-150);
  const beforeDesk=reach(33,{...routeFor(0),5:'river',18:'press',32:'meet'});
  delete beforeDesk.itineraryFrom;
  // These two real old transactions were respectively absent and twice as large.
  beforeDesk.ledger=beforeDesk.ledger.filter(r=>!(r.n===19&&r.amount===90))
    .map(r=>r.n===22?{...r,amount:-150}:r.n===17?{...r,amount:-300}:r);
  beforeDesk.balance=2600+beforeDesk.ledger.reduce((sum,r)=>sum+r.amount,0);
  const desk=finishFocus(beforeDesk);
  assert.equal(desk.balance,555);
  assert.match(choiceList(desk,34)[0][1],/通铺.*130/);
  assert.match(entryText(desk,34),/后院通铺/);
  const room=choose(desk,'dorm');
  assert.equal(room.balance,425);assert.match(choiceReply(room,34),/通铺/);
  const oldPaid={...beforeDesk,unlocked:34,ledger:[...beforeDesk.ledger,{n:34,title:'四晚换宿床位（另值两个早班）',amount:-120}],balance:435};
  assert.deepEqual(choiceList(oldPaid,34),[]);
  assert.equal(choose(oldPaid,'room'),oldPaid);
  assert.equal(finishFocus(oldPaid).balance,oldPaid.balance);
  assert.match(keepsakes(oldPaid).find((v:{n:number})=>v.n===15).title,/房费单/);
});

test('三个去向都能看到唐青自印的采访册，合照和策划邀约各自有代价',()=>{
  for(const final of endings)for(const signature of ['credit','break']){
    const route={...routeFor(0),10:signature,44:final};
    for(const key of ['pull','number']){
      const end=reach(45,{...route,43:key});
      assert.match(entryText(end,1),/署名挤出了边框/);assert.match(entryText(end,8),/单独拿一面墙/);
      assert.match(entryText(end,45),signature==='credit'?/大字采访册/:/自己印了一本/);
      assert.match(entryText(end,44),key==='pull'?/给你寄一份/:/就我们爷俩留一张/);
      assert.equal(entryText(end,44).includes('下周有空'),key==='number');
      assert.equal(end.answers[28]?.reply.includes('露露'),true);
      assert.match(entryText(end,36),/我想留这张整的/);
      assert.match(keepsakes(end).find((v:{n:number})=>v.n===37).detail,/一个水漂都没打起来/);
    }
  }
});

test('偏好从下一段生效，已解锁正文、分享摘句、原有选择及人格记录不被改写',()=>{
  const route=routeFor(0);
  const before=reach(15,route,'ISTJ');
  const untouched=structuredClone(before);
  const withPref:State=turn(before,{kind:'pref',letter:'I',note:'先让对方静静看完照片'},15*duration);
  const baseline=finishFocus(before), changed=finishFocus(withPref);
  assert.deepEqual(before,untouched);
  assert.deepEqual(changed.entries.slice(0,15),untouched.entries);
  assert.deepEqual(changed.highlights.slice(0,15),untouched.highlights);
  assert.deepEqual(changed.answers,untouched.answers);
  assert.deepEqual(changed.trace.slice(0,before.trace.length),untouched.trace);
  const daily=changed.trace.find(r=>r.n===16 && r.kind==='daily');
  assert.ok(daily);
  assert.equal(daily.preference?.note,'先让对方静静看完照片');
  assert.equal(daily.letter,'I');
  assert.equal(daily.delta,2);
  assert.notEqual(entryText(changed,16),entryText(baseline,16));
  assert.ok(daily.preferenceEffect);
});

test('前情只取上回已经读过的事实和人物，守约与改约有各自的回声',()=>{
  const kept={...routeFor(0),5:'river',14:'note',22:'reprint',32:'meet',44:'wuhan'};
  const sameAfternoon=reach(45,kept), tookJob=reach(45,{...kept,5:'job'});
  const notes=(s:State,n:number)=>JSON.stringify(readingMemory(s,n));
  assert.equal(readingMemory(sameAfternoon,0),null);
  for(const s of [sameAfternoon,tookJob]){
    assert.equal(notes(s,4),notes(reach(4,kept),4));
    assert.doesNotMatch(notes(s,4),/露露|许兰|何秀枝|稿子|急稿/);
    assert.equal(notes(s,32),notes(choose(reach(32,kept),kept[32]),32));
    assert.doesNotMatch(notes(s,32),/许兰|何秀枝/);
    assert.match(notes(s,33),/许兰/);
    assert.match(notes(s,39),/何秀枝/);
    assert.match(notes(s,24),/错过了八点的电话/);
    assert.ok(s.highlights[23]?.endsWith('。'));
    assert.match(entryText(s,17),/空框/);
    assert.match(entryText(s,37),/打水漂/);
    assert.doesNotMatch(entryText(s,37),/展览|展签|署名|更正/);
  }
  assert.match(notes(sameAfternoon,6),/合照|分吃第一笼糕/);
  assert.match(notes(tookJob,6),/稿|散/);
  assert.match(entryText(sameAfternoon,12),/歌谱/);
  assert.match(choiceReply(sameAfternoon,14),/三个人/);
  assert.doesNotMatch(choiceReply(sameAfternoon,14),/对不起|道歉/);
  assert.match(choiceReply(tookJob,14),/对不起/);
  assert.match(entryText(sameAfternoon,45),/合照/);
  assert.match(entryText(tookJob,45),/空椅子/);
});

test('通读全季后回到任一章，前情和当时逐章阅读看到的一致',()=>{
  for(const route of [{...routeFor(0),44:'wuhan'},{...routeFor(2047),44:'beijing'}] as Route[]){
    const finished=reach(45,route,'ISTJ');
    let s=create('ISTJ');
    for(let n=1;n<=45;n++){
      s=finishFocus(s);
      const key=route[n];
      if(key)s=choose(s,key);
      const memory=readingMemory(s,n);
      assert.deepEqual(memory,readingMemory(finished,n),'第'+n+'段的回顾提前透露了后文');
      assert.ok(memory.notes.length>0 && memory.notes.every((note:{n:number;text:string})=>note.n<=n && note.text.length>0));
      if(n===4)assert.doesNotMatch(JSON.stringify(memory.people),/切歪/);
    }
  }
});

test('正式计时拒绝试读跳过，跨决定的50分钟只结一次，旧点击与暂停不重复扣款',()=>{
  const prologue:State=turn(null,{kind:'create',edition:3,mode:'focus',type:'INFP',id:null},0);
  assert.equal(prologue.deadline,null);
  assert.equal(turn(prologue,{kind:'settle'},2*duration),prologue);
  const first:State=turn(prologue,{kind:'start',unlocked:0,id:'after-prologue',minutes:25},2*duration);
  assert.equal(first.deadline,3*duration);
  assert.equal(first.unlocked,0);
  let s=create('ENFP','focus',25,true);
  assert.equal(s.unlocked,0);
  assert.equal(turn(s,{kind:'skip',id:s.id,unlocked:0},1),s);
  s=finishFocus(s);
  s=turn(s,{kind:'start',unlocked:1,id:'double',minutes:50},duration);
  const paused:State=turn(s,{kind:'pause',id:'double'},duration+1000);
  assert.equal(paused.remaining,2*duration-1000);
  assert.equal(turn(paused,{kind:'settle'},3*duration),paused);
  s=turn(paused,{kind:'resume',id:'double'},4*duration);
  s=turn(s,{kind:'settle'},6*duration);
  assert.equal(s.unlocked,3);assert.equal(s.credit,0);assert.equal(s.sessions.length,2);
  assert.equal(turn(s,{kind:'settle'},6*duration+1),s);
  const answered=choose(s,'desk');
  assert.equal(answered,s);
  assert.equal(answered.ledger.filter(row=>row.n===3).length,1);
  assert.equal(turn(answered,{kind:'choose',unlocked:2,key:'desk'},6*duration+2),answered);
  const preview=create('ENFP','preview',25,true);
  const skipped:State=turn(preview,{kind:'skip',unlocked:1,id:null},1);
  assert.equal(skipped.unlocked,2);assert.deepEqual(skipped.testWindows,[1,2]);
  assert.deepEqual(answered.testWindows,[]);
  assert.equal(skipped.sessions.length,0);
  const atPress=reach(18,routeFor(0));
  assert.equal(turn(atPress,{kind:'start',id:'too-early',unlocked:18},18*duration),atPress);
  const paid=choose(atPress,'press');
  for(const key of ['press','shift'])
    assert.equal(turn(paid,{kind:'choose',unlocked:18,key},18*duration+1),paid);
  assert.deepEqual(paid.ledger.filter(row=>row.n===18).map(row=>row.amount),[-260]);
});

test('小工具 SDK 的正式槽可重新读取，新建与重读都保留同设备已有的试读进度',async()=>{
  const focusKey='south-focus-v4', previewKey='south-preview-v4';
  const preview=JSON.stringify(create('ENFP','preview',25,true));
  const storage=new Map([[previewKey,preview]]);
  const sdk={
    getStorageInfo:async()=>({errMsg:'getStorageInfo:ok',keys:[...storage.keys()]}),
    getStorage:async({key}:{key:string})=>({errMsg:'getStorage:ok',data:storage.get(key)}),
    setStorage:async({key,data}:{key:string;data:string})=>{storage.set(key,data);return {errMsg:'setStorage:ok'};},
  };
  const prior=Object.getOwnPropertyDescriptor(globalThis,'window');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{xhs:{miniTool:sdk,launchOptions:{miniToolEnv:{buildVersion:9460000}}}}});
  try{
    assert.equal(await access(focusKey,null,turn),null);
    await assert.rejects(access(previewKey,null,turn),/存档格式/);
    const created:State=await access(focusKey,{kind:'create',edition:3,type:'ENFP',id:'saved',mode:'focus'},turn);
    const reopened:State=await access(focusKey,null,turn);
    assert.deepEqual(reopened,created);
    await access(focusKey,{kind:'pause',id:'saved'},turn);
    const paused:State=await access(focusKey,null,turn);
    assert.equal(paused.deadline,null);
    assert.equal(paused.unlocked,0);
    assert.equal(storage.get(previewKey),preview);
  }finally{
    if(prior)Object.defineProperty(globalThis,'window',prior);
    else Reflect.deleteProperty(globalThis,'window');
  }
});
