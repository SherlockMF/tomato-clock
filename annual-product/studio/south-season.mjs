import {wuhan} from './south-wuhan.mjs';
import {changsha} from './south-changsha.mjs';
import {yangshuo,bedPrices,hasMorningShifts,lodging,mealsAfterLodging,shiftWage} from './south-yangshuo.mjs';

export {lodging};
export function newItinerary(s,n){return n>s.unlocked || n>=(s.itineraryFrom??Infinity);}
export const chapters=[...wuhan,...changsha,...yangshuo];
export const newSceneNames=['proof','ricecake','pressroom','riverstep','ticketbag'];
export const parts=['早上','午后','夜里'];
export const opening='离开公司那天，旅人从抽屉里翻出三只杯盖，没一只配得上桌上的杯子。隔壁伸手认领了两个。剩下那个捏了一路，到家才想起杯子落在公司了。\n房租另留，往南这十五天能花两千六百块。武汉的阿宁打来电话：“来我这儿住。我给你腾个放箱子的地方。”旅人低头看了看手里的杯盖，突然特别想见她。';
export const sceneValue=(value,s)=>typeof value==='function'?value(s):value;
export function chapterAt(n){return chapters[n-1];}
// Earlier journeys keep the titles and illustrations that went with their saved prose.
const previousPresentation={
  13:{title:'露出来的半行铅灰色字',art:'proof'},23:{title:'一个姓何的',art:'kitchen'},
  26:{title:'何姐自己接的',art:'courtyard'},27:{title:'两行字挤成一句',art:'pressroom'},
  29:{title:'午饭前的那通催问',art:s=>s.choices[28]==='hold'?'workshop':'pressroom'},
  34:{title:'船还没来，标题已经在了',art:'room'},35:{title:'许兰认得那件衬衣',art:'courtyard'}
};
export function previouslyRead(s,n){return n<=s.unlocked && n<(s.travelFrom??Infinity);}
export function chapterPresentation(s,n){
  if(!newItinerary(s,n)){
    if(n===22)return {title:'这次谁收拾',art:'workshop'};
    if(n===28)return {title:'机器在走，字还粘着',art:'pressroom'};
    if(n===43)return {title:'你先替我叫住他',art:'proof'};
  }
  return previouslyRead(s,n)&&previousPresentation[n] || chapterAt(n);
}
export function chapterPlace(s,n){
  if(n===1||n===2&&!previouslyRead(s,n))return '北京 → 武汉';
  if(n<=15)return '武汉';
  if(n===16)return '武汉 → 长沙';
  if(n<=30)return '长沙';
  if(n===31)return '长沙 → 阳朔';
  if(n===44)return '阳朔 → 桂林';
  if(n===45)return '桂林 → '+({west:'贵阳',wuhan:'武汉',beijing:'北京'})[s.choices[44]];
  return '阳朔';
}

