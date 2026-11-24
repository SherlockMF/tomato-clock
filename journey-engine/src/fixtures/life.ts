import { fixture } from './world.ts';import { toMinute } from '../domain/time.ts';
import type { ActionSpec } from '../domain/types.ts';
import type { Effect, LifeConfig, LifeStep, Opportunity } from '../life/types.ts';
const idle=(duration:number):ActionSpec=>({kind:'idle',duration});
const memory=(topic:string,text:string):Effect=>({kind:'memory',actor:'hero',topic,text});
const goal=(id:string,text:string,status:'active'|'completed'='active'):Effect=>({kind:'goal',actor:'hero',id,text,status});
const relation=(delta=4):Effect=>({kind:'relation',a:'hero',b:'lin',delta,reconnect:true});
function step(id:string,kind:string,location:string,actions:Record<string,ActionSpec>,title:string,prose:string,effects:Effect[]=[],objects:string[]=[],quotes:LifeStep['quotes']=[]):LifeStep{return{id,kind,location,actions,title,prose,effects,objects,quotes};}
function move(id:string,from:string,to:string,actors=['hero']):LifeStep{return step(id,'travel',from,Object.fromEntries(actors.map(a=>[a,{kind:'move',routeId:`${from}-${to}`}])),'沿实际路线前往下一地点','');}
export function bookstoreFixture():LifeConfig{
  const start=toMinute('2026-02-02T13:00:00+08:00');
  const places=[{id:'bookstore',name:'廊坊·桥边书店',purpose:'售书、整理库存与读书交流',observations:['窗边书架','待整理旧书']},{id:'lunch',name:'书店附近的小饭馆',purpose:'餐饮',observations:[]},{id:'street',name:'廊坊·旧街区',purpose:'步行与摄影',observations:['修车摊','晾衣走廊','下班的人群']},{id:'cafe',name:'廊坊·河边咖啡店',purpose:'图书合作展示',observations:['合作展示架']},{id:'home',name:'廊坊·旅馆',purpose:'住宿与整理行程',observations:[]},{id:'tianjin',name:'天津·河岸旅舍',purpose:'旅行下一站与住宿',observations:['河岸步道']}];
  const legs:[string,string,number,number][]=[['bookstore','lunch',10,0],['lunch','bookstore',10,0],['bookstore','street',15,600],['street','bookstore',10,0],['bookstore','cafe',10,0],['cafe','bookstore',10,0],['bookstore','home',15,0],['home','bookstore',15,0],['home','tianjin',90,3500],['tianjin','home',90,3500]];
  const worlds=['hero','lin','mei'].map((id,i)=>fixture({worldId:`life-${id}`,start,timezoneOffsetMinutes:480,character:{id,name:['阿远','阿林','小梅'][i]!,gender:'unspecified',age:26,source:'custom'},initialFatigue:i===0?360:0,initialCashCents:i===0?200000:100000,monthlyIncomeCents:150000,locationId:'bookstore',npcs:[],places:places.map(p=>({id:p.id,name:p.name,openMinute:p.id==='bookstore'?540:0,closeMinute:p.id==='bookstore'?1320:1440,lodgingCents:8000})),routes:legs.map(([from,to,duration,costCents])=>({id:`${from}-${to}`,from,to,duration,costCents,mode:'transit'}))}));
  const c:LifeConfig={version:31,mode:'authored',hero:'hero',worlds,profiles:[{id:'hero',name:'阿远',occupation:'离职后旅行的摄影爱好者',interests:['摄影','城市观察'],motives:{explore:90,cooperate:65,income:20,create:70},home:'home',workplace:'bookstore',shift:[540,1080]},{id:'lin',name:'阿林',occupation:'书店经营者',interests:['旧书','社区读书会'],motives:{explore:10,cooperate:90,income:70,create:50},home:'bookstore',workplace:'bookstore',shift:[540,1320]},{id:'mei',name:'小梅',occupation:'咖啡店读书活动组织者',interests:['游记','城市生活'],motives:{explore:40,cooperate:80,income:60,create:70},home:'bookstore',workplace:'bookstore',shift:[600,1260]}],places,objects:[{id:'album',name:'旅行摄影集《沿途的光》',owner:'lin',location:'bookstore',holder:null,state:'on-shelf',source:'initial:catalog'},{id:'book-box',name:'供咖啡店展示的一箱旧书',owner:'lin',location:'bookstore',holder:null,state:'unsorted',source:'initial:catalog'},{id:'camera',name:'阿远的相机',owner:'hero',location:'bookstore',holder:'hero',state:'available',source:'initial:catalog'}],initialRelations:[{a:'hero',b:'lin',trust:40,status:'acquainted',source:'initial:prior-acquaintance'},{a:'hero',b:'mei',trust:20,status:'acquainted',source:'initial:prior-acquaintance'}],proposals:[],opportunities:[]};
  const steps:LifeStep[]=[
    move('to-lunch','bookstore','lunch',['hero','lin']),
    step('lunch','meal','lunch',{hero:{kind:'eat',duration:30,amountCents:3000},lin:{kind:'eat',duration:30,amountCents:2000}},'和阿林吃午饭','阿远和阿林走到书店附近的小饭馆，坐下来吃了午饭。阿远付了自己的三十元饭钱。'),
    step('invitation','choice','lunch',{hero:idle(30),lin:idle(30)},'决定今天帮忙，明天继续旅行','饭后，阿林提起周末的书市，问阿远愿不愿意再留几天。阿远想继续看看别的城市，也愿意把今天留给这里。他没有答应留下过周末，而是决定下午帮忙，明天继续往天津走。',[goal('tianjin','明天前往天津'),memory('choice-stay','接受今天帮忙，未接受留到周末'),relation(2)],[],[{speaker:'lin',text:'周末有人来办书市，你要不要再留几天？'},{speaker:'hero',text:'我明天还是想走，不过今天可以继续帮你。'}]),
    move('back-from-lunch','lunch','bookstore',['hero','lin']),
    step('shelves','cooperate','bookstore',{hero:idle(70),lin:idle(70)},'为书市整理展示区域','回到书店，两人把待展示的旧书分出来，重新安排展示区域。阿远不再只是临时坐一坐的客人，这个下午有了一件两个人一起做的事。',[{kind:'object',id:'book-box',state:'sorted',location:'bookstore',holder:null},{kind:'flag',key:'market-ready',value:true},relation()],['book-box']),
    step('album','discovery','bookstore',{hero:idle(50)},'发现感兴趣的摄影集，只记下书名','整理旧书时，阿远留意到一本旅行摄影集《沿途的光》。他翻看了一阵，记下书名，没有买走。明天仍要继续旅行，但沿途可以留意什么，已经比午饭前具体了一点。',[memory('album','在桥边书店发现《沿途的光》，记下书名，尚未购买'),goal('street-photos','拍摄身边的城市生活')],['album']),
    move('ride','bookstore','street'),
    step('photos','photography','street',{hero:idle(45)},'拍下三处普通街景','阿远骑车去了附近的旧街区。修车摊、晾衣走廊和下班的人群进入了他的镜头。他留下三张照片；这趟出门没有发生奇遇，注意力却落到了平常容易略过的城市生活上。',[...['修车摊','晾衣走廊','下班的人群'].map((subject,i):Effect=>({kind:'artifact',id:`photo-${i+1}`,artifact:'photo',owner:'hero',subject})),goal('street-photos','拍摄身边的城市生活','completed'),memory('street-photos','用三张照片记录旧街区普通生活')],['camera']),
    move('return-street','street','bookstore'),
    step('list','cooperate','bookstore',{hero:idle(30),lin:idle(30)},'核对送书清单','在店里，阿远和阿林核对了送往咖啡店的那箱书。书名一项项对上，先前整理出来的书终于有了具体去处。',[{kind:'flag',key:'list-checked',value:true}],['book-box']),
    move('to-dinner','bookstore','lunch'),
    step('dinner','meal','lunch',{hero:{kind:'eat',duration:40,amountCents:4000}},'独自吃晚饭','阿远独自吃了晚饭，花了四十元。吃完后，他照着已经商量好的安排回书店，准备和阿林送书。'),
    move('back-dinner','lunch','bookstore'),
    step('pickup','pickup','bookstore',{hero:idle(10),lin:idle(10)},'接过待送的书箱','阿林把核对过的书箱交给阿远，两人一起出门。',[{kind:'object',id:'book-box',state:'in-transit',location:'bookstore',holder:'hero'}],['book-box']),
    move('carry','bookstore','cafe',['hero','lin']),
    step('handoff','delivery','cafe',{hero:idle(20),lin:idle(20)},'将书箱送到合作咖啡店','到了河边咖啡店，两人把书放进合作展示区，完成交接。阿远明天就要离开，但今天答应帮的这件事，已经有了一个确实的结果。',[{kind:'object',id:'book-box',state:'delivered',location:'cafe',holder:null},relation(6),memory('delivery','和阿林把核对过的旧书送到河边咖啡店'),goal('help-market','完成书市准备与送书','completed')],['book-box']),
    move('return-reading','cafe','bookstore',['hero','lin']),
    step('reading','conversation','bookstore',{hero:idle(70),lin:idle(70),mei:idle(70)},'参加游记读书交流','晚上，他们回书店参加读书交流。小梅谈起旅行中的城市观察，问阿远接下来打算去哪。阿远说，下一站准备去天津，更远的地方还没有定下来。这次他把自己的打算说给了别人听。',[{kind:'relation',a:'hero',b:'mei',delta:5,reconnect:true},memory('reading','和小梅交流城市观察，表达下一站天津的意向')],[],[{speaker:'mei',text:'你接下来想去哪？'},{speaker:'hero',text:'现在准备去天津，后面还不知道。'}]),
    step('goodbye','farewell','bookstore',{hero:idle(25),lin:idle(25)},'与阿林告别，保留以后再来的可能','交流结束后，阿远和阿林在书店告别。阿林说，以后再经过廊坊，可以回来坐坐。两人没有约定新的见面日期；今天一起做过的事，留在了这次告别里。',[relation(3),memory('farewell','离开前与阿林告别；对方欢迎以后再来，没有新的定期承诺')],[],[{speaker:'lin',text:'下次再经过廊坊，可以回来坐坐。'}]),
    move('home','bookstore','home'),
    step('route','preparation','home',{hero:idle(40)},'核对明天路线并整理照片','回到住处，阿远整理了今天的三张照片，又核对了去天津的路线。摄影集的书名还留在记忆里，明天的方向也已经明确；车票尚未购买，抵达仍是下一步的事。',[goal('photo-notes','用三张照片整理一页城市观察'),memory('route','已经核对天津路线，尚未购票或抵达')]),
    step('wash','routine','home',{hero:idle(40)},'收拾行李和洗漱','他把行李收拾好，洗漱后结束了这一天。')
  ];
  c.opportunities=[{id:'authored-bookstore-day',title:'书店的一天',provider:'lin',actor:'hero',participants:['hero','lin','mei'],location:'bookstore',available:start,deadline:start+600,conditions:[],motives:{explore:90,cooperate:65,income:0,create:70},steps,causes:['initial:catalog','initial:prior-acquaintance'],once:true,choice:'今天帮忙，明天出发',alternative:'留到周末参加书市'}];return c;
}
export function autonomousFixture(background:'traveler'|'writer'|'worker'):LifeConfig{
  const c=bookstoreFixture(),standard=c.opportunities[0]!,start=c.worlds[0]!.start;c.mode='autonomous';c.worlds.forEach(w=>{w.initialFatigue=360;w.places.forEach(p=>p.lodgingCents=3000);});c.worlds[0]!.initialCashCents=1000000;
  const hero=c.profiles[0]!;if(background==='writer'){hero.name='小禾';hero.occupation='准备写城市随笔的自由撰稿人';hero.motives={explore:30,cooperate:75,income:30,create:95};hero.interests=['写作','社区生活'];c.worlds[0]!.initialCashCents=400000;}
  if(background==='worker'){hero.name='小周';hero.occupation='储蓄有限、寻找短期工作的旅行者';hero.motives={explore:20,cooperate:55,income:100,create:20};c.worlds[0]!.initialCashCents=120000;hero.interests=['工作','旅行预算'];}
  c.worlds[0]!.character.name=hero.name;
  const find=(id:string)=>structuredClone(standard.steps.find(s=>s.id===id)!);
  const make=(id:string,title:string,steps:LifeStep[],motives:Opportunity['motives'],conditions:Opportunity['conditions']=[],available=start,deadline=start+30*1440):Opportunity=>({id,title,provider:'lin',actor:'hero',participants:[...new Set(steps.flatMap(s=>Object.keys(s.actions)))],location:steps[0]!.location,available,deadline,conditions,motives,steps,causes:['initial:catalog'],once:true,choice:title,alternative:'保留时间给其他生活方向'});
  const discovery=find('album');discovery.prose='在书架旁，{hero}留意到旅行摄影集《沿途的光》，记下书名。书仍属于阿林，眼下更想做的是带着相机看看附近的街区。';
  const shelves=find('shelves');shelves.prose='阿林要为周末的书市准备旧书。{hero}接下了整理展示区域的请求，两人把待展示的书分开摆好。这批书接下来还要送到河边咖啡店。';
  const photos=find('photos');photos.prose='{hero}带着相机走进旧街区，拍下修车摊、晾衣走廊和下班的人群。三张照片让这段停留有了可以回看的东西。';
  const delivery=find('handoff');delivery.prose='{hero}和阿林把核对过的书箱送到河边咖啡店。交接完成后，书箱留在展示区；帮忙的请求也有了实际结果。';
  const reading=find('reading');reading.quotes=[{speaker:'mei',text:'你在街区里留意到了什么？'}];reading.effects=reading.effects.filter(e=>e.kind!=='memory');reading.effects.push(memory('feedback','小梅建议把不同街景并排，看看自己忽略的生活细节'),goal('photo-notes','整理一页城市观察回应读书会反馈'));reading.prose='读书交流时，小梅问起{hero}在附近的见闻，建议把不同街景放在一起看看。{hero}把这条建议记了下来，下一步可以把零散观察整理成一页笔记。';
  c.opportunities=[
    make('browse','从摄影兴趣出发浏览旧书',[discovery],{explore:90,cooperate:0,income:0,create:55}),
    make('help-market','回应书市准备请求',[shelves],{explore:10,cooperate:95,income:0,create:40}),
    make('photo-walk','带着摄影集的启发观察旧街区',[find('ride'),photos,find('return-street')],{explore:95,cooperate:0,income:0,create:65},[{goal:'street-photos'}]),
    make('delivery','把已经整理的书送到合作咖啡店',[find('list'),find('pickup'),find('carry'),delivery,find('return-reading')],{explore:20,cooperate:100,income:0,create:20},[{object:'book-box',objectState:'sorted'}]),
    make('reading','参加今晚的读书交流',[reading],{explore:20,cooperate:75,income:0,create:95},[],start+400,start+540),
    make('photo-notes','回应读书会反馈整理城市观察',[step('notes','creation','bookstore',{hero:idle(90)},'完成一页城市观察','{hero}把先前留下的观察重新整理，做成一页城市笔记。它来自已有经历，记录的是这次停留真正注意过的东西。',[{kind:'artifact',id:'city-note',artifact:'note',owner:'hero',subject:'城市观察'},goal('photo-notes','整理一页城市观察回应读书会反馈','completed'),memory('city-note','完成一页城市观察笔记')])],{explore:20,cooperate:20,income:0,create:100},[{goal:'photo-notes'}]),
    make('travel-choice','决定下一站',[step('choice','choice','bookstore',{hero:idle(30),lin:idle(30)},'说明下一站旅行意向','{hero}向阿林说明，自己仍想去天津看看。今天能帮的事情做完后，接下来会把时间留给下一段旅程。',[goal('tianjin','前往天津'),memory('travel-choice','向阿林说明下一站天津的意向')])],{explore:100,cooperate:5,income:0,create:10},[{flag:'market-ready',value:true}]),
    make('tianjin','执行已有天津旅行目标',[move('to-tianjin','home','tianjin'),step('arrival','arrival','tianjin',{hero:idle(30)},'抵达天津并确认下一段停留','{hero}沿已有路线来到天津，在河岸旅舍安排接下来的停留。上一座城市里帮忙整理书籍的那段经历，已经留在身后。',[goal('tianjin','前往天津','completed'),memory('tianjin','实际抵达天津河岸旅舍')])],{explore:100,cooperate:0,income:0,create:30},[{goal:'tianjin'}],start+1140),
  ];
  for(let i=0;i<8;i++)c.opportunities.push(make(`order-${i}`,`完成第${i+1}份已登记的旧书目录订单`,[step(`order-${i}`,'work','bookstore',{hero:{kind:'receive',duration:120,amountCents:12000,source:`registered-order-${i}`}},'核对一份真实登记的旧书目录','{hero}接下书店登记的目录核对工作，逐项检查书名和待交付记录。完成两小时工作后，收到约定的一百二十元报酬。',[{kind:'artifact',id:`catalog-${i}`,artifact:'note',owner:'lin',subject:'已核对的书目清单'},memory(`order-${i}`,'完成登记订单并收到120元')])],{explore:0,cooperate:40,income:100,create:20},[],start+Math.floor(i/2)*1440));
  for(const o of c.opportunities)for(const step of o.steps)step.prose=step.prose.replaceAll('阿远','{hero}');
  c.objects.find(o=>o.id==='camera')!.name=`${hero.name}的相机`;
  return c;
}
