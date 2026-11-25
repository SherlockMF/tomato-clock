import {wuhanScene, wuhanMoments} from './season1-wuhan.mjs';
import {changshaScene, changshaMoments} from './season1-changsha.mjs';
import {yangshuoScene, yangshuoMoments} from './season1-yangshuo.mjs';

export const dailyMoments={...wuhanMoments,...changshaMoments,...yangshuoMoments};
export function seasonScene(n,s){
  if(n<=24)return wuhanScene(n,s);
  if(n<=48)return changshaScene(n,s);
  return yangshuoScene(n,s);
}
// A conversation can mention another city. The illustration follows the place of this scene.
const settings=[
  'journey','journey','journey','noodles','room','room','courtyard','bookshop','room','room','courtyard','bookshop',
  'park','bookshop','room','bookshop','workshop','courtyard','courtyard','room','courtyard','courtyard','room','room',
  'journey','street','room','street','workshop','workshop','street','street','street','street','street','noodles',
  'street','photo','photo','workshop','workshop','street','workshop','photo','room','room','journey','street',
  'ferry','courtyard','courtyard','courtyard','room','ferry','courtyard','ferry','photo','room','courtyard','room',
  'photo','street','ferry','room','room','ferry','room','street','room','room','journey','journey'
];
export const releaseScenes=[...new Set(settings)];
export function seasonIllustration(n,s){
  if((n===7||n===8) && s.choices[6]==='job')return 'room';
  if(n===26 && s.ledger.some(r=>r.n===25 && r.amount===-80))return 'journey';
  if((n===32||n===33||n===35) && s.choices[31]==='cafe')return 'room';
  if((n===54||n===55) && s.choices[53]==='rest')return 'room';
  return settings[n-1];
}
export const decisionNodes={
  2:{ask:'陈渡和父亲在电话那头等着。底片怎么送到武汉？',options:[
    ['carry','我带到武汉，和师傅约个地方见。','P',5,'答应亲手把底片交给暗房师傅'],
    ['desk','我找列车员办交接，把单号发给师傅。','J',5,'让列车员登记这卷底片的去向']]},
  6:{ask:'阿宁已经请好了假。老周等着回话，下午的活接吗？',options:[
    ['job','接下这份稿子，我亲自跟阿宁说。','T',5,'接下有交期的稿子，改了和阿宁的约'],
    ['river','下午约了阿宁，请老周找别人。','F',5,'把约好的半天留给阿宁']]},
  31:{ask:'露露想租今晚的摊位，咖啡馆也在等人回话。今晚怎么过？',options:[
    ['stall','我来垫押金。桌子一人抬一头，咱俩一起摆。','P',5,'先垫押金，和露露一起经营一晚的摊位'],
    ['cafe','我去咖啡馆替班。打烊了再来找你。','J',5,'接下咖啡馆约定的晚班']]},
  53:{ask:'离船靠岸还有不到一小时。去渡口，还是留下来交稿？',options:[
    ['photo','我陪陈渡去渡口，咱们在岸上等船。','E',4,'陪陈渡在渡口等船，推掉试稿'],
    ['rest','我留下接试稿，借一间清静的屋子。','I',6,'为当天上午的试稿换房，让陈渡自己去拍船']]},
  71:{ask:'快到车站了。今天想上哪一趟车？',options:[
    ['west','去贵阳，吃一顿纸巾地图上的早饭。','N',5,'买票继续往西，到一座新城市过早'],
    ['wuhan','回武汉，和阿宁一起写小院开门的告示。','F',5,'回武汉，和阿宁一起准备小院开门'],
    ['beijing','回北京，把新工作的条件当面谈清楚。','T',5,'回北京，给下一份工作谈清时间边界']]}
};
export const replies={
  carry:'“地址你发我吧，我到了跟你说一声。”旅人挪开脚边的水瓶，把装底片的袋子单独收好。电话那头，陈渡把这话又给父亲说了一遍。',
  desk:'旅人朝过道里招手，请列车员过来。陈渡听见列车员问袋子的颜色，就把电话开了免提，让父亲自己说。',
  job:'旅人给老周回了话，转过身，和阿宁说了下午得留在家里。阿宁把门边两顶帽子叠在一起，又想起自己还要用，拿走了上面那一顶。',
  river:'“你找别人吧。我下午约了人。”旅人挂上电话，去拿门口那顶帽子。阿宁已经穿好了鞋，又坐下来等。',
  stall:'“押金我来。”露露扶住快合上的桌腿，笑出了声：“那你先帮我抬一下，这个我是真的一个人弄不动。”',
  cafe:'旅人给咖啡馆回了电话，问清从哪扇门进。露露把画塞回布包：“你先去，我再问问哪儿能坐。”',
  photo:'旅人给老周回了消息，让他另找人，跟陈渡说好岸上见。',
  rest:'旅人接了稿子，跟陈渡说了上午的安排。陈渡回了个好，又补了一句：“给你留张照片。”',
  west:'旅人订好往西的车，把那张画着早点铺的纸巾从衣袋换到钱包里。',
  wuhan:'旅人把到站时间发给阿宁：“那张告示给我留一半。”',
  beijing:'旅人订了北上的车，给老周发了条消息：“我会回北京。见面的时间，等我到了再定。”'
};
export function seasonItems(s){
  const carry=s.choices[2]==='carry';
  return [
    {n:4,title:carry?'暗房师傅的收条':'底片领取回执',detail:carry?'师傅在面馆接过纸袋，亲手写了张收条。':'值班室确认师傅领到了纸袋。',scene:'photo'},
    {n:25,title:'阿宁家的备用钥匙',detail:'离开武汉那天，阿宁让旅人把钥匙留在身边。',scene:'courtyard'},
    {n:46,title:'露露的红门明信片',detail:'长沙临别，露露把那张红门递给了旅人。',scene:'street'}
  ].filter(item=>item.n<=s.unlocked);
}
const outlays={
  1:['北京到武汉车票',-398],4:['汉口面馆晚饭',-30],9:['结清早饭钱',-25],13:['武汉轮渡',-10],
  20:['分摊饭菜钱',-60],24:['结清武汉其余餐费',-60],27:['长沙青旅四晚',-280],28:['晚市豆花两碗',-20],
  36:['青旅合伙午饭',-25],46:['长沙四天早饭和洗衣',-80],47:['长沙到桂林车票',-185],48:['桂林住宿一晚',-80],
  49:['桂林到阳朔车费及四晚床位',-380],52:['晚粥和小菜',-25],58:['阳朔餐费',-40],68:['酸汤晚饭',-35]
};
export function seasonMoney(s,n,pay){
  const debit=outlays[n];
  if(debit)pay(s,n,...debit);
  if(n===4 && s.choices[2]==='carry')pay(s,n,'替陈渡送还底片',200);
  if(n===8 && s.choices[6]==='job')pay(s,n,'展览样稿交付验收',1200);
  if(n===16 && s.choices[6]==='river')pay(s,n,'书店整理照片',160);
  if(n===21 && s.trace.some(r=>r.n===21 && r.letter==='F'))pay(s,n,'给小院门边添灯',-150);
  if(n===25){
    const slow=s.balance<2400;
    pay(s,n,slow?'武汉到长沙普通列车':'武汉到长沙动车',slow?-80:-220);
  }
  if(n===32 && s.choices[31]==='stall')pay(s,n,'垫付一晚摊位押金',-300);
  if(n===34 && s.choices[31]==='cafe')pay(s,n,'咖啡馆晚班工钱',180);
  if(n===35 && s.choices[31]==='stall'){
    pay(s,n,'摊位退押金',300);
    pay(s,n,'明信片销售净分成',240);
  }
  if(n===54 && s.choices[53]==='rest'){
    pay(s,n,'补两晚单间差价',-240);
    pay(s,n,'远程试稿交付',800);
  }
  if(n===57 && s.trace.some(r=>r.n===57 && r.letter==='F'))pay(s,n,'替船工夫妇放大加印',-60);
}
export function bookFare(s,key,pay){
  // Leave enough for the first few days back home when a slower berth is available.
  const slow=key==='beijing' && s.balance-790<300;
  const fares={west:['去贵阳车票',-200],wuhan:['回武汉车票',-380],beijing:slow?['回北京过夜卧铺',-420]:['回北京车票',-790]};
  pay(s,71,...fares[key]);
}
