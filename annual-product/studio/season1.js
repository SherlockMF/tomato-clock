import {release,inMiniTool,miniPlatform} from './season1-build.mjs';
import {axes,directions,types} from './annual-state.mjs';
import {turn,seasonLength,windowAt,where,visibleText,entryText,choiceList,choiceNode,choiceReply,keepsakes} from './season1-state.mjs';
import {drawCard,drawSeasonCard,seasonArtFor,sceneUrl} from './annual-share.mjs';
import {chapterAt,chapterPresentation,closedOption,decisionSummary,lodgingForecast,opening,readingMemory,sceneValue,tickets} from './south-season.mjs';

const $=id=>document.getElementById(id);
const make=(tag,txt='',cls='')=>{const e=document.createElement(tag);e.textContent=txt;if(cls)e.className=cls;return e;};
function button(label,fn,cls=''){const b=make('button',label,cls);b.type='button';b.onclick=fn;return b;}
const setup=$('setup'), pref=$('pref');
const params=new URLSearchParams(location.search);
const classic=false, edition=3;
const preview=!release && (document.documentElement.dataset.mode==='preview'||params.get('preview')==='1');
const savePrefix=preview?'south-preview-v':'south-focus-v';
const slot=savePrefix+'4';
const allowSkip=preview;
if(!release)$('edition-mark').hidden=!preview;
if(edition!==3){
  $('premise').textContent='你在专注，TA 在生活。';
  setup.elements.nickname.placeholder='为旅人起个名字';
}
function previousLinks(hasSave){
  const line=$('previous-link');
  line.replaceChildren();
  const archives=[[savePrefix+'3','3','继续上次的 45 段旅程'],[savePrefix+'2','2','继续上次的 72 段旅程']];
  if(preview)archives.push(['south','1','继续最早的旅程']);
  for(const [key,version,title] of archives){
    if(!hasSave(key))continue;
    const link=make('a',title), query=new URLSearchParams(inMiniTool?location.search:'');
    if(version==='1')query.set('classic','1');else query.set('edition',version);
    if(preview)query.set('preview','1');
    const localFile=preview?'./南下十五日/旧版存档/可跳过试读.html':'./旧版存档/完成专注.html';
    const path=inMiniTool?'':location.protocol==='file:'?localFile:'/season1-legacy';
    link.href=path+'?'+query.toString()+'#focus';
    if(line.childNodes.length)line.append('　');
    line.append(link);
  }
  line.hidden=!line.childNodes.length;
}
for(const t of types)setup.elements.type.add(new Option(t,t));
setup.elements.type.value='INFP';
for(const [k,v] of Object.entries(directions))pref.elements.letter.add(new Option(v,k));
let db,s=null,alive=false,settling=false,nextMinutes=25;
const channel=!inMiniTool && typeof BroadcastChannel==='function'?new BroadcastChannel(classic?'parallel-season-south-1':slot):null;
function status(t){$('message').textContent=t;}
let storageBlocked=false;
function storageError(e){
  error(e);
  if($('setup-sheet').open)$('setup-status').textContent=$('message').textContent;
  if(inMiniTool){
    storageBlocked=true;
    $('message').append(' ',button('重新读取存档',()=>refresh(),'quiet'));
  }
}
function error(e){status('操作未完成：'+(e.message||e.errMsg||'请稍后再试。'));}
let pending=Promise.resolve();
function access(action){
  if(!inMiniTool)return browserAccess(action);
  const operation=pending.then(async()=>{
    s=await miniPlatform.access(slot,action,turn);
    previousLinks(miniPlatform.hasSave);
    alive=true;storageBlocked=false;status('');render();
  });
  pending=operation.catch(()=>{});
  return operation;
}
async function browserAccess(action){
  const tx=db.transaction('journeys',action?'readwrite':'readonly');
  const table=tx.objectStore('journeys');
  const req=table.get(slot), result=await new Promise((ok,fail)=>{
    let next,changed=false;
    req.onsuccess=()=>{
      const old=req.result??null;
      next=action?turn(old,action,Date.now()):old;
      changed=next!==old;
      if(changed)table.put(next,slot);
    };
    tx.oncomplete=()=>ok({next,changed});tx.onabort=()=>fail(tx.error??new Error('存档事务中止'));tx.onerror=()=>fail(tx.error);
  });
  s=result.next;alive=true;render();
  if(result.changed)channel?.postMessage('saved');
}
function act(action){return access(action).catch(storageError);}
function sessionId(){return crypto.randomUUID?.()??('focus-'+Date.now()+'-'+Math.random().toString(36).slice(2));}
function timerAction(kind){return act({kind,id:kind==='start'?sessionId():s.id,unlocked:s.unlocked,minutes:nextMinutes});}
function stamp(n){
  const {start:a,end:b,part:daypart}=windowAt(n,s);
  if(daypart)return '6月'+a.day+'日 · '+daypart+' · '+where(s,n);
  const part=p=>'6月'+p.day+'日 '+p.time;
  const previousNight=n>1 && windowAt(n-1).end.day!==a.day;
  const sleep=a.day!==b.day?' · 夜间睡眠已跳过':previousNight?' · 昨夜睡眠已跳过':'';
  return part(a)+' — '+(a.day===b.day?b.time:part(b))+' · '+where(s,n)+sleep;
}
function chapterTitle(n){return !s?chapterAt(n).title:s.edition===3?chapterPresentation(s,n).title:'第 '+n+' 段手记';}
function illustration(n){
  return sceneValue(chapterPresentation(s,n).art,s);
}
const sceneDescriptions={
  journey:'列车窗外的暮色与远山',noodles:'街边小店刚端上桌的两碗面',ricecake:'冒着白汽的竹蒸笼和切好的米糕',
  proof:'台灯下摊开的校样和铅笔',photo:'窗边桌上散开的照片和相机',room:'窗前摊开的本子和信纸',
  courtyard:'爬满藤蔓的小院门口',pressroom:'印店里从机器上接起纸样的手',workshop:'工作台上忙着裁纸的双手',
  street:'雨后街口的一家小店',ferry:'停在岸边的渡船和石阶',riverstep:'石阶旁的渡船和江上的山影',
  ticketbag:'放在桌上的旧布票袋',kitchen:'厨房案板上的一碗红番茄'
};
function prose(t){return make('p',visibleText(s,t),'prose');}
function chapterImage(n){
  const scene=chapterPresentation(s,n).readingArt??illustration(n),img=make('img','','chapter-illustration');
  img.alt=sceneDescriptions[scene];img.dataset.scene=scene;img.src=sceneUrl(scene);
  img.width=1080;img.height=600;
  return img;
}
function introText(){return visibleText(s,opening);}
function appendStory(parent,n){
  for(const paragraph of entryText(s,n).split(/\n+/))parent.append(prose(paragraph));
  const reply=choiceReply(s,n);
  if(reply)parent.append(prose(reply));
}
function appendReadingChapter(parent,n){
  const chapter=make('section','','current-chapter');
  if(s.edition===3)chapter.append(chapterImage(n));
  const title=s.edition!==3&&n===seasonLength(s)?'南下十五日 · 季终':chapterTitle(n);
  chapter.append(make('p',stamp(n),'meta'),make('h2',title));
  appendStory(chapter,n);appendPreferenceEcho(chapter,n);
  if(n===1&&s.unlocked===1)appendFirstPreference(chapter);
  for(const rec of s.trace.filter(r=>r.n===n&&r.previous!==r.current)){
    const note=make('p','','turn');
    const link=make('a','看看这次经历留下的变化');link.href='#decision-'+n+'-'+rec.kind;
    note.append(link);chapter.append(note);
  }
  const tools=make('div','','entry-tools');
  cashList(tools,n);
  if(s.edition===3&&n===s.unlocked&&n<seasonLength(s)&&(n>1||s.preferences.length))tools.append(preferenceLink());
  const b=button('分享这段手记',()=>share(n,b),'entry-share');
  b.setAttribute('aria-label','分享第 '+n+' 段手记');
  tools.append(b);chapter.append(tools);parent.append(chapter);
}
function cashList(parent,n){
  const rows=s.ledger.filter(x=>x.n===n);
  if(!rows.length)return;
  const d=make('details'),list=make('ul');d.append(make('summary','本段收支'));
  for(const r of rows)list.append(make('li',r.title+'　'+(r.amount>0?'+':'')+r.amount+' 元'));
  d.append(list);parent.append(d);
}
async function share(n,b){
  b.disabled=true;
  try{
    const raw=entryText(s,n),reply=choiceReply(s,n)??'';
    const full=visibleText(s,raw+(reply?'\n\n'+reply:''));
    const excerpt=s.edition===3?visibleText(s,s.answers[n]?.quote??s.highlights[n-1]):reply?visibleText(s,choiceNode(s,n).ask+'\n'+reply):full;
    const subject=classic?seasonArtFor(raw):illustration(n);
    const {start,part}=windowAt(n,s);
    const label='第 '+n+' 段'+(release?' · 专注手记':s.testWindows.includes(n)?' · 试读':' · 专注手记');
    const atType=s.trace.filter(r=>r.n<=n).at(-1)?.current??s.type;
    const canvas=classic?await drawCard({scene:subject,name:s.nickname,type:atType,label,
      events:[{city:where(s,n),at:'2026-06-'+String(start.day).padStart(2,'0')+' '+start.time,text:full}]}):
      await drawSeasonCard({scene:subject,text:excerpt,name:s.nickname,place:where(s,n),date:'6月'+start.day+'日'+(part?' · '+part:''),title:s.edition===3?chapterTitle(n):null,footer:atType+'    /    '+label});
    const src=canvas.toDataURL('image/png');
    $('share-img').src=src;
    if(!inMiniTool){$('save-share').href=src;$('save-share').download='南下十五日-第'+n+'段.png';}
    $('share-text').value=full;$('share-text').hidden=true;$('share-status').textContent='';
    if(!$('share-sheet').open)$('share-sheet').showModal();
  }catch(e){error(e);b.disabled=false;}
  finally{b.disabled=false;}
}
$('close-share').onclick=()=>$('share-sheet').close();
$('share-sheet').onclose=()=>{$('share-img').removeAttribute('src');$('save-share').removeAttribute('href');};
if(inMiniTool)miniPlatform.bindShare(document);
else $('copy-share').onclick=async()=>{
  const t=$('share-text');
  try{await navigator.clipboard.writeText(t.value);$('share-status').textContent='正文已复制。';}
  catch{t.hidden=false;t.focus();t.select();$('share-status').textContent='长按已选中的文字即可复制。';}
};
function appendIntro(panel){
  panel.append(make('h2','出发前'));
  for(const paragraph of introText().split('\n'))panel.append(make('p',paragraph,'prose'));
}
function renderIntro(){
  const panel=$('intro');panel.replaceChildren();
  if(!s||classic||s.id)return;
  const firstSession=s.sessions?.[0];
  const withOpening=s.includePrologue&&(s.unlocked===1||
    (s.unlocked===2&&firstSession?.from===1&&firstSession.minutes===50));
  if(s.unlocked>0&&!withOpening)return;
  appendIntro(panel);
}
let openRecapAt=0;
function appendRecap(parent,through){
  if(s.edition!==3||through<1)return;
  const memory=readingMemory(s,through),box=make('details','','reading-recap');
  box.open=openRecapAt===through;
  box.ontoggle=()=>{if(box.isConnected)openRecapAt=box.open?through:0;};
  box.append(make('summary','上回读到哪儿'));
  for(const note of memory.notes){
    const row=make('p'),link=make('a',chapterTitle(note.n));
    link.href='#entry-'+note.n;
    row.append(link,document.createTextNode('　'+visibleText(s,note.text)));box.append(row);
  }
  if(memory.people.length){
    box.append(make('h3','这两段里的人'));
    const list=make('dl');
    for(const [name,role] of memory.people)list.append(make('dt',name),make('dd',visibleText(s,role)));
    box.append(list);
  }
  parent.append(box);
}
function preferenceLink(){
  const a=make('a','给旅人留个偏好','pref-link');a.href='#preferences';return a;
}
function appendFirstPreference(parent){
  if(s.edition!==3||s.preferences.length)return;
  const box=make('aside','','first-preference');
  box.append(make('p','路上，你想嘱咐'+s.nickname+'什么？'),make('span','可以选个做法，比如「先听当事人的感受」。遇到合适的事，旅人可能会照着做。你也可以留句备注，到那一段的手记下面回看。'));
  const link=preferenceLink();link.textContent='留一句偏好';box.append(link);parent.append(box);
}
function appendPreferenceEcho(parent,n){
  const daily=s.trace.find(r=>r.n===n&&r.kind==='daily'&&r.preference);
  const effect=daily??(s.answers?.[n]?.preference?s.answers[n]:null);
  if(!effect||s.edition!==3)return;
  const label=directions[effect.preference.letter];
  const row=make('p','','pref-echo'),link=make('a','看这次决定');
  const echoed=effect.preferenceEffect==='改变了当时的取舍'
    ?'这回，'+s.nickname+'照着你选的「'+label+'」换了个做法。'
    :'这回的做法也合了你选的「'+label+'」。';
  row.append(document.createTextNode(echoed+(effect.preference.note?'你当时写下了「'+effect.preference.note+'」。':'')+' '));
  link.href='#decision-'+n+(daily?'-daily':'-key');row.append(link);parent.append(row);
}
function renderHome(waiting,finished,lastChapter){
  const picker=$('home-duration'),time=$('ready-time'),depart=$('depart');
  if(lastChapter)nextMinutes=25;
  for(const input of picker.querySelectorAll('input')){
    input.checked=Number(input.value)===nextMinutes;
    input.parentElement.hidden=lastChapter&&input.value==='50';
  }
  picker.hidden=waiting||finished||lastChapter;
  time.hidden=waiting||finished;
  time.textContent=nextMinutes+':00';
  $('setup-start').textContent='开始 '+nextMinutes+' 分钟专注';
  depart.disabled=!alive;
  depart.textContent=finished?'重读旅途手记':waiting?'去做决定':'开始专注';
  const next=(s?.unlocked??0)+1;
  $('focus-reward').textContent=finished?'十五天的手记已经收齐。':waiting?'旅人正在等你的决定。':
    '专注 '+nextMinutes+' 分钟，'+(nextMinutes===50?'读两章，从':'读')+'《'+chapterTitle(next)+'》'+(nextMinutes===50?'开始':'')+'。';
  $('premise').hidden=!!s;
  $('summary').hidden=!s;
}
$('home-duration').onchange=e=>{
  nextMinutes=Number(e.target.value);
  renderHome(false,false,false);
};
function renderClock(parent,n){
  const paused=s.deadline===null,next=Math.min(n+1,seasonLength(s));
  const mode=(paused?'已暂停':'正在专注')+'　·　'+(s.minutes??25)+' 分钟';
  const toggle=paused?'继续计时':'暂停';
  const current=parent.firstElementChild;
  if(current && current.dataset.session===s.id){
    current.classList.toggle('is-paused',paused);
    current.querySelector('.clock-mode').textContent=mode;
    current.querySelector('.clock-toggle').textContent=toggle;
    return;
  }
  const scene=classic?'journey':illustration(next);
  const card=make('section','','focus-clock'+(paused?' is-paused':''));
  card.dataset.session=s.id;card.setAttribute('aria-label','本次专注');
  const art=make('div','','clock-art clock-art-'+scene);
  art.setAttribute('aria-hidden','true');
  const picture=make('img');picture.alt='';picture.src=sceneUrl(scene);
  art.append(picture);
  if(scene==='journey'){
    const windowView=make('div','','train-window');
    windowView.append(picture.cloneNode());art.append(windowView);
  }
  const place=make('h1',where(s,next),'clock-place');
  const {start,part}=windowAt(next,s);
  const heading=make('div','','clock-heading');
  heading.append(make('span','6 月 '+start.day+' 日'+(part?' · '+part:''),'clock-date'),place);
  const dial=make('div','','clock-dial');
  const time=make('div','','clock-time');time.id='timer';time.setAttribute('role','timer');
  time.setAttribute('aria-label','专注剩余时间');
  const track=make('div','','clock-track');track.setAttribute('aria-hidden','true');
  const fill=make('i');fill.id='clock-progress';track.append(fill);
  dial.append(make('p',mode,'clock-mode'),time,track);
  const controls=make('div','','clock-controls');
  controls.append(button(toggle,()=>timerAction(s.deadline===null?'resume':'pause'),'clock-toggle'),
    button('取消本次',()=>timerAction('cancel'),'clock-cancel'));
  if(allowSkip)controls.append(button('跳过本次专注',()=>timerAction('skip'),'clock-cancel'));
  card.append(art,heading,dial,controls);parent.replaceChildren(card);
}
function renderFocus(){
  const active=!!s?.id,focus=$('focus');
  const wasTiming=focus.classList.contains('timing'),entering=active&&!wasTiming;
  focus.classList.toggle('timing',active);
  renderIntro();
  focus.classList.toggle('welcoming',!s);
  const p=$('stage'),n=s?.unlocked??0,length=s?seasonLength(s):0;
  const node=s&&choiceNode(s,n),pending=!!node&&!s.choices[n];
  if(s)$('summary').textContent=s.nickname+'的旅程 · 已读 '+n+' / '+length+' 段';
  if(!active){
    p.replaceChildren();
    renderHome(pending,!!s&&n===length,!!s&&n===length-1);
  }
  if(!s)return;
  if(active){
    renderClock(p,n);
    if(entering){p.dataset.beforeFocus=String(n);window.scrollTo(0,0);}
    return;
  }
  if(n){
    const last=s.sessions?.at(-1);
    const from=(!release&&s.trialFrom)||(last?.minutes===50?last.from:n),start=n===from+1?from:n;
    appendRecap(p,start-1);
    if(start<n)appendReadingChapter(p,start);
    appendReadingChapter(p,n);
    if(wasTiming&&n>Number(p.dataset.beforeFocus)){
      const reward=$('intro').firstElementChild||p.querySelector('.current-chapter');
      reward.scrollIntoView({block:'start'});
    }
  }
  if(pending){
    const q=make('div','','choice'),title=make('h2',n===5?'六百八的急稿，接不接？':visibleText(s,node.ask));
    title.id='pending-choice';title.tabIndex=-1;
    q.append(make('p',where(s,n)+' · 旅途抉择','choice-place'),title);
    const options=choiceList(s,n);
    const scenes={job:'proof',river:'ricecake',credit:'proof',break:'pressroom',knock:'courtyard',note:'room',
      press:'street',shift:'workshop',refund:'room',reprint:'pressroom',table:'workshop',walk:'street',
      meet:'ferry',earn:'workshop',room:'room',dorm:'courtyard',workstay:'kitchen',speak:'ticketbag',
      stand:'ferry',pull:'photo',number:'proof',west:'journey',wuhan:'ricecake',beijing:'room'};
    if(n===5)q.append(make('p',visibleText(s,node.ask),'choice-context'));
    if(s.credit)q.append(make('p','下一段已经随这次专注解锁，选好就能接着读。','meta'));
    for(const [key,label] of options){
      const pick=button('',()=>act({kind:'choose',unlocked:n,key}),'choice-card');
      const img=make('img');img.alt='';img.src=sceneUrl(scenes[key]??illustration(n));
      const copy=make('span',label,'choice-copy');
      if(s.edition===3 && n===34)copy.append(make('small',lodgingForecast(s,key)));
      if(s.edition===3 && n===44)copy.append(make('small',tickets(s,key).map(([t,c])=>t+' '+c+' 元').join(' · ')));
      pick.append(img,copy);
      q.append(pick);
    }
    if(s.edition===3)for(const option of node.options){
      const reason=closedOption(s,n,option.key);
      if(reason)q.append(make('p',reason,'meta'));
    }
    p.append(q);return;
  }
  if(n===length){const a=make('a','回看十五天的人格变化');a.href='#profile';const line=make('p');line.append(a);p.append(line);return;}
  if(n===0)appendFirstPreference(p);
  p.append(readingNext(n));
}
function readingNext(n,fromBook=false){
  const controls=make('div','','reading-next');
  controls.append(make('p','下一章 · '+chapterTitle(n+1),'next-chapter'));
  controls.append(button(n?'开始下一次专注':'开始第一次专注',()=>{
    if(fromBook)location.hash='focus';
    timerAction('start');
  },'reading-start'));
  if(allowSkip&&!fromBook)controls.append(button('跳过专注试读',()=>timerAction('skip'),'reading-skip'));
  return controls;
}
function renderBook(target){
  const b=$('book-pages');b.replaceChildren();
  const picker=$('book-day');
  picker.replaceChildren(new Option('选择日期',''));
  $('book-day-label').hidden=!s?.unlocked;
  $('archive-share').hidden=!s?.unlocked;
  if(!s?.unlocked){b.append(make('p','完成第一次专注后，从这里连读。'));return;}
  if(!classic)appendIntro(b);
  const shareEntry=$('share-entry');
  const shareN=target?.startsWith('entry-')?target.slice(6):(shareEntry.value||s.unlocked);
  shareEntry.replaceChildren();
  let day=0;
  for(let i=1;i<=s.unlocked;i++){
    const {start:a,part}=windowAt(i,s);
    if(a.day!==day){
      day=a.day;
      const places=[];
      const dayEnd=part?Math.min(i+2,s.unlocked):i;
      let lastLeg;
      for(let j=i;j<=dayEnd;j++){
        const leg=where(s,j);
        if(leg!==lastLeg)for(const name of leg.split(' → '))if(places.at(-1)!==name)places.push(name);
        lastLeg=leg;
      }
      const heading=make('h2','6月'+day+'日 · '+places.join(' → '));
      heading.id='book-day-'+day;heading.tabIndex=-1;
      if(s.edition===3){const img=chapterImage(i);img.loading='lazy';b.append(img);}
      b.append(heading);
      picker.add(new Option(heading.textContent,heading.id));
    }
    shareEntry.add(new Option('第 '+i+' 段 · '+(s.edition===3?chapterTitle(i):'6月'+a.day+'日 · '+where(s,i)),String(i)));
    const row=make('div');row.id='entry-'+i;
    if(part){
      row.className='book-chapter';row.tabIndex=-1;
      row.append(make('p',part+' · '+where(s,i),'book-part'),make('h3',chapterTitle(i)));
    }
    appendStory(row,i);b.append(row);
  }
  shareEntry.value=String(shareN);
  if(s.unlocked<seasonLength(s)){
    if(s.id||choiceNode(s,s.unlocked)&&!s.choices[s.unlocked]){
      const link=make('a',s.id?'回到本次计时':'继续做决定','book-continue');
      link.href='#focus';link.onclick=()=>requestAnimationFrame(()=>{const target=$('pending-choice');if(target){target.focus();target.scrollIntoView({block:'start'});}});
      b.append(link);
    }else b.append(readingNext(s.unlocked,true));
  }
  if(target)requestAnimationFrame(()=>{const row=$(target);if(row){row.focus({preventScroll:true});row.scrollIntoView();}});
}
$('book-share').onclick=e=>share(Number($('share-entry').value),e.currentTarget);
$('book-day').onchange=e=>{
  const heading=$(e.target.value);
  if(!heading)return;
  e.target.value='';
  heading.focus({preventScroll:true});
  heading.scrollIntoView({block:'start'});
};
function renderProfile(){
  const id=$('identity'),g=$('growth'),h=$('history');id.replaceChildren();g.replaceChildren();h.replaceChildren();
  const bag=$('keepsakes');bag.replaceChildren();
  $('settings').hidden=!s;if(!s){id.textContent='建立旅人后，可以在这里留偏好、看变化。';return;}
  const count=release?s.sessions.length:(s.sessions?.length??s.unlocked-s.testWindows.length),minutes=s.sessions?.reduce((sum,run)=>sum+run.minutes,0)??count*25;
  id.append(make('h2',s.nickname+' · '+s.current),make('p','出发时 '+s.type+'　真实专注 '+count+' 次 · '+minutes+' 分钟'+(allowSkip?'　测试试读 '+s.testWindows.length+' 段':'')));
  if(classic){
    id.append(make('p','现金 '+s.balance.toLocaleString()+' 元（含为下月留的 '+s.reserve.toLocaleString()+' 元）'));
    id.append(make('small',s.type.endsWith('J')?'出发时有两万元积蓄，原有作品每半月结一次授权费。':'出发时攒下两万八千元，路上的新收入靠自己接活。'));
  }else{
    const ledger=make('details'),list=make('ul');
    ledger.append(make('summary','旅费余额 '+s.balance.toLocaleString()+' 元'));
    list.append(make('li','出发时带了 2,600 元'));
    for(const row of s.ledger)list.append(make('li','第 '+row.n+' 段 · '+row.title+'　'+(row.amount>0?'+':'')+row.amount+' 元'));
    ledger.append(list);id.append(ledger);
    bag.append(make('h2','行李箱里的纪念'));
    const items=keepsakes(s);
    if(!items.length)bag.append(make('p','路上有人把东西送给你时，会在这里留一笔。','meta'));
    for(const item of items){
      const a=make('a','','souvenir');a.href='#entry-'+item.n;
      const img=make('img');img.alt='';img.src=sceneUrl(item.scene);
      const content=make('span');content.append(make('b',item.title),make('small',visibleText(s,item.detail)+' · 第 '+item.n+' 段'));
      a.append(img,content);bag.append(a);
    }
  }
  g.append(make('h2','人格变化'));const bars=make('details','','bars');
  bars.append(make('summary','查看四个维度的分数'));
  for(const axis of axes){const v=s.scores[axis],row=make('p',axis[0]+' '+v);const bar=make('progress');bar.max=100;bar.value=v;bar.setAttribute('aria-label',axis[0]+'倾向');row.append(bar,document.createTextNode((100-v)+' '+axis[1]+(v===50?' · 两边相当':'')));bars.append(row);}
  const finished=s.unlocked>=seasonLength(s);
  g.append(bars);const ul=$('prefs');ul.replaceChildren();
  pref.hidden=finished;
  $('pref-guide').textContent=finished
    ? '这趟旅程已经结束。'+(s.preferences.length?'这里留着走到季末时的偏好。':'这一路没有留下偏好。')
    : '最多留三条。旅人会参考你选的做法。遇到用得上的时候，手记下方会留一笔，附上你写的备注。';
  if(finished)$('pref-status').textContent='';
  for(const e of s.preferences){
    const li=make('li',(e.note?e.note+' · ':'')+directions[e.letter]+'　');
    if(!finished)li.append(button('移除',()=>removePreference(e.letter),'quiet'));
    ul.append(li);
  }
  h.append(make('h2','决定留下的变化'));
  const history=[...s.trace].reverse();
  if(s.edition===3)for(const key of Object.keys(s.answers)){
    const n=Number(key);
    const reason=decisionSummary(s,n);
    if(reason&&!history.some(r=>r.n===n&&r.kind==='key'))
      history.push({...s.answers[n],n,kind:'key',reason});
  }
  history.sort((a,b)=>b.n-a.n||Number(b.kind==='key')-Number(a.kind==='key'));
  for(const r of history){
    const row=make('div','','decision-note');
    row.id='decision-'+r.n+'-'+r.kind;row.tabIndex=-1;
    const a=make('a',s.edition===3?chapterTitle(r.n):'第 '+r.n+' 段');a.href='#entry-'+r.n;
    row.append(a);
    if(r.actor)row.append(make('small',visibleText(s,r.actor)));
    row.append(make('p',visibleText(s,r.reason).replaceAll('。。','。')));
    if(r.preference)row.append(make('small',(r.preferenceEffect==='改变了当时的取舍'?'你留下的偏好改变了这次决定':'这次也合了你留下的偏好')+' · '+(r.preference.note||directions[r.preference.letter])));
    if(r.axis){
      if(r.previous!==r.current)row.append(make('small','从这一次起，'+s.nickname+'的倾向由 '+r.previous+' 转为 '+r.current+'。'));
      const numbers=make('details');
      numbers.append(make('summary','看这次的分数'),make('p',r.axis[0]+'　'+r.before+' → '+r.after+'　　 '+r.axis[1]+'　'+(100-r.before)+' → '+(100-r.after)));
      row.append(numbers);
    }
    h.append(row);
  }
}
let lastProfileAnchor='';
function render(){
  if(s && $('setup-sheet').open)$('setup-sheet').close();
  const hash=location.hash.slice(1), book=hash==='book'||/^entry-\d+$/.test(hash);
  const profile=hash==='profile'||hash==='preferences'||/^decision-\d+-(daily|key)$/.test(hash);
  const view=book?'book':profile?'profile':'focus';
  for(const v of ['focus','profile','book']){
    $(v).hidden=view!==v;const link=document.querySelector('nav a[href="#'+v+'"]');
    if(v===view)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  if(view==='focus')renderFocus();
  if(view==='profile'){
    renderProfile();
    $('back-to-story').hidden=hash==='profile'||!s;
    const target=hash==='preferences'?(pref.hidden?$('prefs-title'):pref.elements.letter):hash.startsWith('decision-')?$(hash):null;
    if(s&&target&&lastProfileAnchor!==hash)requestAnimationFrame(()=>{
      target.focus({preventScroll:true});target.scrollIntoView({block:'center'});
    });
    if(s)lastProfileAnchor=hash;
  }else lastProfileAnchor='';
  if(book)renderBook(hash.startsWith('entry-')?hash:null);
  tick();
}
function tick(){
  if(!s?.id)return;
  const left=s.deadline===null?s.remaining:Math.max(0,s.deadline-Date.now());
  const e=$('timer'),seconds=Math.ceil(Math.min((s.minutes??25)*60000,left)/1000);
  if(e){
    $('clock-progress').style.transform='scaleX('+Math.min(1,left/((s.minutes??25)*60000))+')';
    e.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  }
  if(s.deadline!==null && left===0 && !settling && !storageBlocked){settling=true;act({kind:'settle'}).then(()=>{settling=false;});}
}
const guideSheet=$('guide-sheet');
$('open-guide').onclick=()=>guideSheet.showModal();
$('close-guide').onclick=()=>guideSheet.close();
const setupSheet=$('setup-sheet');
$('depart').onclick=()=>{
  if(s){
    if(s.unlocked===seasonLength(s)){location.hash='book';return;}
    const choice=$('pending-choice');
    if(choice){choice.focus();choice.scrollIntoView({block:'start'});return;}
    timerAction('start');return;
  }
  $('setup-status').textContent='';
  setupSheet.showModal();
  $('setup-title').focus();
};
$('close-setup').onclick=()=>setupSheet.close();
function createJourney(startClock){
  const data=Object.fromEntries(new FormData(setup));
  return act({kind:'create',...data,id:startClock?sessionId():null,minutes:nextMinutes,edition,
    ...(release?{}:{mode:preview?'preview':'focus'})});
}
setup.onsubmit=e=>{e.preventDefault();createJourney(true);};
$('read-prologue').onclick=()=>createJourney(false).then(()=>{
  if(s&&!s.id&&!s.unlocked)$('intro').scrollIntoView({block:'start'});
});
function removePreference(letter){
  access({kind:'pref',letter,remove:true}).then(()=>{
    if(s.unlocked<seasonLength(s)&&!s.preferences.some(p=>p.letter===letter))$('pref-status').textContent='这条偏好已移除。';
  }).catch(storageError);
}
pref.onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(pref));
  if(s.unlocked>=seasonLength(s))return;
  if(s.preferences.length===3&&!s.preferences.some(p=>axes.some(a=>a.includes(p.letter)&&a.includes(data.letter)))){$('pref-status').textContent='已保留三条偏好，请先移除一条。';return;}
  access({kind:'pref',...data}).then(()=>{
    if(s&&s.unlocked<seasonLength(s)&&s.preferences.some(p=>p.letter===data.letter&&p.note===String(data.note).trim())){
      $('pref-status').textContent='记下了。从下一段起，旅人遇到相关的事就会参考这个做法。';
    }
  }).catch(storageError);};
$('rename').onsubmit=e=>{e.preventDefault();act({kind:'rename',nickname:new FormData(e.target).get('nickname')});};
window.onhashchange=render;
function refresh(){if(db||inMiniTool)access().catch(storageError);}
if(channel)channel.onmessage=refresh;
window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
if(inMiniTool)refresh();
else {
const opening=indexedDB.open('parallel-life-season-south-v1',1);
opening.onupgradeneeded=()=>opening.result.createObjectStore('journeys');
opening.onsuccess=()=>{
  db=opening.result;refresh();
  const prior=db.transaction('journeys').objectStore('journeys').getAllKeys();
  prior.onsuccess=()=>previousLinks(key=>prior.result.includes(key));
};opening.onerror=()=>error(opening.error);
}
setInterval(tick,500);