// Use only choices, bills and prose from chapters the reader has already seen.
const rememberedChoices={
  2:{carry:'旅人答应亲自送底片，阿宁在面馆等着。',desk:'旅人把纸袋交给列车员，把交接号发给了陈渡和暗房师傅。'},
  5:{job:'旅人接了老周六百八十元的稿子。阿宁把切糕的刀递给了妈妈。',river:'旅人推掉老周六百八十元的急稿，接过阿宁手里的围裙。'},
  10:{credit:'旅人签了更正单，请展方把采访署名还给唐青。',break:'旅人撤了自己的署名，把回执给了唐青。她的采访署名还得另行核对。'},
  14:{knock:'离开武汉前，旅人敲了阿宁的门，当面还了钥匙。',note:'离开武汉前，旅人写了张留言，把钥匙放进阿宁家的信箱。'},
  18:{press:'旅人出了裁纸钱，和露露一人抬着桌子的一头去摆摊。',shift:'旅人去装订间顶了晚班，露露独自带着旧纸样出摊。'},
  22:{refund:'旅人赔了蒋姐补送米糕的一百五十元，她自己给取货券盖章。',reprint:'旅人接下换券装盒的活儿，让蒋姐去看儿子踢球。'},
  26:{table:'旅人在蒲扇摊前坐下，和嬢嬢各拿了一张纸，约好画完交换。',walk:'旅人谢过互画的邀请，独自沿街找了个看点灯的位置。'},
  28:{hold:'露露按停机器，装裱师空手走了。催样电话留给旅人来接。',strip:'露露按时交出三张揭去错字的灰样，背面写了“只供量框”。'},
  32:{meet:'旅人推掉装订活，和陈渡一起到渡口见何姐。',earn:'旅人留下重订画册，陈渡一个人赶去渡口。'},
  36:{return:'许兰收下了整张样片，往后由她自己决定给谁看。',cover:'许兰带走了能认出她的部分，只留下一小截跳板作内部比对。'},
  40:{speak:'旅人签了核对过的更正。何姐凑近电话，亲口告诉对方她的名字是哪两个字。',stand:'旅人把电话递到何姐手里。她请北京的挂画人把票袋挂低些，自己也好看得见。'},
  43:{pull:'旅人请老周当场抽掉整页。等第一张抽出来，来看作品的策划已经去赶车了。',number:'策划记下了旅人的号码。旅人请老周抽掉整页，约好自己的作品单独发。'},
  44:{west:'旅人买了西去贵阳的车票，也订好了头两晚的床位。',wuhan:'旅人买票回武汉，跟阿宁约好见面。',beijing:'旅人买了北上的票，想先回家睡一觉。'}
};
export function decisionSummary(s,n){
  const key=s.choices[n];
  if(!key)return undefined;
  if(n===36&&s.answers[n]?.actor==='许兰自己决定')return undefined;
  if(s.answers[n]?.summary)return s.answers[n].summary;
  if(newItinerary(s,n)){
    if(n===22)return key==='refund'?'露露先赔清一百五十元。旅人分担七十五元，留下晚上和唐青通话的时间。':'露露出了补送的钱，旅人和她坐在一块换券，让蒋姐去看球。';
    if(n===32)return key==='meet'?'旅人婉拒了画摊，赴约和何姐一起坐船。':'旅人坐上了画摊的凳子，给人画侧脸。陈渡先带私样去渡口。';
    if(n===34)return key==='workstay'?'旅人付了'+lodging(s,key).cost+'元床钱，签下两个早班。':lodging(s,key).dorm?'旅人搬去后院通铺，把两个清晨留下看戏。':'旅人付清四晚床钱，把两个清晨留下看戏。';
    if(n===43)return key==='pull'?'旅人舍下策划的邀约，和陈渡父子拍了一张三人合照。':'旅人留住单独送作品的机会，照相馆那张相片只留下陈家父子。';
  }
  return rememberedChoices[n]?.[key];
}
const rememberedMoments={
  1:'旅人辞了北京的工作，坐车去武汉看阿宁。展板上少的那个名字，是前同事唐青的。',
  3:'底片已经到了暗房。阿宁把备用钥匙交给旅人，约好明天下午一起去小院。',
  4:'阿宁在蒸笼边摆了两把靠背椅，打算下午陪妈妈坐。隔壁修鞋的邱婆婆举手要先尝。',
  6:s=>s.choices[5]==='river'?'旅人替阿宁母女拍下了分吃第一笼糕的模样。':'急稿发出时糕已散了。阿宁为母亲换出来的半天也过去了。',
  7:'陈父记得当时跳板歪了，有人伸手挡镜头。他收起相机去扶车，拒绝给“挥手告别”签字。',
  8:'唐青把采访原稿发来了。两处“五块”都经她核成了“五毛”，展板上却没留下她的名字。',
  9:s=>s.choices[5]==='river'?'阿宁妈妈挑中了女儿腮帮子还鼓着的那张合照。她要来借住，旅人搬到了街口。':'阿宁算给旅人听，下次再凑齐那个下午得等一个月。她妈妈要来借住，旅人搬到了街口。',
  11:s=>s.choices[10]==='credit'?'北京的线上展页补回了唐青的采访署名，印出去的册子还照旧。':'北京线上展页撤了旅人的名字，采访栏还空着。唐青已经递了自己的原稿。',
  12:s=>s.choices[5]==='river'?'阿宁和旅人去洗那张合照。一张进了妈妈的歌谱，另一张阿宁自己留着。':'旅人和阿宁把用过的蒸布洗了。两个人拧那块布，水全浇在凉鞋上。',
  13:'旅人跟着一车西瓜走到江边，画下离岸的渡船，决定去长沙逛夜市。',
  15:'旅人记下露露的店址，想去长沙夜市画画。陈渡约好带着父亲那张表同车过去。',
  16:'旅人和陈渡到了露露的印店。她把展方的纸样贴在窗上，请他们吃完饭再来细看。',
  17:'露露把旧样叠到新样上。空框里还没有船时，版头就写着“赶最后一班船的人”。',
  19:'蒋姐找露露印取货券，叮嘱这回要写东门十七号。第一扎已经给骑手带走了。',
  20:'三格底片接了起来。陈父问儿子，十五号开幕那天，能不能陪他去照相馆坐坐。',
  21:'取货券把东门十七号错印成了七号。蒋姐把下周六百盒的单子交给了另一家。',
  23:'旅人在长沙巷口吃粉，一勺辣椒吃出了眼泪，正好坐着等雨停。',
  24:s=>s.choices[22]==='refund'?'旅人赶上了八点的电话，唐青指给旅人看两份同名文件的日期。':'旅人替蒋姐换券，错过了八点的电话。唐青只来得及留下一个文件夹名。',
  25:'六百盒的单子没回来。露露和旅人还是在一张桌上吃完了粉，旧报价单垫在碗底下。',
  26:'何姐约好去旧渡口看三格私样。长沙夜市快开摊了，卖扇子的嬢嬢给旅人腾出一张矮凳。',
  27:s=>s.choices[26]==='table'?'嬢嬢收下自己的眉毛像。她画的那双大耳朵，旅人夹进了本子。':s.choices[26]==='walk'?'旅人坐在街边，借着渐次点亮的灯，给举灯的人画出了七只手。':'旅人借着夜市摊灯画了几笔，等最后一盏灯亮。',
  29:'旅人约露露沿湘江走了半天，接过一只栽进草里的风筝，两个人跑热了也没放起来。',
  30:'露露印好三格私样，陈渡收进纸筒。明天他和旅人经桂林转车，去阳朔见何姐。',
  31:'旅人和陈渡到了阳朔。底片的三格私样收在纸筒里，何姐要他们照约带去。',
  33:'何姐说，那天许兰头一回放跳板，没放正。照片里那只手，是许兰请她伸出来挡镜头的。',
  34:s=>(hasMorningShifts(s)?'旅人接下两个早班，换了便宜床位。':'旅人付了四晚床钱。')+'早上一个人到了江边，等船过后，再看水里的山尖。',
  35:'许兰认得歪口袋，想自己收好照片。旅人向鼓手学会了开场那一下小锣，和何姐约好演出时来敲。',
  36:s=>s.answers[36]?.actor==='许兰自己决定'?'许兰亲自给陈父打过电话，把那格私样裹在戏袍里，带回了家。':null,
  37:'吃过米粉，旅人和两个孩子在江边打水漂。鞋子湿了，就坐在石阶上晾。',
  38:s=>(hasMorningShifts(s)?'旅人值早班，错过何姐第一次走台。':'旅人看了何姐走台，记得她忘词后又来了一遍。')+'后来一提拍票袋，陈渡放下了手里的长凳。',
  39:'何姐把票袋翻过来，里衬上写着何秀枝。她肯让北京展出袋子的两面，戏和人都别拍。',
  41:s=>(s.choices[40]==='stand'?'何姐让北京把票袋图往下挪了半掌。':'北京送回新展签，何姐看过，自己的名字写对了。')+'下午她头回登台，台下的小孩接上了她的台词。',
  42:'北京墙上已经找不到许兰的照片，库房那箱旧册子里却还印着。老周让人先扣住箱子。',
  43:s=>s.revisedFrom<=43&&newItinerary(s,43)?'陈父在照相馆给两个人腾出位置。身边一部手机等合照，另一部手机里策划正在等车。':s.revisedFrom<=43?'陈渡的父亲穿着白衬衣在照相馆看开幕。北京的样册扣在桌上，老周还在电话那头等。':'开门前，旅人先请老周替自己递号码，才开口抽掉整页。陈渡的父亲理了发，穿了白衬衣去照相馆。',
  45:s=>({west:'开往贵阳的车上，邻座和旅人商量起明早吃什么。',wuhan:'旅人在回武汉的车上。阿宁说两个番茄有一个裂了口，她先吃那个。',beijing:'旅人在北上的车里摸到家门钥匙。邻座敲了敲玻璃，对面山腰上也有一列车。'})[s.choices[44]]
};
const people=[
  ['阿宁',1,'旅人的大学同学，在武汉等旅人来住。'],['唐青',1,'旅人的前同事。北京那场展览的采访是她做的。'],
  ['陈渡',1,'在火车上向旅人取回父亲那本展册的人。'],['老周',1,'旅人在北京的前主管。'],
  ['邱婆婆',4,'武汉小院隔壁的修鞋师傅，举手报名来试吃米糕。'],
  ['露露',13,'长沙印店里替展方打过纸样的人。'],['小伍',16,'在露露的印店做装订。'],
  ['蒋姐',19,'在长沙卖米糕，找露露印取货券。'],['何姐',23,'从前在阳朔渡口管票。'],
  ['许兰',33,'年轻时在渡口放跳板，请何姐替她挡过镜头。']
];
export function readingMemory(s,through){
  const n=Math.min(s.unlocked,through);
  if(n<1)return null;
  const decision=Object.keys(s.choices).filter(i=>decisionSummary(s,Number(i))).map(Number).reverse().find(i=>i<=n&&s.choices[i]);
  const notes=[];
  if(decision)notes.push({n:decision,text:decisionSummary(s,decision)});
  if(decision!==n){
    const moment=n===34&&newItinerary(s,n)?'旅人在江边等水里的山尖重新显出来。吃过早饭，老板等着答复这几晚怎么住。':previouslyRead(s,n)&&n!==43?null:sceneValue(rememberedMoments[n],s);
    notes.push({n,text:moment??'“'+s.highlights[n-1]+'”'});
  }
  const recent=[n-1,n].map(i=>(s.entries[i-1]??'')+(s.answers[i]?.reply??'')).join('');
  const cast=people.filter(([name,first])=>n>=first&&recent.includes(name));
  return {notes,people:cast.map(([name,,role])=>[name==='何姐'&&n>=39?'何秀枝（何姐）':name,role])};
}

