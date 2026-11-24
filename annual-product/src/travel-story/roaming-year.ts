import assert from 'node:assert/strict';
import {allTypes} from './beijing-mbti.ts';
import {buildMonth,localStamp} from './roaming-month.ts';
import {firstDays} from './roaming-days-01.ts';
import {middleDays} from './roaming-days-11.ts';
import {lastDays} from './roaming-days-21.ts';
import {summer} from './year-summer.ts';
import {winter} from './year-winter.ts';
import {spring} from './year-spring.ts';
import {summerDawns} from './year-summer-dawns.ts';
import {winterDawns} from './year-winter-dawns.ts';
import {springDawns} from './year-spring-dawns.ts';
import {julyDawns,pauseDawns,closingDawns} from './year-other-dawns.ts';
import {letters} from './year-letters.ts';
import {jobs} from './year-work.ts';
import {julyStart} from './year-interludes.ts';
import {pauseDays,finalDays} from './year-pauses.ts';
import {innerArcs,innerFinale} from './year-arcs-inner.ts';
import {outerArcs,outerFinale} from './year-arcs-outer.ts';
import {nanjing,nanjingEchoes} from './year-nanjing.ts';
import {seasonalCallsI} from './year-seasonal-calls-i.ts';
import {seasonalCallsE} from './year-seasonal-calls-e.ts';
import {borrowerNotes} from './year-borrowers.ts';
import {personalReceiptsE} from './year-personal-receipts-e.ts';
import {personalReceiptsI} from './year-personal-receipts-i.ts';
import {cityVisits} from './year-city-visits.ts';
import {earlyCalls} from './year-june-calls.ts';
import {privateIJ} from './year-private-ij.ts';
import {privateIP} from './year-private-ip.ts';
import {privateEX} from './year-private-ex.ts';
import {privateEP} from './year-private-ep.ts';
import {innerDays} from './year-days-inner.ts';
import {outerDays} from './year-days-outer.ts';
import {roadScenes} from './year-road-scenes.ts';
import {replies} from './year-replies.ts';
import {interests,bookedChapters,chapterHours,withinReceipt,travelTicket,workTradeoffs,lastJobLetters} from './year-editorial.ts';
import type {DayRecord,LedgerRow,Traits,YearChapter,YearEvent} from './year-types.ts';

const june=[...firstDays,...middleDays,...lastDays];
const reveal=[96,288,480,672,864];
const arcDays=[1,12,33,55,60,83,108,133,158,170,190,224,257,280,324,365];
const privateDecisions:Record<string,[string,string,number]>={
  ISTJ:['没印的那张展签','F',2], ISFJ:['头锅留给谁','T',2],
  INFJ:['导览里少掉的几秒','F',2], INTJ:['给狮架留下两把椅子','P',2],
  ISTP:['一只手也能解的结','J',2], ISFP:['墙上那个缺笔的字','S',2],
  INFP:['椅子上的雨衣','F',2], INTP:['饭盒合上的声音','F',2],
  ESTJ:['门口那把红转椅','F',2], ENTJ:['六点以前的最后一首歌','J',2],
  ENFJ:['改做坐垫的红被面','T',2], ENFP:['门框上的半指高','S',2],
  ESTP:['纸马照相馆','F',2], ENTP:['猜伞会散会','F',2],
};
const rent:Record<string,number>={'武汉':86,'长沙':92,'桂林':88,'柳州':82,'贵阳':90,'成都':106,'重庆':91,'南京':108,'苏州':96,'杭州':119,'绍兴':85};
const travel:Record<number,number>={1:450,7:180,13:215,19:65,25:192};
const cityPair:Record<number,[string,string]>={1:['重庆','成都'],6:['苏州','南京'],11:['绍兴','杭州']};
const street:Record<string,string>={
  '重庆':'门牌是对的，脚下却还有一段坡。小禾把箱子提起来，跟晒衣服的人打听入口是在这一层还是上一层。',
  '成都':'认到门牌时，一个坐竹椅的邻居把膝头的豆角筐抬了起来，小禾的箱子从两把椅子的缝里刚刚好过去。',
  '苏州':'小禾沿河走了一截才发现，门牌在对岸。两扇门隔水正对着，得退回刚才那座小桥才能到。',
  '南京':'院门上方一大片树荫，阳光里翻过来的号码看不清。小禾走到阴影里，才认出屋主照片里那只绿信箱。',
  '绍兴':'巷口两座小桥望过去差不多。屋主说挑有晒菜篮子的那一座，小禾先过了桥，才看见篮底的水在石阶上滴了一路。',
  '杭州':'来时小禾沿街找有桂树的门，以为只有一棵。转过弯整条巷子都是树，好在屋主又说了一句：“树下停着补鞋车的那家。”'
};
const preference:Record<string,[keyof Traits,number]>={E:['E',1],I:['E',-1],N:['N',1],S:['N',-1],F:['F',1],T:['F',-1],P:['P',1],J:['P',-1]};
const moment=(day:number,minute:number)=>(day-1)*1440+minute;
export const yearDate=(day:number)=>localStamp(moment(day,0)).slice(0,10);
const score=(t:Traits,letter:string)=>{const [axis,sign]=preference[letter]!;return (t[axis]-50)*sign;};

