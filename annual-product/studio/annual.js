import {sceneFor,sceneUrl,drawCard} from '/annual-share.mjs';
import {totalWindows,types,nextFocus,displayName,storyText,directions,axes} from '/annual-state.mjs';

const el=id=>document.getElementById(id);
const phases=['setup','focus','reading','archive','traveler'];
let retryAction;
let db, state=null, mode='setup', selected=0, generation=0, book, bookKey, journeyRequest, journeyKey;
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('annual-journey-v1'):null;
for(const type of types)el('mbti').add(new Option(type,type));

function openSave(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('parallel-life-annual-v1',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('journey');
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

// All tabs serialize changes through this store. Unlocking and clearing the timer
// are a single commit, including when a suspended page returns after the deadline.
function transact(action){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('journey','readwrite');
    const store=tx.objectStore('journey'), req=store.get('current');
    let next, changed=false, advanced=false;
    req.onsuccess=()=>{
      const previous=req.result??null;
      next=nextFocus(previous,action,Date.now());
      changed=next!==previous;
      advanced=next && next.unlocked>(previous?.unlocked??0);
      if(changed)store.put(next,'current');
    };
    tx.oncomplete=()=>resolve({next,changed,advanced});
    tx.onabort=()=>reject(tx.error??new Error('本地存档未写入'));
  });
}
function status(text){el('status').textContent=text;}
function retryWith(message, action){
  status(message);
  retryAction=action;
  el('retry').hidden=false;
}
function show(name){
  if(el('share-dialog').open)el('share-dialog').close();
  if(name!=='reading')el('scene-art').src=sceneUrl(name==='traveler'?'room':'journey');
  mode=name;for(const p of phases)el(p).hidden=p!==name;
  const tab=name==='reading'||name==='archive'?'history':name==='traveler'?'traveler-nav':'home';
  for(const id of ['home','history','traveler-nav']){
    if(id===tab)el(id).setAttribute('aria-current','page');
    else el(id).removeAttribute('aria-current');
  }
  document.body.dataset.mode=name;
}
function clock(){
  if(!state||mode!=='focus')return;
  const ms=state.deadline===null?state.remaining:Math.max(0,state.deadline-Date.now());
  const seconds=Math.ceil(ms/1000);
  const label=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  el('timer').textContent=label;
  document.title=state.id?label+' · 平行人生':'平行人生 · 旅居番茄钟';
}
function journeySignature(){
  return JSON.stringify([state.type,(state.preferences??[]).map(({letter,from})=>({letter,from}))]);
}
function loadJourney(){
  const key=journeySignature();
  if(key===journeyKey && journeyRequest)return journeyRequest;
  journeyKey=key;
  const [type,preferences]=JSON.parse(key);
  journeyRequest=fetch('/api/v1/annual/'+type+'/journey',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(preferences)})
    .then(response=>{
      if(!response.ok)throw new Error('未能读取旅人成长记录');
      return response.json();
    }).catch(error=>{
      if(journeyKey===key)journeyRequest=null;
      throw error;
    });
  return journeyRequest;
}
async function loadBook(){
  const key=journeySignature();
  if(book && bookKey===key)return book;
  let cards;
  if(state.preferences?.length){
    cards=(await loadJourney()).cards;
  }else{
    const response=await fetch('/api/v1/annual/'+state.type);
    if(!response.ok)throw new Error('未能读取年度正文');
    cards=await response.json();
  }
  if(key===journeySignature()){book=cards;bookKey=key;}
  return cards;
}
function paragraph(text,cls){
  const p=document.createElement('p');p.className=cls;p.textContent=text;return p;
}
function eventText(e){return storyText(e.text,state);}
function windowLabel(n){
  if(state.testWindows?.includes(n))return '第 '+n+' 段 · 测试试读';
  if(state.testWindows?.[0]<n)return '第 '+n+' 段 · 专注完成';
  return '第 '+n+' 次专注';
}
async function read(n){
  if(!state||n<1||n>state.unlocked)return;
  const revision=++generation;selected=n;show('reading');
  el('reading-title').textContent=windowLabel(n);el('prose').replaceChildren();
  el('date').textContent='';el('account').hidden=true;el('account').open=false;el('copytext').hidden=true;
  el('share-card').disabled=true;el('copy').disabled=true;el('again').hidden=!!state.id||state.unlocked===totalWindows;
  el('test-next').hidden=el('again').hidden||n!==state.unlocked;
  document.title=windowLabel(n)+' · 平行人生';
  try{
    const cards=await loadBook();if(revision!==generation||mode!=='reading')return;
    el('scene-art').src=sceneUrl(sceneFor(cards,n-1));
    const w=cards[n-1];el('date').textContent=w.from+' 至 '+w.until.slice(w.from.slice(0,10)===w.until.slice(0,10)?11:5)+' · 北京时间';
    let day=w.from.slice(0,10);
    for(const e of w.events){
      if(e.at.slice(0,10)!==day){
        el('prose').append(paragraph('次晨　·　睡眠 8 小时已跳过','night'));day=e.at.slice(0,10);
      }
      el('prose').append(paragraph(e.at.slice(11)+'　'+e.city,'mark'),paragraph(eventText(e),'body'));
    }
    el('balance').textContent=[...w.account.items,'余额 '+w.account.cash.toLocaleString('zh-CN')+' 元'].join('　');
    el('account').hidden=false;el('copy').disabled=false;el('share-card').disabled=false;el('retry').hidden=true;
  }catch{if(revision===generation){retryWith('正文暂时没有打开。已解锁的故事仍在存档里。',()=>read(n));}}
}
function showFocus(){
  show('focus');
  el('focus-title').textContent=state.id?(state.deadline===null?'专注已暂停':'正在专注'):'准备好再出发';
  el('focus-note').textContent='完成这一轮，'+displayName(state)+'将走过 3 小时 20 分钟，留下第 '+(state.unlocked+1)+' 段故事。';
  el('main-action').textContent=state.id?(state.deadline===null?'继续专注':'暂停专注'):'开始专注';
  const finished=state.unlocked===totalWindows;
  el('main-action').hidden=el('test-focus').hidden=finished;
  el('timer').hidden=finished;
  if(finished){
    el('focus-title').textContent='这一年的旅程已读完';
    el('focus-note').textContent='所有故事都已收入旅途手记。';
  }
  el('latest-story').hidden=!state.unlocked;
  el('latest-story').href='#story/'+state.unlocked;
  el('cancel').hidden=!state.id;clock();
}
function defaultRoute(){
  return state?.unlocked&&!state.id?'#story/'+state.unlocked:'#focus';
}
function renderRoute(){
  generation++;el('retry').hidden=true;status('');
  let route=location.hash||defaultRoute();
  const match=/^#story\/(\d+)$/.exec(route);
  if(match&&Number(match[1])>=1&&Number(match[1])<=state?.unlocked){void read(Number(match[1]));return;}
  if(route==='#journal'){void openArchive();return;}
  if(route==='#traveler'){openProfile();return;}
  if(route!=='#focus'){
    route=defaultRoute();history.replaceState(null,'',route);
    if(route!=='#focus'){void read(state.unlocked);return;}
  }
  if(state)showFocus();else{show('setup');document.title='平行人生 · 北京出发';}
}
let ready=false;
window.addEventListener('hashchange',()=>{
  if(!ready)return;
  renderRoute();window.scrollTo(0,0);
});
function updateHeader(){
  if(!state)return;
  el('volume').textContent=state.type+'　/　'+displayName(state)+'的旅程';
  const tested=state.testWindows?.length??0;
  el('foot').textContent=tested?'已完成 '+(state.unlocked-tested)+' 次专注 · 测试试读 '+tested+' 段'
    :'已完成 '+state.unlocked+' / '+totalWindows+' 次专注';
}
async function dispatch(action,force=false){
  try{
    const {next,changed,advanced}=await transact(action);
    const earned=advanced||(state&&next&&next.unlocked>state.unlocked);
    const differs=JSON.stringify(next)!==JSON.stringify(state);
    state=next;
    if(changed)channel?.postMessage('saved');
    if(!force&&!differs&&!changed)return;

    ready=true;
    updateHeader();
    if(earned||['create','start','cancel','pause','resume'].includes(action.kind)){
      history.replaceState(null,'',earned?'#story/'+state.unlocked:defaultRoute());
    }
    renderRoute();
    if(earned&&!document.hidden){
      el('reading-title').focus();
      status(next.testWindows?.includes(next.unlocked)?'本段已记为测试试读。':'专注完成，已解锁第 '+next.unlocked+' 段故事。');
    }
  }catch{
    retryWith('无法保存或读取旅程，请检查浏览器的本地存储权限。',()=>dispatch(action,true));
  }
}
function start(){return dispatch({kind:'start',id:crypto.randomUUID(),unlocked:state.unlocked});}
function updateSetup(){
  const gender=el('gender').value, nickname=el('nickname').value;
  el('nickname').placeholder=displayName({gender});
  el('hero-name').textContent=displayName({gender,nickname});
}
el('gender').onchange=updateSetup;
el('nickname').oninput=updateSetup;
el('depart').onsubmit=e=>{
  e.preventDefault();
  void dispatch({kind:'create',id:crypto.randomUUID(),type:el('mbti').value,gender:el('gender').value,
    nickname:el('nickname').value,preview:e.submitter===el('test-depart')});
};
function skip(e){
  if(state && e.detail<=1)void dispatch({kind:'skip',unlocked:state.unlocked,id:state.id});
}
el('test-focus').onclick=skip;
el('test-next').onclick=skip;
el('edit-name').onclick=()=>{
  el('saved-name').value=displayName(state);
  el('profile-dialog').showModal();el('saved-name').select();
};
el('close-name').onclick=()=>el('profile-dialog').close();
el('profile-form').onsubmit=e=>{
  e.preventDefault();
  el('profile-dialog').close();
  void dispatch({kind:'rename',nickname:el('saved-name').value});
};
el('main-action').onclick=()=>state.id?dispatch({kind:state.deadline===null?'resume':'pause',id:state.id}):start();
el('again').onclick=start;
el('cancel').onclick=()=>dispatch({kind:'cancel',id:state.id});
const pageSize=6;
let pageIndex=0;
async function openArchive(){
  show('archive');document.title='旅途手记 · 平行人生';
  const limit=state?.unlocked??0, revision=generation;
  el('archive-note').hidden=!!limit;
  el('archive-note').textContent=limit?'':'完成第一次专注后，你的故事会收在这里。';
  el('journal-index').open=false;
  el('archive-empty').hidden=!!limit;el('library').hidden=true;
  if(!limit)return;
  try{
    const cards=await loadBook();
    if(revision!==generation||mode!=='archive')return;
    const months=[...new Set(cards.slice(0,limit).map(w=>w.from.slice(0,7)))].reverse();
    const month=el('month').value;
    el('month').replaceChildren(new Option('全部月份',''),...months.map(m=>new Option(m.replace('-',' 年 ')+' 月',m)));
    el('month').value=months.includes(month)?month:'';
    el('saved').max=limit;el('saved').value='';
    renderJournal(cards.slice(0,limit));
    el('library').hidden=false;
  }catch{if(revision===generation)retryWith('手记暂时没有打开。',()=>void renderRoute());}
}
function renderJournal(cards){
  const pages=document.createDocumentFragment();
  const dates=document.createDocumentFragment();
  dates.append(new Option('选择日期',''));
  let lastDate='', chapter;
  for(const card of cards){
    for(const event of card.events){
      const date=event.at.slice(0,10);
      if(date!==lastDate){
        const [year,month,day]=date.split('-');
        const caption=Number(month)+'月'+Number(day)+'日';
        chapter=document.createElement('section');
        const heading=document.createElement('h2');
        heading.id='journal-'+date;
        heading.tabIndex=-1;
        heading.textContent=caption+' · '+event.city;
        chapter.append(heading);
        pages.append(chapter);
        dates.append(new Option(year+'年'+heading.textContent,date));
        lastDate=date;
      }
      for(const line of eventText(event).split(/\r?\n/)){
        if(line.trim())chapter.append(paragraph(line.trim(),'journal-paragraph'));
      }
    }
  }
  el('journal-day').replaceChildren(dates);
  el('journal-day-label').hidden=el('journal-day').options.length<=2;
  el('journal-prose').replaceChildren(pages);
}
el('journal-day').onchange=()=>{
  const heading=el('journal-'+el('journal-day').value);
  if(!heading)return;
  el('journal-index').open=false;
  el('journal-day').value='';
  heading.focus();
  heading.scrollIntoView({block:'start'});
};
el('journal-index').ontoggle=()=>{
  if(el('journal-index').open && mode==='archive' && book)renderEntries();
};
function renderEntries(){
  const month=el('month').value, kind=el('kind').value, tests=new Set(state.testWindows??[]);
  const entries=book.slice(0,state.unlocked).filter(w=>w.from.startsWith(month)&&
    (!kind||tests.has(w.number)===(kind==='test'))).reverse();
  const pages=Math.ceil(entries.length/pageSize);
  pageIndex=Math.max(0,Math.min(pageIndex,pages-1));
  const rows=entries.slice(pageIndex*pageSize,(pageIndex+1)*pageSize);
  el('entries').replaceChildren(...rows.map(w=>{
    const li=document.createElement('li'), link=document.createElement('a'), image=document.createElement('img');
    link.href='#story/'+w.number;image.src=sceneUrl(sceneFor(book,w.number-1));image.alt='';image.loading='lazy';
    const copy=document.createElement('div');
    copy.append(paragraph(windowLabel(w.number),'entry-label'),paragraph(eventText(w.events[0]),'excerpt'),
      paragraph(w.from.slice(0,10)+' · '+[...new Set(w.events.map(e=>e.city))].join(' / '),'entry-date'));
    link.append(image,copy);li.append(link);return li;
  }));
  el('list-info').textContent=pages?'共 '+entries.length+' 段 · 第 '+(pageIndex+1)+' / '+pages+' 页':'这个分类还没有故事。';
  el('prev').disabled=pageIndex===0;el('next').disabled=pageIndex+1>=pages;
  el('prev').parentElement.hidden=pages<=1;
}
for(const id of ['month','kind'])el(id).onchange=()=>{pageIndex=0;renderEntries();};
el('prev').onclick=()=>{pageIndex--;renderEntries();};
el('next').onclick=()=>{pageIndex++;renderEntries();};
el('jump').onsubmit=e=>{e.preventDefault();location.hash='#story/'+Number(el('saved').value);};
for(const [letter,label] of Object.entries(directions))el('direction').add(new Option(label,letter));
el('preference-form').onsubmit=async e=>{
  e.preventDefault();
  const letter=el('direction').value, note=el('preference-note').value.trim();
  const last=state.preferences?.findLast(p=>axes.some(pair=>pair.includes(letter)&&pair.includes(p.letter)));
  if(last?.letter===letter && last.note===note){status('这条偏好已经生效。');return;}
  await dispatch({kind:'preference',letter,note});
  if(mode==='traveler' && state.preferences?.some(p=>p.from===state.unlocked+1 && p.letter===letter && p.note===note)){
    el('preference-form').reset();status('偏好已保存，从第 '+(state.unlocked+1)+' 段起生效。');
  }
};
function preferenceName(p){return p.note?p.note+'（'+directions[p.letter]+'）':directions[p.letter];}
const traitNames={I:'内向',E:'外向',S:'实感',N:'直觉',T:'思考',F:'情感',J:'计划',P:'灵活'};
async function showGrowth(){
  const revision=generation, history=state.preferences??[], limit=state.unlocked;
  el('growth-summary').textContent='读取旅途经历中…';
  for(const id of ['growth-axes','preferences','decisions','decision-older'])el(id).replaceChildren();
  el('decision-note').textContent='';
  el('decision-filter-label').hidden=true;
  el('preference-form').hidden=limit===totalWindows;
  try{
    const [journey,cards]=await Promise.all([loadJourney(),loadBook()]);
    if(revision!==generation || mode!=='traveler')return;
    const changes=journey.changes.filter(c=>c.number<=limit);
    const current={...journey.initial};
    for(const c of changes)current[c.axis]=c.after;
    const type=axes.map(([left,right])=>current[right]===50?(state.type.includes(left)?left:right):current[right]>50?right:left).join('');
    el('growth-summary').textContent='出发时 '+state.type+'　·　当前倾向 '+type;
    for(const [left,right] of axes){
      const initial=journey.initial[right], value=current[right], delta=value-initial;
      const li=document.createElement('li'), labels=document.createElement('div');
      labels.className='trait-labels';
      const leftScore=document.createElement('span'), rightScore=document.createElement('span');
      leftScore.textContent=left+' '+traitNames[left]+' '+(100-value);
      rightScore.textContent=right+' '+traitNames[right]+' '+value;
      labels.append(leftScore,rightScore);
      const bar=document.createElement('meter');
      bar.min=0;bar.max=100;bar.value=100-value;
      bar.setAttribute('aria-hidden','true');
      const shift=delta?'向 '+(delta>0?right:left)+' 移动 '+Math.abs(delta)+' 分':'与出发时相同';
      li.append(labels,bar,paragraph('出发时 '+left+' '+(100-initial)+' / '+right+' '+initial+' · '+shift,'trait-start'));
      el('growth-axes').append(li);
    }
    const filter=el('decision-filter'), previous=filter.value;
    filter.replaceChildren(new Option('全部决定',''));
    const key=p=>p.from+'-'+p.letter;
    for(const [index,p] of history.entries()){
      const axis=axes.find(pair=>pair.includes(p.letter));
      const successor=history.slice(index+1).find(later=>axis.includes(later.letter));
      const period=successor?'第 '+p.from+' 至 '+(successor.from-1)+' 段':'第 '+p.from+' 段起';
      const hits=changes.filter(c=>c.influence && key(c.influence)===key(p));
      const li=document.createElement('li');
      li.textContent=preferenceName(p)+' · '+period+' · '+(hits.length?'已用于 '+hits.length+' 次决定':'尚无已揭晓的决定使用这条偏好');
      el('preferences').append(li);
      filter.add(new Option('第 '+p.from+' 段起 · '+preferenceName(p),key(p)));
    }
    filter.value=[...filter.options].some(o=>o.value===previous)?previous:'';
    el('decision-filter-label').hidden=!history.length;
    function renderDecisions(){
      const list=el('decisions');list.replaceChildren();
      const rows=changes.filter(c=>!filter.value || (c.influence && key(c.influence)===filter.value));
      el('decision-note').textContent=rows.length?'':filter.value?'这条偏好还没有已揭晓的决定。':'等旅人经历第一次性格变化，这里就会记下当时的事。';
      const earlier=document.createElement('details'), more=document.createElement('summary');
      const olderList=document.createElement('ol');
      earlier.id='earlier-decisions';
      more.textContent='查看更早的 '+Math.max(0,rows.length-4)+' 次决定';
      earlier.append(more,olderList);
      el('decision-older').replaceChildren();
      for(const [index,c] of rows.toReversed().entries()){
        const event=cards[c.number-1].events.find(e=>e.id===c.source);
        const li=document.createElement('li'),link=document.createElement('a');
        const influence=c.influence, delta=c.after-c.before;
        const toward=delta===0?influence?.chosen??c.axis:delta>0?c.axis:axes.find(pair=>pair[1]===c.axis)[0];
        const before=toward===c.axis?c.before:100-c.before;
        const after=toward===c.axis?c.after:100-c.after;
        if(influence){
          const p=history.find(pref=>key(pref)===key(influence));
          li.append(paragraph(influence.title+' · '+preferenceName(p),''));
          li.append(paragraph(influence.chosen===influence.natural?'这次考虑了偏好，和原来的倾向一致。':'这条偏好改变了决定。原先更倾向「'+directions[influence.natural]+'」。','intro'));
        }
        li.append(paragraph(eventText(event),''));
        li.append(paragraph(toward+' '+traitNames[toward]+' '+before+' → '+after+'（'+(delta?'+'+Math.abs(delta)+' 分':'0 分')+'）','trait-change'));
        li.append(paragraph(delta?'这次经历后，更倾向「'+directions[toward]+'」。':'这一侧的倾向已到上限，本次保持原状。','intro'));
        link.href='#story/'+c.number;link.textContent=c.at+' · 回看第 '+c.number+' 段';li.append(link);(index<4?list:olderList).append(li);
      }
      if(rows.length>4)el('decision-older').append(earlier);
    }
    filter.onchange=renderDecisions;renderDecisions();
  }catch{
    if(revision===generation){el('growth-summary').textContent='暂时无法读取人格变化。';retryWith('请重试读取旅人成长记录。',showGrowth);}
  }
}
function openProfile(){
  show('traveler');document.title='旅人档案 · 平行人生';
  el('profile-content').hidden=!state;el('profile-empty').hidden=!!state;
  if(!state)return;
  const tests=state.testWindows?.length??0, count=state.unlocked-tests;
  void showGrowth();
  el('profile-name').textContent=displayName(state);
  el('identity-line').textContent='北京出发 · '+state.gender+' · 初始人格 '+state.type;
  el('focus-count').textContent=count+' 次';el('focus-time').textContent=(count*25).toLocaleString('zh-CN')+' 分钟';
  el('test-count').textContent=tests+' 段';el('year-progress').max=totalWindows;
  el('year-progress').value=state.unlocked;el('progress-number').textContent=state.unlocked+' / '+totalWindows+' 段';
  el('last-entry').textContent=state.id?(state.deadline===null?'本次专注已暂停。':'本次专注正在计时。'):'';
}
el('copy').onclick=async()=>{
  const w=book[selected-1], text=[displayName(state)+'的旅程 · '+state.type+' · '+windowLabel(selected),...w.events.map(e=>e.at+' · '+e.city+'\n'+eventText(e))].join('\n\n');
  try{await navigator.clipboard.writeText(text);status('已复制这段故事。');}
  catch{el('copytext').hidden=false;el('copytext').value=text;el('copytext').focus();el('copytext').select();status('可以手动复制选中的正文。');}
};
let shareFile, shareVersion=0;
el('share-close').onclick=()=>el('share-dialog').close();
el('share-dialog').onclose=()=>{shareVersion++;shareFile=null;el('share-preview').removeAttribute('src');el('save-picture').removeAttribute('href');};
el('share-card').onclick=async()=>{
  const revision=++shareVersion, w=book[selected-1], filename='平行人生-'+state.type+'-'+selected+'.png';
  const dialog=el('share-dialog'), preview=el('share-preview'), save=el('save-picture'), send=el('send-picture');
  preview.hidden=save.hidden=send.hidden=true;
  el('share-message').textContent='正在排版…';dialog.showModal();
  try{
    const canvas=await drawCard({scene:sceneFor(book,selected-1),events:w.events.map(e=>({...e,text:eventText(e)})),
      name:displayName(state),type:state.type,label:windowLabel(selected)});
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(revision!==shareVersion||!dialog.open)return;
    if(!blob)throw new Error('未生成图片');
    shareFile=new File([blob],filename,{type:'image/png'});
    preview.src=canvas.toDataURL('image/png');save.href=preview.src;save.download=filename;
    preview.hidden=save.hidden=false;
    send.hidden=!navigator.canShare?.({files:[shareFile]});
    el('share-message').textContent='';
  }catch{if(revision===shareVersion)el('share-message').textContent='分享图未生成。请关闭后重试，也可以复制正文。';}
};
el('send-picture').onclick=async()=>{
  if(!shareFile)return;
  try{await navigator.share({files:[shareFile]});}
  catch(error){if(error.name!=='AbortError')el('share-message').textContent='系统分享暂不可用，可以保存图片。';}
};
async function boot(){
  try{db??=await openSave();status('');await dispatch({kind:'settle'},true);}
  catch{retryWith('无法打开本地存档，请允许本站使用浏览器存储。',boot);}
}
el('retry').onclick=()=>{
  status('');
  el('retry').hidden=true;
  void retryAction?.();
};
function refresh(){if(db)void dispatch({kind:'settle'});}
if(channel)channel.onmessage=refresh;
window.addEventListener('focus',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&db)void dispatch({kind:'settle'});});
window.addEventListener('pageshow',refresh);
window.setInterval(()=>{if(state?.deadline && Date.now()>=state.deadline)void dispatch({kind:'settle',id:state.id});else clock();},250);
await boot();