const costs={
  1:['北京到武汉车票',398],3:['武汉头两日餐费',60],
  11:['武汉旅舍房费',240],14:['结清武汉餐费',92],
  16:['武汉到长沙车票',165],17:['长沙五晚床位',350],
  20:['长沙头两日餐费',70],27:['结清长沙餐费',100],
  31:['长沙南下车票和阳朔接驳',210],37:['阳朔餐费',90],41:['结清阳朔餐费',90]
};
const cheapestHomeTicket=238;
const westTicket=220, westBeds=300, travelCushion=90;
export function offerBeds(balance){
  const afterRoom=balance-bedPrices.room-mealsAfterLodging;
  const offers={};
  if(afterRoom>=cheapestHomeTicket)offers.room=bedPrices.room;
  if(afterRoom<westTicket+westBeds)offers.dorm=bedPrices.dorm;
  offers.workstay=bedPrices.workstay;
  return offers;
}
export function settleChapterMoney(s,n,pay){
  if((n===37||n===40) && s.choices[34]==='workstay')
    pay(s,n,n===37?'旅舍第一班工钱':'旅舍第二班工钱',shiftWage);
  if(costs[n]){const [title,cost]=costs[n];pay(s,n,title,-cost);}
  if(n===7 && s.choices[5]==='job')pay(s,n,'武汉急稿到账',680);
  if(n===19) {
    if(s.choices[18]==='shift')pay(s,n,'长沙夜班工钱',220);
    if(s.choices[18]==='press')pay(s,n,'六份点心纸套的摊款',90);
  }
  if(n===33 && s.choices[32]==='earn')pay(s,n,newItinerary(s,32)?'半日画摊报酬':'装订计件结工钱',300);
}
export function tickets(s,key){
  if(key==='west')return [['去贵阳的车票',westTicket],['贵阳两晚床位预订',westBeds]];
  if(key==='wuhan')return [['回武汉的车票',186]];
  return s.balance<790+travelCushion?[['北上普通列车硬座',cheapestHomeTicket]]:[['北上高铁',790]];
}
export function lodgingForecast(s,key){
  const {remaining}=lodging(s,key), west=westTicket+westBeds;
  return '结清床钱和余下 '+mealsAfterLodging+' 元饭账'+(key==='workstay'?'、领完两班工钱':'')+'，手里预计有 '+remaining+' 元。去贵阳的票和两晚住处共 '+west+' 元，'+(remaining>=west?'订好还能余 '+(remaining-west)+' 元。':'还差 '+(west-remaining)+' 元。');
}
export function closedOption(s,n,key){
  if(n===44 && key==='west' && s.balance<westTicket+westBeds)
    return '往西的车票和头两晚住处要 '+(westTicket+westBeds)+' 元，手里还差 '+(westTicket+westBeds-s.balance)+' 元。';
  return '';
}
export function settleChoiceMoney(s,n,key,pay){
  if(n===18 && key==='press')pay(s,n,'自印的纸和开机费',-260);
  if(n===22 && key==='refund') {
    if(newItinerary(s,n))pay(s,n,'分担补送的跑腿钱',-75);
    else pay(s,n,'退赔错印的单子',-150);
  }
  if(n===34){
    const {cost,dorm}=lodging(s,key);
    pay(s,n,key==='workstay'?'换宿床位（两个早班）':dorm?'首晚床位及三晚通铺':'阳朔四晚床位',-cost);
  }
  if(n!==44)return;
  for(const [title,cost] of tickets(s,key))pay(s,n,title,-cost);
}
