// Score the published text before substituting a reader's nickname.
const motifs = {
  rehearsal:/排练|合练|走位|候场|戏台|舞台|谢幕|幕布|台词|演员|观众席|放映厅|戏班|场务|台口|合唱|排歌|练歌|歌本|唱段|唱老歌|练琴|琴谱|谱架|指挥棒|换气唱|音头/gu,
  bookshop:/书店|书铺|借书台|图书馆|还书台|借阅室|借阅证|书架|书脊|书摊|朗读会|旧书铺/gu,
  pet:/家猫|猫粮|猫碟|喂猫|看猫|给猫|那只猫|阿饼|橘猫|猫砂|兔笼|兔粮|兔舍|喂兔|家里的兔子|换草垫|水碟/gu,
  pool:/泳池|泳馆|游泳馆|游泳池|浅水池|浅池|池边|泳道|泳帽|泳衣|泳镜|泳圈|浮板|踩水|蹬壁|蛙泳|自由泳|划水|打腿|水里憋气/gu,
  photo:/照相馆|照相铺|摄影师|照相机|相机|合影|底片|洗印|试拍|样片|选片|冲洗照片|相册|拍全家福|快门|取景框|人像照/gu,
  courtyard:/楼梯间|楼梯口|楼梯|楼道|楼门口|单元门|门洞|院门|院子里|院里|后院|天井|晾台|晒台|晾衣绳|晾衣架|楼缝|楼门前|楼下空地/gu,
  kitchen:/早餐店|饭馆|酸梅汤|豆腐|灶前|厨房|番茄|蛋羹|炒菜|锅边|做饭|灶台|灶火|菜谱|掌勺|面团|揉面|面包|锅巴|面汤|面铺|饭桌|早餐|早点|菜刀|菜板|炖|烤箱|调馅|葱花|饺子|馄饨|端菜|上菜|煮面|炒锅|蒸笼|酵头/gu,
  journey:/车站|车票|车厢|火车|检票|站台|进站|出站|行李箱|拖着箱子|卧铺|乘车|公交|车窗|长途车|候车|靠窗座|末班车|换乘|渡船|轮渡|船票|码头/gu,
  street:/菜摊|摆摊|摊位|收摊|菜场|摊主|街边|巷口|街口|巷子|街市|集市|沿街|街角|路口|夜市|早市|商铺|路边|街坊|店门口|卷帘门|买菜/gu,
  workshop:/木工|工坊|工作台|车间|木料|刨花|砂纸|锯子|凿子|螺丝|铰链|修理|线轴|缝纫|纸样|编织|裁布|织针|毛衣|针脚|竹架|打磨|修琴|图文店|工具箱|扳手|试工|印刷|刻版|排版/gu,
  park:/草坪|露营|帐篷|观鸟|望远镜|栽花|公园|江边|河边|河岸|河畔|江畔|堤岸|水鸟|鸟名单|鸟叫|认鸟|树影|花房|花圃|花盆|草地|长椅|踢球|球场|水面|树荫|芦苇|步道|山坡|柳树/gu,
  room:/明信片|家书|旧信|回信|借条|信封|家里|卧室|枕头|沙发|客厅|房门|上铺|床沿|回房|台灯|被子|床头|窗帘|翻书|读书|日记|住处|手记|书桌/gu
};

// A short reply such as “从这儿再开一次” can depend on a scene established days earlier.
const chapterCache=new WeakMap();
function chapterScenes(cards){
  if(chapterCache.has(cards))return chapterCache.get(cards);
  const scores=new Map(), result=new Map();
  for(const w of cards)for(const e of w.events){
    const chapter=/^(w\d+)\./.exec(e.id)?.[1];
    if(!chapter)continue;
    if(!scores.has(chapter))scores.set(chapter,new Map());
    const rank=scores.get(chapter);
    for(const [name,pattern] of Object.entries(motifs)){
      const hits=(e.text.match(pattern)??[]).length;
      if(hits)rank.set(name,(rank.get(name)??0)+hits);
    }
  }
  for(const [chapter,rank] of scores){
    const top=[...rank].sort((a,b)=>b[1]-a[1])[0];
    if(top)result.set(chapter,top[0]);
  }
  chapterCache.set(cards,result);
  return result;
}