// Reproducible availability only breaks ties between story opportunities.
function slot(type:string,title:string,week:number){
  let hash=17;
  for(const c of type+title+week)hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;
  hash=Math.imul(hash^(hash>>>16),0x45d9f3b);
  return (hash^(hash>>>16))>>>0;
}
export function yearWindows(events:YearEvent[]){
  const windows=Array.from({length:365*960/200},(_,i)=>{
    const a=i*200,b=a+200,from=a+Math.floor(a/960)*480,until=b+Math.floor((b-1)/960)*480;
    return {number:i+1,from,until,sleep:until-from-200,events:[] as YearEvent[]};
  });
  for(const event of events){
    const minute=event.at%1440;
    assert.ok(minute>=0 && minute<960,'story during sleep');
    const awake=(event.day-1)*960+minute;
    windows[Math.max(0,Math.ceil(awake/200)-1)]!.events.push(event);
  }
  return windows;
}

export interface JourneyPreference {letter:string;from:number}
export interface Influence extends JourneyPreference {title:string;natural:string;chosen:string}
export function simulateYear(type:string, preferences:JourneyPreference[]=[]){
  function active(axis:string, decisionDay:number, minute:number){
    const window=Math.ceil(((decisionDay-1)*960+minute)/200);
    return preferences.findLast(p=>p.from<=window && axis.includes(p.letter));
  }
  assert.ok(allTypes.includes(type),'unknown personality');
  const stable=type.endsWith('J'), opening=stable?200000:250000;
  const startTraits:Traits={E:type.includes('E')?54:46,N:type.includes('N')?54:46,F:type.includes('F')?54:46,P:stable?46:54};
  const annualDrawdown=(stable?27500:48500)+(type.includes('N')?10500:0);
  const aheadOfBudget=()=>opening-cash>annualDrawdown*day/365;
  const traits={...startTraits};
  let cash=opening,city='北京',day=0;
  const events:YearEvent[]=[], ledger:LedgerRow[]=[], days:DayRecord[]=[];
  const months:{month:string;cash:number;traits:Traits}[]=[];
  const changes:{day:number;axis:keyof Traits;before:number;after:number;source:string;influence?:Influence}[]=[];
  const weeks:{week:number;day:number;title:string;choice:string;withoutGrowth:string|null}[]=[];
  const projects:{day:number;title:string;accepted:boolean;reason:string;fee:number}[]=[];
  const journeys:{depart:number;from:string;to:string;source:string}[]=[];
  const juneInfluences=new Map<number,Influence>();
  const month=buildMonth(type,june,(definition,natural)=>{
    // The departure and the prepaid onward journey are already committed.
    if(definition.day===1 || definition.day===30)return natural;
    const pref=active(definition.axis,definition.day,8);
    if(!pref)return natural;
    const chosen=pref.letter===definition.axis[0]?0:1;
    juneInfluences.set(definition.day,{...pref,title:definition.branches[chosen].label,
      natural:definition.axis[natural]!,chosen:pref.letter});
    return chosen;
  });
  const monthEvents=month.windows.flatMap(w=>w.events);
  const portfolio=letters[type]!;
  const arc=(innerArcs[type]??outerArcs[type])!;
  const lastMorning=(innerFinale[type]??outerFinale[type])!;
  const theatre=nanjing[type];
  const seasonal=(seasonalCallsI[type]??seasonalCallsE[type])!;
  const receipts=(personalReceiptsI[type]??personalReceiptsE[type])!;
  const interludes=(innerDays[type]??outerDays[type])!;
  const privateWeek=privateIJ[type]??privateIP[type]??privateEX[type]??privateEP[type];
  assert.equal(interludes.length,4);
  assert.equal(privateWeek?.length??0,theatre?0:7);
  assert.equal(arc.length,arcDays.length);
  function add(id:string,minute:number,text:string,place=city){
    assert.ok(text.trim() && !/[|]/u.test(text),'invalid event '+id);
    const e={id,day,city:place,at:moment(day,minute),text};
    events.push(e);
    return e;
  }
  function post(minute:number,kind:string,amount:number,source:string){
    assert.ok(Number.isSafeInteger(amount) && amount!==0 && cash+amount>=0,'invalid cash movement');
    cash+=amount;ledger.push({day,at:moment(day,minute),kind,amount,balance:cash,source});
  }
  function change(letter:string,source:string,steps:number,influence?:Influence){
    const [axis,sign]=preference[letter]!,before=traits[axis];
    const after=Math.min(84,Math.max(16,before+steps*sign));
    if(after!==before || influence){
      traits[axis]=after;
      changes.push({day,axis,before,after,source,...(influence?{influence}:{})});
    }
  }
  function begin(){
    day++;
    if(stable && yearDate(day).endsWith('-01'))post(0,'授权入账',2000,'旧作月度授权 '+yearDate(day).slice(0,7));
  }
  function finish(){
    const stage=[58,168,278].indexOf(day);
    if(stage>=0){
      const pair=cityPair[[1,6,11][stage]!]!;
      const inclination=stage===0?traits.N:stage===1?traits.E:(traits.N+traits.E)/2;
      const to=pair[(stage===1 && theatre) || inclination>=50?1:0];
      const invitation=add('move.plan.'+(day+2),665,cityVisits[to]![0]);
      journeys.push({depart:day+2,from:city,to,source:invitation.id});
    }
    const trip=journeys.at(-1);
    if(trip){
      const visit=[1,4,7].indexOf(day-trip.depart);
      if(visit>=0)add('visit.'+trip.depart+'.'+(visit+1),visit===0?525:visit===1?715:808,cityVisits[city]![visit+1]!);
    }
    const seasonalIndex=[71,76,230,theatre?253:250,296,330,338,351].indexOf(day);
    if(seasonalIndex>=0)add('seasonal.'+type+'.'+day,735,seasonal[seasonalIndex]!);
    const extra=[49,178,187,233,theatre?252:243,306,314,358].indexOf(day);
    if(extra>=0)add('personal.'+type+'.'+day,755,receipts[extra]!);
    const early=[29,37,43].indexOf(day);
    if(early>=0)add('call.'+type+'.'+day,775,earlyCalls[type]![early]!);
    const installment=arcDays.indexOf(day);
    if(installment>=0)add('arc.'+type+'.'+day,day===1?748:day===365?827:802,arc[installment]!);
    if(theatre && (day===265 || day===365)){
      add('nanjing.after.'+day,day===365?596:705,nanjingEchoes[type]![day===365?1:0]);
    }
    // Basic living is a daily envelope, including ordinary small purchases in the fiction.
    post(915,'餐食交通及日用',-(city==='杭州'||city==='南京'?76:64),'日常合计');
    const guest=day<=6 || (!stable && (day===37||day===38));
    const prepaid=stable && day>=30 && day<=43;
    if(!guest&&!prepaid)post(930,'当夜住宿',-rent[city]!,city+'当夜');
    days.push({day,city,cash});
    if(yearDate(day+1).slice(0,7)!==yearDate(day).slice(0,7))months.push({month:yearDate(day).slice(0,7),cash,traits:{...traits}});
  }
  for(const definition of june){
    begin();city=definition.city.split('→').at(-1)!;
    events.push(...monthEvents.filter(e=>e.day===day).map(e=>({id:e.id,day,at:e.at,city:e.city,text:e.text})));
    if(travel[day])post(80,'城际车票',-travel[day]!,definition.city);
    if(day===30)post(480,'六月底预付',stable?-14*90:-390,stable?'6月30日至7月13日的14晚':'7月7日贵阳至武汉车票');
    const choice=month.choices[day-1]!;
    const influence=juneInfluences.get(day);
    if(influence || [4,11,18,26].includes(day))
      change(definition.axis[choice]!,[day,choice,5].join('.'),1,influence);
    finish();
  }

  let accepted=false,deliveries=0;
  function personalLife(){
    const installment=[58,120,204,289].indexOf(day);
    if(installment>=0){
      const letter=add('letter.'+type+'.'+day,758,portfolio[installment]!);
      // Observable practices in the Beijing correspondence: whom the writer invites,
      // how they listen, settle an agreement or leave a decision to the recipient.
      const actions:Record<string,string>={ISTJ:'FFEF',ISFJ:'ENEP',INFJ:'PFEE',INTJ:'SEFE',
        ISTP:'NEFE',ISFP:'NFPP',INFP:'EEFP',INTP:'FFFP',ESTJ:'PIFP',ESFJ:'SNFP',
        ENFJ:'IIPP',ENTJ:'IFIP',ESTP:'SFFI',ESFP:'TNFJ',ENFP:'TFJJ',ENTP:'SFJP'};
      change(actions[type]![installment]!,letter.id,3);
    }
    for(const job of jobs){
      const age=day-job.day;
      if(age===0){
        const overBudget=aheadOfBudget();
        const interest:Record<number,string>={63:'N',139:'S',218:'I',302:'F'};
        const wantsWork=(!stable && deliveries===0) || (score(traits,interest[job.day]!)>2 && deliveries<3);
        accepted=overBudget||wantsWork;
        const reason=overBudget?'生活开销超过自定进度':wantsWork?'主动留出接活时间':'保留已有安排';
        const context=accepted && overBudget?'小禾先扣出下个月的房钱，看见这阵子动用的积蓄比出门前打算的多了。':'';
        const encounter=job.day===302?borrowerNotes[type]![0]:'';
        const decision=add('offer.'+day,777,job.letter+encounter+context+(accepted?job.take:job.pass));
        projects.push({day,title:job.title,accepted,reason,fee:job.fee});
        if(accepted)post(777,'委托材料',-job.cost,decision.id);
      }else if(age===1 || age===10){
        const lines=workTradeoffs[job.day]!;
        add('tradeoff.'+job.day+'.'+age,786,lines[(age===10?2:0)+(accepted?0:1)]!);
      }else if(age===4 && accepted)add('work.'+job.day,777,job.work);
      else if(age===9 && accepted){
        const delivery=add('deliver.'+job.day,777,job.done.replace('{fee}',String(job.fee)));
        post(777,'交付收入',job.fee,delivery.id);deliveries++;
        if(job.day===302)add('borrowers.'+type,831,borrowerNotes[type]![1]);
        change('J',delivery.id,2);
      }
    }
  }
  function lastJob(){
    const last=projects.findLast(p=>p.accepted);
    if(last)return {source:'deliver.'+last.day,text:lastJobLetters[last.day]!};
    return {source:'offer.302',text:'傅老师捎来读者轮流填写的借阅册，问小禾愿不愿意在扉页上签字。小禾把笔递回去：“这回我可是来借书的。”老师翻到末页，小禾在那里写下自己的名字和归还日期。'};
  }
  function renderDay(line:string,prefix:string,substitutions:Record<string,string>={},origin?:string,hours=reveal){
    const beats=line.split('|');assert.equal(beats.length,5,prefix);
    for(const [i,beat] of beats.entries()){
      let text=beat.replace(/\{([^}]+)\}/g,(m,k:string)=>substitutions[k]??m);
      if(i===2 && origin && street[city])text+=' '+street[city];
      add(prefix+'.'+(i+1),withinReceipt(day,reveal[i]!,hours[i]!),text,origin && i<2?(i===0?origin:origin+'→'+city):city);
    }
  }
  for(const [i,line] of julyStart[stable?0:1]!.entries()){
    begin();const from=city;
    add('wake.july.'+day,8,julyDawns[stable?0:1]![i]!);
    if(!stable&&i===6)city='武汉';
    renderDay(line,'july.'+(stable?'stay':'return')+'.'+day,{},from!==city?from:undefined);
    if(day===31 && stable)add('royalty-note',774,'旧作这个月的授权款到了。小禾给北京家里回完电话，没动那笔预付过的房钱，另把接下来买菜的钱留在常用的卡上。');
    personalLife();finish();
  }
  const libraries=[summer,winter,spring];
  const dawns=[summerDawns,winterDawns,springDawns];
  const pools=libraries.map(l=>[...l]);
  function sixScenes(line:string,prefix:string,hours=reveal){
    const parts=line.split('|');assert.equal(parts.length,6,prefix);
    add('wake.'+prefix,withinReceipt(day,8,Math.max(8,hours[0]!-70)),parts[0]!);
    renderDay(parts.slice(1).join('|'),prefix,{},undefined,hours);
  }
  function theatreDay(){
    const prefix='nanjing.'+type+'.'+day;
    const hours=type==='ESFP'?[100,300,501,690,872]:[89,274,464,665,855];
    sixScenes(theatre![day-236]!,prefix,hours);
    if(type==='ESFJ' && day===248)post(withinReceipt(day,288,hours[1]!), '小剧场戏票',-48,prefix+'.2');
  }
  function rankWeek(pool:YearChapter[],week:number){
    const working=projects.some(p=>p.accepted && p.day<=day+1 && p.day+9>=day+1);
    const lastChoice=weeks.at(-1)?.choice??'';
    const rank=(c:YearChapter)=>score(traits,c.contrast[0]!)*0.8
      +(interests[type]!.includes(c.title)?12:0)-(working && bookedChapters.has(c.title)?18:0)
      +slot(type+city+lastChoice,c.title,week)%19;
    return [...pool].sort((a,b)=>rank(b)-rank(a)||a.title.localeCompare(b.title,'zh-CN'))[0]!;
  }
  let pauses=0;
  for(let week=1;week<=44;week++){
    if(week===32 && privateWeek){
      const [title,choice,beat]=privateDecisions[type]!;
      weeks.push({week,day:day+1,title,choice,withoutGrowth:null});
      for(const [i,line] of privateWeek.entries()){
        begin();
        const prefix='private.'+type+'.'+day;
        sixScenes(line,prefix);personalLife();
        if(i===2)change(choice,prefix+'.'+beat,2);
        finish();
      }
      continue;
    }
    if(theatre && (week===28 || week===29)){
      const choice=type==='ESFJ'?(week===28?'J':'F'):(week===28?'F':'J');
      const title=type==='ESFJ'?(week===28?'六个人的晚饭':'两个人的戏票'):(week===28?'扫帚从幕边伸出来':'谁有权站在台上');
      weeks.push({week,day:day+1,title,choice,withoutGrowth:null});
      for(let i=0;i<7;i++){
        begin();theatreDay();personalLife();
        if(i===2)change(choice,'nanjing.'+type+'.'+day+'.5',2);
        finish();
      }
      continue;
    }
    const group=week<=15?0:week<=30?1:2,pool=pools[group]!;
    const chapter=rankWeek(pool,week);pool.splice(pool.indexOf(chapter),1);
    const mornings=dawns[group]![libraries[group]!.indexOf(chapter)]!;
    assert.equal(mornings.length,7,chapter.title);
    assert.equal(chapter.days.length,7,chapter.title);
    const main=chapter.contrast[0]!,alternative=chapter.contrast[1]!;
    // The first two days open the main opportunity. An alternative becomes attractive
    // after repeated similar choices; this uses only already completed decisions.
    const recent=weeks.slice(-5).filter(w=>w.choice===main).length;
    const opportunity=recent===0?12:5-recent*5;
    const choose=(t:Traits)=>score(t,main)+opportunity>=score(t,alternative)?main:alternative;
    const natural=choose(traits);
    // Only the third day differs. Its first branch scene stays in the original receipt.
    const pref=active(chapter.contrast,day+3,reveal[0]!);
    const choice=pref?.letter??natural;
    const influence=pref?{...pref,title:chapter.title,natural,chosen:choice}:undefined;
    weeks.push({week,day:day+1,title:chapter.title,choice,withoutGrowth:pref?.letter??choose(startTraits)});
    for(let index=0;index<7;index++){
      begin();
      const hours=chapterHours(chapter);
      add('wake.w'+week+'.'+day,withinReceipt(day,8,Math.max(6,hours[0]!-72)),mornings[index]!);
      const path=index===2 && choice===alternative?'alt':'main';
      const line=path==='alt'?chapter.alternate:chapter.days[index]!;
      renderDay(line,'w'+week+'.'+day+'.'+path,{},undefined,hours);
      if(day===39&&!stable)add('independent-room',31,'昨晚在阿宁家收好的行李今天只搬了两条街。小禾拿到自己租的房门钥匙，把阿宁家的那把还给她：“下次来吃饭，我也正经敲门。”');
      personalLife();
      if(index===5){
        add('reply.'+week+'.'+choice,813,replies[chapter.title]![choice===main?0:1]);
        if(chapter.title==='一份只有半天的工作'){
          const pay=add('workshop.'+week,822,'朱师傅把这半天的工钱一百六十元结给小禾，说下一扇窗另外谈。小禾在收条上写的只有已经装好的那一扇。');
          post(822,'交付收入',160,pay.id);
        }
      }
      if(index===2)change(choice,'w'+week+'.'+day+'.'+path+'.5',2,influence);
      finish();
    }
    if(week%3===0){
      begin();pauses++;
      if(day===236 && theatre){theatreDay();personalLife();finish();continue;}
      const interlude=[82,148,214,346].indexOf(day);
      if(interlude>=0){sixScenes(interludes[interlude]!,'interlude.'+type+'.'+day);personalLife();finish();continue;}
      add('wake.pause.'+day,8,pauseDawns[pauses-1]!);
      const pair=cityPair[pauses],oldCity=city;
      const fareGap=aheadOfBudget();
      const economical=fareGap || traits.P<48;
      const fare=economical?230:410;
      if(pair){
        const plan=journeys.at(-1)!;
        assert.equal(plan.depart,day);assert.equal(plan.from,oldCity);
        city=plan.to;
        // Buy the ticket before boarding. Even a long intercity trip has a full day.
        const prefix='pause.'+pauses, beats=pauseDays[pauses-1]!.split('|');
        const word=(s:string)=>s.replaceAll('{from}',oldCity).replaceAll('{to}',city)
          .replaceAll('{fare}',String(fare)).replaceAll('{reason}',fareGap?'小禾刚对过账，想把票价差留作房钱。':economical?'小禾愿意慢点到，挑了便宜的那班。':'小禾给这次换城留过余钱，挑了早一点到的车。');
        const goodbye=pauses===1 && stable?'房东过来接钥匙，看见那封画着旧桌位的信还压在桌板底下。小禾问他要不要取出来，他拉开窗帘：“留给下一位吧，他也许想看一回球。”':
          pauses===1?'小禾把租屋的钥匙交还房东，拎着箱子走了两条街，到阿宁的楼下挥手。她要上班，隔着窗给小禾比了个筷子的手势。':'';
        add(prefix+'.1',21,word(beats[0]!)+goodbye,oldCity);
        post(96,'城际车票',-fare,prefix+'.2');
        add(prefix+'.2',96,travelTicket(oldCity,city,fare,fareGap),oldCity);
        const road=oldCity+'→'+city;
        const ride=roadScenes[type]![pauses===1?0:pauses===6?1:2].split('|');
        assert.equal(ride.length,2);
        const localTrip=pauses===11;
        add(prefix+'.ride1',288,ride[0]!,road);
        add(prefix+'.ride2',localTrip?325:480,ride[1]!,road);
        add(prefix+'.3',localTrip?480:672,'出了'+city+'的车站，小禾照房东发来的位置走进住处那条街。'+street[city],city);
        if(localTrip)events.at(-1)!.text+=' 房东来电话念了房号，小禾怕忘，拿笔写在手心。';
        if(localTrip)add(prefix+'.wait',672,'新住处还在换床单。小禾把箱子寄在楼下小铺，老板撕了张扑克牌，把一半夹在提手上。回来取箱时，两人凑到一起，恰好拼回一张方块八。',city);
        add(prefix+'.4',744,beats[3]!,city);add(prefix+'.5',864,beats[4]!,city);
      }else{
        renderDay(pauseDays[pauses-1]!,'pause.'+pauses);
      }
      personalLife();finish();
    }
  }
  for(const [i,line] of finalDays.entries()){
    begin();add('wake.end.'+day,8,closingDawns[i]!);
    if(day===364){
      const last=lastJob();
      add('return.'+last.source,782,last.text);
    }
    if(day===365){
      add('finale.'+type+'.morning',93,lastMorning[0]);
      add('finale.'+type+'.midday',282,lastMorning[1]);
      add('finale.'+type+'.afternoon',480,lastMorning[2]);
      add('final.4.4',676,'阿宁发来一张北京旧合照，问明年这时候小禾会在哪儿。小禾把已经答应的日子翻给她看。她看了一眼：“行，我找你空着的时候来。”');
      add('final.4.5',864,portfolio[4]!);
    }else renderDay(line,'final.'+i);
    personalLife();finish();
  }
  assert.equal(day,365);
  events.sort((a,b)=>a.at-b.at);
  // Each day posts in timestamp order; this also checks future edits to new story hooks.
  assert.ok(ledger.every((row,i)=>i===0||row.at>=ledger[i-1]!.at),'ledger chronology');
  return {type,initial:{cash:opening,annualDrawdown,traits:startTraits},events,days,months,weeks,projects,journeys,changes,ledger};
}
