import {currentOnly,release} from './season1-build.mjs';
import {axes, directions, duration, nextFocus, types, displayName} from './annual-state.mjs';
import {moments, nodes, optionsFor, scene} from './season1-story.mjs';
import {dailyMoments, decisionNodes, seasonScene, seasonItems, seasonMoney, bookFare, replies} from './season1-edition.mjs';
import {chapters, chapterAt, chapterPlace, previouslyRead, newItinerary, sceneValue, parts, closedOption, offerBeds, settleChapterMoney, settleChoiceMoney} from './south-season.mjs';

export const length = 72;
export const seasonLength=s=>currentOnly||s?.edition===3?chapters.length:length;
export function clockAt(minutes, end = false) {
  const day = Math.floor((minutes - (end ? 1 : 0)) / 960);
  const local = 420 + minutes - day * 960;
  return {day:day + 1, time:[Math.floor(local/60), local%60].map(v=>String(v).padStart(2,'0')).join(':')};
}
export function windowAt(n,s) {
  if(currentOnly||s?.edition===3){
    const slot=(n-1)%3, day=1+Math.floor((n-1)/3);
    return {start:{day},end:{day},part:parts[slot]};
  }
  return {start:clockAt((n-1)*200), end:clockAt(n*200,true)};
}
export function cityAt(n,choices={}) {
  if(n===72 && choices[71])return '阳朔 → '+({west:'贵阳',wuhan:'武汉',beijing:'北京'})[choices[71]];
  if(n<=2)return '北京 → 武汉';
  if(n<=25)return '武汉';
  if(n===26)return '武汉 → 长沙';
  if(n<=46)return '长沙';
  if(n===47)return '长沙 → 桂林';
  if(n===48)return '桂林';
  return n===49?'桂林 → 阳朔':'阳朔';
}
export function where(s,n){
  if(currentOnly||s?.edition===3)return chapterPlace(s,n);
  if(release || s?.edition===2){
    const slow=s.ledger.some(r=>r.n===25 && r.amount===-80);
    if(n===25)return '武汉 → 长沙';
    if(n===26)return slow?'南下的列车':'武汉 → 长沙';
    if(n===27 && slow)return '列车 → 长沙';
    if(n===71)return '阳朔 → 桂林';
    if(n===72 && s.choices[71])return '桂林 → '+({west:'贵阳',wuhan:'武汉',beijing:'北京'})[s.choices[71]];
  }
  return cityAt(n,s?.choices);
}
export function choiceNode(s,n){
  // Earlier saves already read a complete, authored outcome at 43.
  if((currentOnly||s.edition===3)&&n===43&&s.unlocked>=n&&(s.revisedFrom??Infinity)>n)return undefined;
  if((currentOnly||s.edition===3)&&n===26&&previouslyRead(s,n))return undefined;
  if(currentOnly||s.edition===3){
    const chapter=chapterAt(n);
    if(!newItinerary(s,n)){
      if(n===34)return undefined; // Bed and shifts were already settled when this chapter opened.
      if(chapter?.previousChoice)return chapter.previousChoice;
    }
    if(n===34){
      const options=chapter.choice.options.filter(o=>s.bedOffers?Object.hasOwn(s.bedOffers,o.key):o.key!=='dorm');
      return {...chapter.choice,options};
    }
    return chapter?.choice;
  }
  return (release || s.edition===2?decisionNodes:nodes)[n];
}
export function choiceList(s,n){
  if(currentOnly||s.edition===3)return (choiceNode(s,n)?.options??[]).filter(o=>s.choices[n]===o.key||!closedOption(s,n,o.key))
    .map(o=>{
      // A reader who already opened the old paper-bag decision finishes that same decision.
      if(n===2&&previouslyRead(s,n))return [o.key,o.label,...(o.key==='desk'
        ? ['T',5,'让送件人、收件人与车站都留有明确记录。']:['F',5,'怕陈家父子一直挂心，愿意亲手送到底。'])];
      return [o.key,sceneValue(o.label,s),sceneValue(o.letter,s),o.delta,sceneValue(o.reason,s)];
    });
  return (release || s.edition===2)?(decisionNodes[n]?.options??[]):(nodes[n]?optionsFor(n,s.choices):[]);
}
export function choiceReply(s,n){
  if(currentOnly||s.edition===3)return s.answers[n]?.reply;
  return (release || s.edition===2)?replies[s.choices[n]]:undefined;
}
export function keepsakes(s){
  if(currentOnly||s.edition===3)return chapters.flatMap((c,i)=>{
    if(i>=s.unlocked||!c.item)return [];
    const item=sceneValue(c.item,s);
    return item?[{...item,n:i+1}]:[];
  });
  return (release || s.edition===2)?seasonItems(s):[];
}
function adjust(s,n,kind,letter,amount,reason,preference=null,preferenceEffect=null) {
  const index=axes.findIndex(pair=>pair.includes(letter)), axis=axes[index];
  const before=s.scores[axis], after=Math.max(0,Math.min(100,before+(axis[0]===letter?amount:-amount)));
  const previous=s.current, chars=[...previous];
  chars[index]=after===50?chars[index]:axis[after>50?0:1];
  s.current=chars.join('');
  s.scores={...s.scores,[axis]:after};
  s.trace=[...s.trace,{n,kind,letter,delta:Math.abs(after-before),axis,before,after,previous,current:s.current,reason,preference,preferenceEffect}];
}
function cash(s,n,title,amount) {
  s.ledger=[...s.ledger,{n,title,amount}];
  s.balance+=amount;
}
function dailyContext(n,choices,modern) {
  // A specific commitment can make the less familiar action feel right today.
  const facts={
    10:choices[6]==='job'?['F','错过小院之约后，想听阿宁讲完']:null,
    15:choices[2]==='desk'?['E',modern?'上次循着单号找到了底片，这回也想问清伞柄上的名字':'上次托列车员转交，这次有机会当面道谢']:null,
    33:choices[31]==='cafe'?['T','替班时要替先来等候的人留位置']:null,
    39:choices[2]==='carry'?['E','交过这卷底片，想和学徒一起认认画面']:null,
    51:choices[31]==='stall'?['I',modern?'和露露忙过一晚市集，这回想坐在院子里慢慢看照片':'摆摊那晚太累，想给自己留个安静下午']:null,
    63:choices[53]==='photo'?['E','一起拍过船，想给船工补一张合照']:null
  };
  return facts[n];
}
// Regenerate wording from the saved decisions, including in a previously read journal.
// Reading a new edition must never settle a payment or choose a personality response again.
export function entryText(s,n) {
  if(currentOnly||s.edition===3)return s.entries[n-1];
  if(release || s.edition===2){
    const base=seasonScene(n,s), row=s.trace.find(r=>r.n===n && r.kind==='daily');
    if(!row)return base;
    const [pair,first,second]=dailyMoments[n];
    return base+'\n'+(row.letter===pair[0]?first:second);
  }
  let text=scene(n,s.choices);
  if(n===3)text+=s.type.includes('T')
    ?' 阿宁的手机淋了雨，屏幕一闪一闪的。旅人拿出自己的手机：“你说哪站换车，我来查。”'
    :' “刚才手机黑了，我还怕你出来看不见我。”阿宁抹了一把脸上的雨水。旅人拉她到屋檐底下坐了会儿，等这阵雨小些再走。';
  if(n===25)text+=s.ledger.some(r=>r.n===25 && r.amount===-80)
    ?' 去车站的路上，旅人重新看了一眼票价。普通车慢些，省下的钱够在长沙再住一晚，就买了那班。'
    :' 去车站的路上，旅人买了张动车票。这个点出发，到长沙还赶得上午饭。';
  if(n===68 && s.ledger.some(r=>r.n===68 && r.amount===1200))
    text+=' 第二天醒来，手机上多了一条入账提醒。出门前谈好的那笔授权费到了，回程的车钱有了着落。';
  const daily=s.trace.find(r=>r.n===n && r.kind==='daily');
  if(daily){
    const [axis,first,second]=moments[n];
    text+=daily.letter===axis[0]?first:second;
  }
  return text;
}
function classicMoney(s,n) {
  if(s.choices[31]==='stall' && n===35)cash(s,n,'退回摊位押金',1500);
  if(n===1)cash(s,n,'北京到武汉车票',-398);
  if(n===4) {
    cash(s,n,'汉口晚饭',-18);
    if(s.choices[2]==='carry')cash(s,n,'陈渡托付的跑腿费',500);
  }
  if(n===8 && s.choices[6]==='job')cash(s,n,'展览样稿交付验收',3200);
  if(n===16 && s.choices[6]==='river')cash(s,n,'书店整理照片半日',160);
  if(n===25){
    const tight=s.balance-s.reserve<3900;
    cash(s,n,tight?'武汉到长沙普通列车':'武汉到长沙动车',tight?-80:-220);
  }
  if(n===26)cash(s,n,'长沙青旅四晚',-320);
  if(n===32 && s.choices[31]==='stall')cash(s,n,'夜市摊位押金',-1500);
  if(n===34)cash(s,n,s.choices[31]==='stall'?'明信片分成':'咖啡馆替班',s.choices[31]==='stall'?180:220);
  if(n===47)cash(s,n,'长沙到桂林车票',-185);
  if(n===48)cash(s,n,'桂林床位一晚',-80);
  if(n===49)cash(s,n,'阳朔车费及五晚床位',-445);
  if(n===54 && s.choices[53]==='rest')cash(s,n,'独间两晚补差',-480);
  if(n===68 && s.type.endsWith('J')){
    cash(s,n,'出发前已有作品的半月授权款',1200);
  }
}
function record(s,n) {
  const revised=currentOnly||s.edition===3, modern=release || revised || s.edition===2;
  if(!modern)classicMoney(s,n);
  const chapter=revised?chapterAt(n):null;
  if(revised){
    // Only newly read chapters can award new story objects or open a new decision.
    s.revisedFrom??=n;
    s.travelFrom??=n;
    s.itineraryFrom??=n;
    settleChapterMoney(s,n,cash);
    if(n===34)s.bedOffers=offerBeds(s.balance);
  }
  const body=revised?sceneValue(chapter.text,s):'';
  const pulse=chapter?.pulse;
  const daily=revised?(pulse?[pulse.axis,...pulse.lines]:null):(modern?dailyMoments:moments)[n];
  let reaction='';
  if(daily){
    const [axis,first,second]=daily;
    const pref=s.preferences.find(p=>axis.includes(p.letter));
    const dominant=s.current[axes.indexOf(axis)];
    // A stated preference can tip a close decision. A settled habit needs more than one nudge.
    const context=revised?sceneValue(pulse.memory,s):dailyContext(n,s.choices,modern);
    // Personality, memory, and this axis's preference cast signed votes.
    const sign=l=>l===axis[0]?1:-1;
    const habit=sign(dominant)*(1+Math.floor(Math.abs(s.scores[axis]-50)/10));
    const base=habit+(context?sign(context[0])*2:0);
    const score=base+(pref?sign(pref.letter)*3:0);
    const letter=score===0?dominant:axis[score>0?0:1];
    const used=pref?.letter===letter?pref:null, line=sceneValue(letter===axis[0]?first:second,s);
    reaction=line;
    const reason=context?.[0]===letter?context[1].replace(/。$/,'')+'。'+line:line;
    const withoutPref=base===0?dominant:axis[base>0?0:1];
    const effect=modern && used?(letter===withoutPref?'让原有倾向更强':'改变了当时的取舍'):null;
    adjust(s,n,'daily',letter,used?2:1,reason,used,effect);
  }
  if(revised){
    const text=body.includes('{反应}')?body.replace('{反应}',()=>reaction):reaction?body+'\n'+reaction:body;
    s.entries=[...s.entries,text];
    if(chapter.automatic){
      const axis=chapter.autoAxis;
      const habit=axis&&s.current[axes.indexOf(axis)];
      const pref=axis&&s.preferences.find(p=>axis.includes(p.letter));
      const {key,...answer}=chapter.automatic(s,pref?.letter??habit);
      if(pref){
        answer.preference=pref;
        answer.preferenceEffect=pref.letter===habit?'顺着原本的习惯':'改变了当时的取舍';
      }
      s.choices={...s.choices,[n]:key};
      s.answers={...s.answers,[n]:answer};
    }
    s.highlights=[...s.highlights,sceneValue(chapter.quote,s)];
  }else{
    if(modern)seasonMoney(s,n,cash);
    s.entries=[...s.entries,entryText(s,n)];
  }
  return s;
}
// A completed 50-minute focus earns two windows, even if a decision falls between them.
function revealCredit(s){
  while(s.credit>0 && s.unlocked<seasonLength(s) && !(choiceNode(s,s.unlocked) && !s.choices[s.unlocked])){
    s={...s,unlocked:s.unlocked+1,credit:s.credit-1};
    if(!release&&s.trialFrom)s.testWindows=[...s.testWindows,s.unlocked];
    record(s,s.unlocked);
  }
  return s;
}
function settleSeason(s){
  const minutes=s.minutes;
  const next={...s,id:null,deadline:null,remaining:duration,
    credit:minutes/25,sessions:[...s.sessions,{minutes,from:s.unlocked+1}]};
  if(!release)delete next.trialFrom;
  return revealCredit(next);
}
export function turn(state,action,now=Date.now()) {
  if(!state){
    if(currentOnly||action.edition===3){
      if(action.kind!=='create'||!types.includes(action.type))return null;
      const minutes=action.minutes===50?50:25;
      const s={edition:3,mode:'focus',type:action.type,current:action.type,
        nickname:String(action.nickname??'').trim().slice(0,24)||'阿南',id:action.id??null,unlocked:0,
        minutes,remaining:minutes*60000,deadline:action.id?now+minutes*60000:null,credit:0,sessions:[],includePrologue:!!action.id,
        scores:Object.fromEntries(axes.map((axis,i)=>[axis,action.type[i]===axis[0]?57:43])),
        balance:2600,entries:[],choices:{},answers:{},highlights:[],preferences:[],ledger:[],trace:[]};
      if(!release){
        s.testWindows=[];
        if(action.mode==='preview'){
          s.mode='preview';
          if(action.preview)return record({...s,id:null,deadline:null,unlocked:1,includePrologue:true,testWindows:[1]},1);
        }
      }
      return s;
    }
    else if(release){
      if(action.kind!=='create' || !types.includes(action.type) || !['女','男'].includes(action.gender))return null;
      const minutes=action.minutes===50?50:25;
      return {edition:2,mode:'focus',type:action.type,current:action.type,nickname:displayName(action),gender:action.gender,
        id:action.id,unlocked:0,minutes,remaining:minutes*60000,deadline:now+minutes*60000,credit:0,sessions:[],
        scores:Object.fromEntries(axes.map((axis,i)=>[axis,action.type[i]===axis[0]?54:46])),
        balance:2600,reserve:0,entries:[],choices:{},preferences:[],ledger:[],trace:[]};
    }
    else{
      const modern=action.edition===2, preview=modern? action.mode==='preview' && !!action.preview : action.preview;
      const first=nextFocus(null,{...action,preview},now);
      if(!first)return null;
      const j=first.type.endsWith('J');
      const s={...first,current:first.type,scores:Object.fromEntries(axes.map((a,i)=>[a,first.type[i]===a[0]?54:46])),
        balance:j?20000:28000,reserve:j?16000:24000,ledger:[],entries:[],choices:{},preferences:[],trace:[]};
      if(modern){
        const minutes=action.minutes===50?50:25;
        Object.assign(s,{edition:2,mode:action.mode==='preview'?'preview':'focus',minutes,sessions:[],credit:0,
          balance:2600,reserve:0,remaining:minutes*60000,deadline:preview?null:now+minutes*60000});
      }
      return first.unlocked?record(s,1):s;
    }
  }
  const revised=currentOnly||state.edition===3, modern=release || revised || state.edition===2;
  const limit=seasonLength(state);
  const waiting=choiceNode(state,state.unlocked) && !state.choices[state.unlocked];
  if(action.kind==='choose'){
    const opt=choiceList(state,state.unlocked).find(o=>o[0]===action.key);
    if(!waiting || action.unlocked!==state.unlocked || !opt)return state;
    const s={...state,choices:{...state.choices,[state.unlocked]:opt[0]}};
    if(revised){
      settleChoiceMoney(s,s.unlocked,opt[0],cash);
      const chosen=choiceNode(s,s.unlocked).options.find(o=>o.key===opt[0]);
      s.answers={...s.answers,[s.unlocked]:{reply:sceneValue(chosen.reply,s),quote:sceneValue(chosen.quote,s)}};
    }else if(s.unlocked===71 && modern)bookFare(s,opt[0],cash);
    if(s.unlocked===71 && !modern){
      const fares={west:['阳朔往贵阳车票',-200],wuhan:['阳朔往武汉车票',-380],beijing:['阳朔往北京车票',-790]};
      cash(s,71,...fares[opt[0]]);
    }
    if(opt[2])adjust(s,s.unlocked,'key',opt[2],opt[3],opt[4]);
    return modern?revealCredit(s):s;
  }
  if(action.kind==='rename') {
    const name=String(action.nickname??'').trim().slice(0,24);
    return name?{...state,nickname:name}:state;
  }
  // Resolve any expired focus first, so a late preference cannot change what already happened.
  if(state.deadline!==null && state.deadline<=now){
    const s=currentOnly || release || modern?settleSeason(state):record(nextFocus(state,{kind:'settle'},now),state.unlocked+1);
    return action.kind==='pref'?turn(s,action,now):s;
  }
  if(action.kind==='pref'){
    if(state.unlocked>=limit || !Object.hasOwn(directions,action.letter))return state;
    const axis=axes.find(a=>a.includes(action.letter));
    const rest=state.preferences.filter(p=>!axis.includes(p.letter));
    if(!action.remove && rest.length>=3)return state;
    const preference={from:state.unlocked+1,letter:action.letter,note:String(action.note??'').trim().slice(0,80)};
    return {...state,preferences:action.remove?rest:[...rest,preference]};
  }
  if(waiting || state.unlocked>=limit)return state;
  if(modern){
    if(!release && action.kind==='skip' && state.mode!=='preview')return state;
    if(action.kind==='start' && !state.id && state.unlocked===action.unlocked){
      const minutes=action.minutes===50 && state.unlocked+2<=limit?50:25;
      return {...state,id:action.id,minutes,remaining:minutes*60000,deadline:now+minutes*60000};
    }
  }
  if(!release && revised && action.kind==='skip'){
    if(state.mode!=='preview'||state.id!==action.id||state.unlocked!==action.unlocked)return state;
    const minutes=state.id?state.minutes:action.minutes;
    const credit=minutes===50 && state.unlocked+2<=limit?2:1;
    return revealCredit({...state,id:null,deadline:null,remaining:duration,credit,trialFrom:state.unlocked+1});
  }
  if(currentOnly||release||revised){
    if(!state.id || state.id!==action.id)return state;
    if(action.kind==='pause' && state.deadline!==null)return {...state,remaining:state.deadline-now,deadline:null};
    if(action.kind==='resume' && state.deadline===null)return {...state,deadline:now+state.remaining};
    if(action.kind==='cancel')return {...state,id:null,deadline:null,remaining:duration};
    return state;
  }
  else{
    if(!['start','pause','resume','skip','cancel','settle'].includes(action.kind))return state;
    const s=nextFocus(state,action,now);
    return s.unlocked>state.unlocked?record(s,s.unlocked):s;
  }
}
export function visibleText(s,text) {
  return text.replace(/旅人/g,()=>s.nickname);
}