export function sceneFor(cards, index) {
  const events=cards[index].events;
  const text=events.map(e=>e.text).join('\n');
  const local=events.at(-1).day;
  const nearby=[cards[index-1],cards[index+1]].filter(Boolean)
    .flatMap(w=>w.events).filter(e=>e.day===local).map(e=>e.text).join('\n');
  const chapter=events.map(e=>/^(?:wake\.)?(w\d+)\./.exec(e.id)?.[1]).find(Boolean);
  const theme=chapter ? chapterScenes(cards).get(chapter) : null;
  let scene='room', best=0;
  for(const [name,pattern] of Object.entries(motifs)){
    const hits=(text.match(pattern)??[]).length;
    const context=(nearby.match(pattern)??[]).length;
    const score=hits*8+Math.min(3,context)*2+Number(name===theme);
    if(score>best){best=score;scene=name;}
  }
  // An actual departure is the point of the opening, regardless of the previous job.
  if(index===0&&events[0].day===1)return 'journey';
  // Nearby windows can establish a setting. Only this window can supply its close-up.
  for(const {text:moment} of events){
    if(scene==='kitchen'||scene==='street'){
      if(/酸梅汤|乌梅|熬梅汤|酸梅味/.test(moment)||
        (/傅姐/.test(moment)&&/滤网|橘皮|果肉|甜度|盛汤|洗果子/.test(moment)))return 'plum';
      if(/(?<!臭)豆腐(?!脑|乳|皮|干|渣|花)/.test(moment)&&/切|刀|气孔|半块|整块|许嫂|买|摊|称/.test(moment))return 'tofu';
    }
    if(scene==='park'&&(/踢球|足球|球门|传球|踢进|踢出/.test(moment)||
      (/阿梓|徐姐/.test(moment)&&/球场|替补|上场|换人|边线|球赛/.test(moment))))return 'football';
    if(scene==='courtyard'&&/孩子|满满|学骑/.test(moment)&&
      /骑车|学骑|自行车|车座|车把|车筐|踏板|脚蹬|后座|车辙|登车/.test(moment))return 'bicycle';
  }
  return scene;
}

export const sceneUrl=scene=>'/annual-scenes/'+scene+'.webp';

function wrap(ctx,text,width){
  const lines=[];
  for(const p of text.split(/\n+/)){
    let line='';
    // Keep closing punctuation with its phrase and opening quotes with their first character.
    const units=p.match(/[“‘（《【]*(?:[a-zA-Z0-9]+|.)[，。！？：；、”’）》】…]*/gu)??[];
    for(const c of units){
      if(line&&ctx.measureText(line+c).width>width){lines.push(line);line='';}
      line+=c;
    }
    if(line)lines.push(line);
  }
  return lines;
}

export async function drawCard({scene,events,name,type,label}){
  const image=new Image();
  image.src=sceneUrl(scene);
  await image.decode();
  const canvas=document.createElement('canvas');
  canvas.width=1080;
  const ctx=canvas.getContext('2d');
  const serif='"Songti SC","SimSun",serif', sans='"Microsoft YaHei","PingFang SC",sans-serif';
  const textFont='40px '+serif, leading=64;
  ctx.font=textFont;
  const blocks=events.map(e=>({mark:e.at.slice(5,10)+'  '+e.at.slice(11)+'   /   '+e.city,
    lines:wrap(ctx,e.text,900)}));
  const textHeight=blocks.reduce((h,b)=>h+86+b.lines.length*leading,0);
  const artHeight=600;
  canvas.height=Math.max(1350,artHeight+280+textHeight);
  const scale=Math.max(1080/image.width,artHeight/image.height);
  const height=image.height*scale;
  ctx.drawImage(image,(1080-image.width*scale)/2,(artHeight-height)*.50,image.width*scale,height);
  ctx.fillStyle='#252d35';ctx.fillRect(0,artHeight,1080,canvas.height-artHeight);
  ctx.fillStyle='#fcf1dc';ctx.fillRect(30,artHeight-36,1020,canvas.height-artHeight+6);
  ctx.fillStyle='#946041';ctx.font='26px '+sans;ctx.fillText('平 行 人 生   /   旅 途 手 记',88,artHeight+35);
  ctx.fillStyle='#342c2c';ctx.font='52px '+serif;
  ctx.fillText(name+'的旅程',88,artHeight+119,902);
  let y=artHeight+193;
  for(const b of blocks){
    ctx.fillStyle='#825139';ctx.font='28px '+sans;ctx.fillText(b.mark,90,y,900);
    y+=59;ctx.fillStyle='#322c28';ctx.font=textFont;
    for(const line of b.lines){ctx.fillText(line,90,y);y+=leading;}
    y+=27;
  }
  ctx.fillStyle='#c7ae90';ctx.fillRect(90,canvas.height-135,900,2);
  ctx.fillStyle='#694e40';ctx.font='27px '+sans;ctx.fillText(type+'  ·  '+label,90,canvas.height-81);
  return canvas;
}
