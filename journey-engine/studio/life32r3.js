const $=q=>document.querySelector(q),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),json=x=>`<pre>${esc(JSON.stringify(x,null,2))}</pre>`;
const journeyMode=new URLSearchParams(location.search).get('mode')==='journey';
const presets=()=>journeyMode?s.boot.journeyPresets:s.boot.presets;
if(journeyMode){
  document.title='LifeSim Studio · 持续旅途';
  $('.rail-label').textContent='M3.3 / 持续旅途';
  $('.rail-note').hidden=true;
  $('footer').textContent='LifeSim Studio / M3.3 持续旅途';
}
const s={id:null,view:null,boot:null,page:'run',job:null,sequence:null,minutes:25,rate:8,draft:null,actor:0},base='/api/v1/life32r3';let epoch=0,proofEpoch=0,loadEpoch=0;
async function api(p,body){const r=await fetch(base+p,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)}),v=await r.json();if(!r.ok)throw Error(v.error?.message??'请求失败');return v;}
const c=()=>s.view.experiment.config,person=id=>c().people.find(p=>p.id===id)?.name??id,place=id=>c().worlds[0].places.find(p=>p.id===id)?.name??id,date=t=>new Date((t+(s.view?.experiment.config.worlds[0].timezoneOffsetMinutes??480))*60000).toISOString().slice(5,16).replace('T',' '),money=n=>'¥'+(n/100).toLocaleString('zh-CN'),refs=ids=>ids.map(id=>`<button data-ref="${esc(id)}">${esc(id)}</button>`).join(' ');
function notice(t,error=false){$('#notice').hidden=false;$('#notice').textContent=t;$('#notice').className=error?'error':'';}
let focusTimer=null,clockOffset=0,clockBusy=false,retryAfter=0;
const clockChannel=journeyMode && typeof BroadcastChannel!=='undefined'?new BroadcastChannel('journey-focus'):null;
function rememberJourney(id){
  const url=new URL(location.href);url.searchParams.set('run',id);history.replaceState(null,'',url);
  localStorage.setItem('journey-last-run',id);
}
function installTimer(packet){
  focusTimer=packet.timer?.status==='running'?packet.timer:null;clockOffset=packet.now-Date.now();
  if(focusTimer){s.minutes=focusTimer.realMinutes;s.rate=focusTimer.rate;}
}
function remaining(){
  return focusTimer?Math.max(0,Math.ceil((focusTimer.until-clockOffset-Date.now())/1000)):s.minutes*60;
}
function timeText(){
  const seconds=remaining();return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}
function focusControls(){
  const locked=focusTimer||s.job?'disabled':'';
  return `<section class="panel"><h2>专注计时</h2><div class="controls">
    <label>专注时长<select id="focus-minutes" ${locked}>${[25,50].map(n=>'<option '+(s.minutes===n?'selected':'')+' value="'+n+'">'+n+' 分钟</option>').join('')}</select></label>
    <label>倍率<select id="rate" ${locked}>${[8,6].map(n=>'<option '+(s.rate===n?'selected':'')+' value="'+n+'">1:'+n+'</option>').join('')}</select></label>
    <strong id="time-left" role="timer" aria-live="off">${timeText()}</strong>
    ${focusTimer?'<button id="stop-clock">取消本次专注</button>':'<button id="start-clock" class="primary" '+locked+'>开始专注</button>'}</div>
    <details><summary>研发工具</summary><div class="controls">${[['focus','快进一窗'],['day','运行一天'],['week','连续七天'],['verify','完整重放核验']].map(([mode,label])=>'<button data-run="'+mode+'" '+locked+'>'+label+'</button>').join('')}</div></details></section>`;
}
async function clockCommand(action){
  if(clockBusy || !s.id || (action!=='start' && focusTimer?.experiment!==s.id))return;
  const id=s.id,timerId=action==='start'?crypto.randomUUID():focusTimer.id;
  clockBusy=true;
  try{
    const packet=await api('/experiments/'+id+'/timer',{action,id:timerId,realMinutes:s.minutes,rate:s.rate});
    clockChannel?.postMessage({id,sequence:action==='finish'?packet.timer.sequence:null});
    if(s.id!==id)return;
    installTimer(packet);
    if(action==='finish'){s.sequence=packet.timer.sequence;s.page='stories';}
    $('#notice').hidden=true;await load();
  }catch(error){
    retryAfter=Date.now()+5000;
    if(s.id===id){
      try{
        const saved=(await api('/experiments/'+id+'/timer')).timer;
        if(s.id!==id)return;
        const expected={start:'running',cancel:'cancelled',finish:'completed'}[action];
        if(saved?.id===timerId && saved.status===expected){
          if(action==='finish'){s.page='stories';s.sequence=saved.sequence;}
          await load();return;
        }
        await load();
      }catch{/* Retry with the same timer id when the service returns. */}
      notice(error.message,true);
    }
  }finally{clockBusy=false;}
}
if(journeyMode){
  setInterval(()=>{if(!focusTimer || focusTimer.experiment!==s.id)return;
    if($('#time-left'))$('#time-left').textContent=timeText();
    if(remaining()===0 && Date.now()>=retryAfter)void clockCommand('finish');
  },500);
  if(clockChannel)clockChannel.onmessage=event=>{
    if(event.data?.id!==s.id || clockBusy)return;
    if(event.data.sequence){s.sequence=event.data.sequence;s.page='stories';}
    void load().catch(e=>notice(e.message,true));
  };
}
async function list(){const r=await api('/experiments');s.experiments=r.items.filter(e=>Boolean(e.journey)===journeyMode);$('#experiment-select').innerHTML=s.experiments.map(e=>`<option value="${e.id}">${esc(e.name)} · v${e.version}</option>`).join('');if(journeyMode && !s.id){const remembered=new URL(location.href).searchParams.get('run')??localStorage.getItem('journey-last-run');s.id=s.experiments.find(e=>e.id===remembered)?.id??null;}s.id??=s.experiments[0]?.id??null;if(s.id)$('#experiment-select').value=s.id;}
async function load(){const token=++loadEpoch,id=s.id;++epoch;++proofEpoch;$('#inspector').hidden=true;if(id){const [view,timer]=await Promise.all([api('/experiments/'+id+(journeyMode?'?view=hero':'')),journeyMode?api('/experiments/'+id+'/timer'):null]);if(token!==loadEpoch||id!==s.id)return;if(timer){installTimer(timer);rememberJourney(id);}s.view=view;$('#experiment-meta').textContent=`${journeyMode?'M3.3 持续旅途':view.experiment.config.rules.continuity?'M3.2 第三轮':'M3.2 第二轮对照'} · ${date(view.state.time)} · ${view.experiment.engine}`;const job=view.jobs.find(j=>['running','queued'].includes(j.status));if(job&&!s.job){s.job=job;void poll();}}await render();}
const names={run:['生活现场','从实际后果，走向下一步生活。'],config:['人物与世界','选择一种生活，保留每次实验。'],events:['机会与决策','每次邀请和选择，都有来处。'],stories:['连续故事','读完这一段，再看它的依据。'],metrics:['体验停滞','重复可以发生，停滞必须看见。'],board:['机制与边界','工程事实与阅读体验，分别验收。']};
async function go(page){s.page=page;await render();}
async function render(){const token=++epoch,id=s.id;++proofEpoch;$('#inspector').hidden=true;const current=()=>token===epoch&&id===s.id;$('#breadcrumb').textContent=names[s.page][0];$('#page-title').textContent=journeyMode&&s.page==='run'?'人物与旅程':names[s.page][1];$('#page-description').textContent=journeyMode?(s.page==='stories'?'':'查看主角的所在地、最近经历和属性变化。'):'独立version32 / round3 · 已提交事实生成受控文字 · HUMAN_PENDING / LLM_NOT_RUN';document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===s.page));
 if(s.page==='config'){form();return;}if(s.page==='board'&&journeyMode){$('#content').innerHTML='<section class="panel"><h2>持续旅途</h2><p>各地会产生可以继续处理的事务。人物根据当前位置、体力、兴趣和实际开支安排行动。点击属性变化旁的记录编号可以查看来源。</p></section>';return;}if(s.page==='board'){$('#content').innerHTML='<section class="panel"><h2>第三轮实际机制</h2><p>增加未来四小时的连续行程、可中断的承诺、岗位责任与节水养护发展。发展来自实际值班、照料、付费材料和后续生长；免费自学不产生工资。</p><p>人物独立占用时间，资金和移动交由M1执行。计划在行动片段之间暂停与恢复。重复的工作、养护和同主题作品不会因为换ID而算新信息。</p><p class="pending">不是开放世界已完成。多个场所仍是受控实验环境；场景入口记录真实地点与可用时段，路人身份接口保留，未自动生成路人剧情。现阶段没有完整职业/住房/城市生态；正式M4未接入，故事质量HUMAN_PENDING。</p></section>';return;}
 if(!s.view){$('#content').innerHTML='<section class="panel">请先创建实验。</section>';return;}
 if(s.page==='run'||s.page==='stories'){
  const cards=c().people.filter(p=>!journeyMode || p.id===c().hero).map(p=>{const w=s.view.state.worlds[p.id],profile=s.view.state.journey?.profiles[p.id];return `<article class="actor-card"><strong>${esc(p.name)} · ${p.role==='hero'?'主角':'自主NPC'}</strong><span>${p.gender==='male'?'男':'女'} · ${p.age}岁 · ${esc(p.direction)}</span><span class="money">${money(w.cashCents)}</span><span>${esc(place(w.locationId))} · ${w.sleeping?'睡眠中':w.inProgress?'行动中':'待安排'}</span><p>兴趣：${esc(p.interests.join('、'))}</p>${profile?'<p>'+Object.entries(profile.values).map(([key,value])=>esc(s.boot.attributeLabels[key])+' '+esc(value)).join(' · ')+'</p>':''}${profile?.personality?personalityHtml(p.personality,profile.personality.values):''}</article>`;}).join('');
  $('#content').innerHTML=(journeyMode && s.page==='run'?`<div class="grid3">${cards}</div>${focusControls()}`:s.page==='run'?`<div class="grid3">${cards}</div><section class="panel"><h2>推进生活</h2><div class="controls">${journeyMode?'<label>专注时长<select id="focus-minutes">'+[25,50].map(n=>'<option value="'+n+'" '+(s.minutes===n?'selected':'')+'>'+n+' 分钟</option>').join('')+'</select></label>':''}<label>倍率<select id="rate"><option value="8" ${s.rate===8?'selected':''}>1:8</option><option value="6" ${s.rate===6?'selected':''}>1:6</option></select></label>${[['focus',journeyMode?'完成一次专注':'运行25分钟专注'],['day','运行一天'],['week','连续七天'],['verify','完整重放核验']].map(([mode,label])=>`<button data-run="${mode}" ${s.job?'disabled':''}>${label}</button>`).join('')}</div><p class="hint">${journeyMode?'每次专注结束，读一段主角刚刚经历的故事。':'25分钟对应150/200清醒分钟；睡眠另计。七天停在完整窗口末端。可以从上次保存的窗口继续。'}</p></section>`:'')+`<section class="panel"><label>专注窗口<select id="session">${s.view.sessions.toReversed().map(r=>`<option value="${r.sequence}">#${r.sequence} · ${date(r.from)}—${date(r.until)}</option>`).join('')}</select></label><div id="story">${s.view.sessions.length?'正在读取事实与故事…':'运行一次专注后显示真实生活记录。'}</div></section>`;
  if(!s.view.sessions.length)return;const sequence=s.sequence??s.view.sessions.at(-1).sequence;$('#session').value=sequence;
  if(journeyMode){
    const recap=await api(`/experiments/${id}/recap?sequence=${sequence}`);
    if(!current())return;
    s.sequence=sequence;
    $('#story').innerHTML=`<article class="story-reading"><p class="hero-recap">${esc(recap.text)}</p></article>
      ${recap.refs.length?`<details><summary>这段经历的依据</summary>${refs(recap.refs)}${recap.source?`<p>${esc(({local_model:"本机模型已按事实校验",controlled:"按事实生成",controlled_fallback:"本机模型未返回有效结果，使用事实原文"})[recap.source])}</p>`:""}</details>`:''}
      ${recap.companions.map(p=>`<button data-ask="${esc(p.id)}">问问${esc(p.name)}之前做了什么</button>`).join('')}<div id="npc-answer" aria-live="polite"></div>${s.page==='stories'?'<button id="next-clock">回到专注计时</button>':''}`;
    return;
  }
  const [w,m]=await Promise.all([api(`/experiments/${id}/story?sequence=${sequence}`),journeyMode?null:api(`/experiments/${id}/metrics`)]);if(!current())return;const row=m?.windows.find(w=>w.sequence===sequence);s.sequence=sequence;
  $('#story').innerHTML=`<p class="${row?.noNewStreak>=3?'pending':'hint'}">清醒 ${w.awakeMinutes} 分钟 / 日历 ${w.calendarMinutes} 分钟${row?` · 首次语义 ${row.newFacts} · 重复 ${row.repeated} · 连续无新信息 ${row.noNewStreak} 窗`:''} · 事实核验 ${w.errors.length?'FAIL':'PASS'}</p><div class="story-reading"><p class="eyebrow">RULE_CAUSAL_SIMULATION / CONTROLLED TEXT</p><h2>${esc(w.story.title)}</h2>${storyParagraphs(w)}</div>${journeyChanges(w)}<div class="split"><section><h3>真实变化</h3>${w.story.changes.map(x=>`<p>${esc(x.text)} ${refs([x.ref])}</p>`).join('')||'无新增重要变化'}<h3>记忆</h3>${w.story.memories.map(x=>`<p>${esc(x.text)} ${refs([x.ref])}</p>`).join('')||'无新增记忆'}</section><section><h3>状态与未完成计划</h3><p>${esc(place(w.story.current.location))} · ${money(w.story.current.cashCents)}</p>${w.story.next.map(x=>`<p>${esc(x.text)} ${refs([x.ref])}</p>`).join('')||'暂无具体后续计划'}</section></div><details><summary>三人生活事件 · ${w.facts.length}条</summary>${w.facts.map(fact).join('')}</details><details><summary>本窗已提交决策 · ${w.decisions.length}次</summary>${w.decisions.map(r=>`<p>${date(r.time)} · ${esc(person(r.actor))} · ${esc(r.decision.reason)} ${refs([r.id])}</p>`).join('')}</details><p class="hint">${c().journeyRevision===3?'回顾取自本窗结束时已保存的记录。':'受控事实文字；不是正式M4。生活丰富性与人物真实感等待产品评审。'}</p>`;return;
 }
 if(s.page==='events'){$('#content').innerHTML=`<section class="panel"><div class="controls"><label>记录类型<select id="kind"><option value="scene_opened">真实场景入口</option><option value="opportunity_created">机会来源</option><option value="decision">候选与评分</option>${journeyMode?'<option value="personality_changed">MBTI 倾向变化</option>':''}<option value="fact">生活事件</option><option value="plan_paused">计划暂停</option><option value="plan_resumed">计划恢复</option><option value="plan_missed">错过机会</option><option value="plan_declined">拒绝机会</option><option value="plan_abandoned">放弃计划</option></select></label><button id="filter">读取</button></div><div id="rows"></div><button id="more" hidden>下一页</button></section>`;await events();return;}
 if(s.page==='metrics'){const m=await api(`/experiments/${id}/metrics`);if(!current())return;$('#content').innerHTML=`${journeyMode?'':`<section class="panel"><h2>同初始条件A/B</h2><label>对照实验<select id="compare-experiment">${s.experiments.filter(e=>e.id!==s.id).map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label><button id="compare">核对条件并比较</button><div id="comparison"></div></section>`}<section class="panel"><h2>连续体验检查</h2>${waitSummary(m.diagnostics.time)}<p class="pending">最长连续无新信息：${m.maxBlank} 窗；首次语义 ${m.uniqueFacts}；重复正文窗口 ${m.repeatedStories}。HUMAN_PENDING</p><p>${esc(m.note)}</p><div class="split"><section><h3>生活领域实际分钟</h3>${json(m.domains)}<h3>实际活动分钟</h3>${json(m.durations)}<h3>等待原因（次数/分钟）</h3>${json(m.waitReasons)}</section><section><h3>机会来源与结果</h3>${json(m.sources)}${json(m.opportunityStates)}</section></div><h3>生活机会诊断</h3>${json(m.diagnostics.opportunities)}<h3>空间与时间诊断</h3><p>清醒 ${m.diagnostics.time.awakeMinutes} 分钟；通勤 ${(m.diagnostics.time.commuteRatio*100).toFixed(1)}%；通勤与等待 ${(m.diagnostics.time.commuteAndWaitRatio*100).toFixed(1)}%。</p><details><summary>每日行程、重复往返与约定冲突</summary>${json(m.diagnostics.time)}</details><h3>故事体验诊断</h3><p>长期发展 ${m.diagnostics.story.longTermTransitions.length} 次；阅读仍需人工验收。</p>${json(m.diagnostics.story)}<h3>0/1/2/3/4+连续无新信息分布</h3>${json(m.distribution)}</section><section class="panel"><table><thead><tr><th>窗口</th><th>动作</th><th>目标片段</th><th>新语义</th><th>重复</th><th>连续空洞</th><th>检查</th></tr></thead><tbody>${m.windows.map(w=>`<tr class="${w.noNewStreak>=4?'risk-row':''}"><td>#${w.sequence}<br>${date(w.from)}</td><td>${w.actions}</td><td>${w.goalProgress}</td><td>${w.newFacts}</td><td>${w.repeated}</td><td>${w.noNewStreak}</td><td><button data-window="${w.sequence}">读故事</button><button data-context="${w.sequence}">完整上下文</button></td></tr>`).join('')}</tbody></table></section>`;}
}
function waitSummary(time){
 const w=time.waitEpisodes;
 if(!w)return '';
 const share=time.awakeMinutes?100*w.totalMinutes/time.awakeMinutes:0;
 return `<h3>主角连续等待</h3><p>共 ${w.count} 段，累计 ${w.totalMinutes} 分钟，占清醒时间 ${share.toFixed(1)}%。单段中位数 ${w.median} 分钟，P95 为 ${w.p95} 分钟，最长 ${w.max} 分钟。</p><table><thead><tr><th>连续等待至少</th><th>段数</th><th>这些段合计</th></tr></thead><tbody>${w.thresholds.map(t=>`<tr><td>${t.minutes} 分钟</td><td>${t.count}</td><td>${t.totalMinutes} 分钟</td></tr>`).join('')}</tbody></table><p class="hint">跨专注窗连续计时，吃饭、行动或睡眠会结束一段等待。各行按门槛分别统计。</p>`;
}
function personalityHtml(initial,current){
  const axes=[['E','I'],['N','S'],['F','T'],['P','J']];
  const type=values=>axes.map(([a,b])=>values[a]===50?'·':values[a]>50?a:b).join('');
  return `<details><summary>MBTI 倾向 · ${type(current)}</summary><p>初始 ${type(initial)} → 当前 ${type(current)}</p>${axes.map(([a,b])=>`<p>${a}/${b} · ${a} 倾向 ${initial[a].toFixed(2)}% → ${current[a].toFixed(2)}%</p>`).join('')}</details>`;
}
function storyParagraphs(w){
  const position=w.thread?w.story.paragraphs.findIndex(p=>p.refs.length===1 && p.refs[0]===w.thread.outcome.ref):-1;
  const text=w.story.paragraphs.map((p,i)=>i===position?journeyThreadHtml(w.thread):
    `<button class="story-paragraph" data-refs="${esc(p.refs.join(','))}" aria-label="第${i+1}段：查看依据">${esc(p.text)}<small>${esc(p.refs.join('、'))} · 查看事实 →</small></button>`).join('');
  return position<0?text+journeyThreadHtml(w.thread):text;
}
function journeyThreadHtml(thread){
  if(!thread)return '';
  const passage=(label,item)=>item?`<p><strong>${label}</strong>　${esc(item.text)} ${refs([item.ref])}</p>`:'';
  return `<section class="journey-thread"><h3>这件事的来龙去脉</h3>${passage('此前',thread.origin)}${passage('本窗发生',thread.outcome)}${passage('窗末待办',thread.followUp)}</section>`;
}
function journeyChanges(window){
  if(!window.attributeChanges)return '';
  const facts=new Map(window.facts.map(row=>[row.id,row.fact]));
  const changes=window.attributeChanges.map(row=>{
    const source=row.causes[0],cause=facts.get(source);
    return '<li>'+esc(person(row.actor))+' · '+esc(s.boot.attributeLabels[row.data.attribute])+' '+esc(row.data.before)+' → '+esc(row.data.after)+' · '+esc(cause?.title??'查看来源')+' '+refs([source])+'</li>';
  });
  return '<details><summary>本窗人物属性变化（'+changes.length+'）</summary>'+(changes.length?'<ul>'+changes.join('')+'</ul>':'<p>本窗没有属性变化。</p>')+'</details>';
}
function fact(r){const f=r.fact;return `<article class="life-event"><small>${date(f.from)}—${date(f.until)} · ${esc(place(f.location))}</small><h3>${esc(f.title)}</h3><p>参与：${f.actors.map(person).map(esc).join('、')}${f.affected?.length?'；受到影响：'+f.affected.map(person).map(esc).join('、'):''}</p><p>${esc(f.text)}</p>${refs([r.id,...r.causes])}</article>`;}
async function inspect(ids){const token=++proofEpoch,id=s.id;$('#inspector').hidden=false;$('#inspector-content').textContent='正在读取权威记录…';const rows=await Promise.all(ids.map(ref=>api(`/experiments/${id}/records/${encodeURIComponent(ref)}`)));if(token!==proofEpoch||id!==s.id)return;$('#inspector-content').innerHTML=rows.map(v=>v.initial?`<h2>初始配置依据</h2>${json(v)}`:`<h2>${esc(v.record.fact?.title??v.record.opportunity?.subject??v.record.kind)}</h2><p>${esc(v.record.id)} · ${date(v.record.time)} · ${esc(person(v.record.actor))}</p><h3>因果来源</h3>${refs(v.record.causes)}${v.record.fact?fact(v.record):''}${v.record.decision?`<h3>当时全部候选与评分因子</h3>${json(v.record.decision)}`:''}<details open><summary>完整已提交记录</summary>${json(v.record)}</details>`).join('<hr>');}
async function events(append=false){const token=++epoch,id=s.id,kind=$('#kind').value,rows=await api(`/experiments/${id}/records?kind=${kind}&cursor=${append?s.cursor??0:0}`);if(token!==epoch||id!==s.id)return;const html=rows.items.map(r=>`<button class="record" data-ref="${r.id}"><small>${date(r.time)}</small><b>${esc(person(r.actor))}</b><span>${esc(r.fact?.title??r.opportunity?.subject??r.decision?.reason??r.data?.reason??r.kind)}</span><small>${r.id}</small></button>`).join('');if(append)$('#rows').insertAdjacentHTML('beforeend',html);else $('#rows').innerHTML=html;s.cursor=rows.nextCursor;$('#more').hidden=!rows.nextCursor;}
function field(label,path,value){return `<label>${label}<input type="number" data-field="${path}" value="${value}"></label>`;}
function form(){s.draft??=structuredClone(s.view?.experiment.config??presets()[0].config);const d=s.draft,p=d.people[s.actor],w=d.worlds[s.actor];$('#content').innerHTML=`<section class="panel"><div class="formgrid"><label>背景<select id="preset">${presets().map(p=>`<option value="${p.id}" ${d.background===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label><label>实验名称<input id="name" value="${esc(s.draftName??((journeyMode?'旅途 · ':'Life32 · ')+presets().find(p=>p.id===d.background).name))}"></label><label>人物<select id="actor">${d.people.map((p,i)=>`<option value="${i}" ${i===s.actor?'selected':''}>${p.name}</option>`).join('')}</select></label></div><h3>${esc(p.name)} · ${p.gender==='male'?'男':'女'} · ${p.age}岁</h3><div class="formgrid">${field('初始资金（分）',`worlds.${s.actor}.initialCashCents`,w.initialCashCents)}${field('月收入（分）',`worlds.${s.actor}.monthlyIncomeCents`,w.monthlyIncomeCents)}${['E','N','F','P'].map(k=>field(k+'（0–100，实际参与评分）',`people.${s.actor}.personality.${k}`,p.personality[k])).join('')}</div><h3>实际参与评分的兴趣</h3><div class="controls">${['摄影','写作','园艺','探索','社交','工作'].map(i=>`<label><input type="checkbox" data-interest="${i}" ${p.interests.includes(i)?'checked':''}>${i}</label>`).join('')}</div><h3>版本化实验规则</h3><div class="controls">${[['continuity','第三轮连续生活（关闭为第二轮对照）'],['feedback','作品反馈'],['social','NPC社交来源'],['environment','旧花圃与书店班次来源']].filter(([k])=>!journeyMode||k!=='continuity').map(([k,t])=>`<label><input type="checkbox" data-rule="${k}" ${d.rules[k]?'checked':''}>${t}</label>`).join('')}</div><div class="formgrid">${field('社交需求阈值与重试冷却（清醒需求/日历分钟）','rules.socialAfter',d.rules.socialAfter)}${field('每人每日工作需求上限（60倍数，≤480）','rules.maxWorkMinutes',d.rules.maxWorkMinutes)}${field('近期同类活动惩罚系数','rules.repetitionWeight',d.rules.repetitionWeight)}${field('已收到反馈的优先分','rules.feedbackWeight',d.rules.feedbackWeight)}</div><p class="hint">${journeyMode?'保存后从桥边书店出发。每次推进会接续上一个窗口。':'保存为独立实验。地图、角色姓名、路人、开放职业系统尚未开放编辑；Seed不作为行为随机按钮。规则数值是可配置实验，非已确认产品政策。'}</p><button id="save" class="primary">保存新实验</button></section>`;}
async function poll(){try{const j=await api('/jobs/'+s.job.id);s.job=j;$('#job-status').hidden=false;$('#job-status').innerHTML=`${esc(j.status)} <progress max="1" value="${j.progress}"></progress> ${j.commits}次提交 <button id="cancel">暂停后续窗口</button>`;if(['running','queued'].includes(j.status)){setTimeout(poll,400);return;}s.job=null;s.sequence=null;$('#job-status').hidden=true;if(journeyMode && j.status==='completed' && j.request.mode==='focus'){s.page='stories';$('#notice').hidden=true;}else notice(j.message,j.status==='failed');await load();}catch(e){s.job=null;$('#job-status').hidden=true;notice(e.message,true);}}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{if(b.id==='start-clock' || b.id==='stop-clock'){await clockCommand(b.id==='start-clock'?'start':'cancel');return;}if(b.id==='next-clock'){await go('run');return;}if(b.dataset.ask){
   const token=++proofEpoch,id=s.id,sequence=s.sequence;
   const answer=await api(`/experiments/${id}/recap?sequence=${sequence}&ask=${encodeURIComponent(b.dataset.ask)}`);
   if(token===proofEpoch && id===s.id && sequence===s.sequence && $('#npc-answer'))$('#npc-answer').innerHTML=`<p>${esc(answer.text)} ${answer.ref?refs([answer.ref]):''}</p>`;
   return;
  }if(b.dataset.page){await go(b.dataset.page);return;}if(b.dataset.ref||b.dataset.refs){await inspect((b.dataset.refs??b.dataset.ref).split(','));return;}if(b.dataset.window){s.sequence=Number(b.dataset.window);await go('stories');return;}if(b.dataset.context){const token=++proofEpoch,id=s.id,ctx=await api(`/experiments/${id}/context?sequence=${b.dataset.context}`);if(token!==proofEpoch||id!==s.id)return;$('#inspector').hidden=false;$('#inspector-content').innerHTML='<h2>实际决策与前后状态</h2>'+json(ctx);return;}if(b.dataset.run){s.rate=Number($('#rate').value);s.job=await api(`/experiments/${s.id}/jobs`,{mode:b.dataset.run,realMinutes:journeyMode?s.minutes:25,rate:s.rate});await render();void poll();return;}
 switch(b.id){case'compare':{const id=s.id,value=await api('/compare?a='+id+'&b='+$('#compare-experiment').value);if(id===s.id)$('#comparison').innerHTML=comparisonHtml(value);break;}case'new-experiment':s.draft=journeyMode&&s.view?{...structuredClone(c()),localActivities:true,journeyRevision:presets()[0].config.journeyRevision}:null;s.draftName=null;s.actor=0;await go('config');break;case'close-inspector':++proofEpoch;$('#inspector').hidden=true;break;case'filter':await events();break;case'more':await events(true);break;case'refresh':await list();await load();break;case'cancel':await api('/jobs/'+s.job.id+'/cancel',{});notice('当前原子窗口结束后停止。');break;case'save':if(s.job)throw Error('先暂停当前运行再创建实验');{const exp=await api('/experiments',{name:$('#name').value,config:s.draft,...(s.id?{parent:s.id}:{})});s.id=exp.id;s.sequence=null;await list();await load();await go('run');notice('实验已创建。');}break;}
 }catch(err){notice(err.message,true);}});
document.addEventListener('change',async e=>{const el=e.target;try{if(el.dataset.field){const keys=el.dataset.field.split('.'),last=keys.pop();let x=s.draft;for(const k of keys)x=x[k];x[last]=Number(el.value);s.draft.worlds[s.actor].personality=structuredClone(s.draft.people[s.actor].personality);return;}if(el.dataset.interest){const p=s.draft.people[s.actor];p.interests=el.checked?[...p.interests,el.dataset.interest]:p.interests.filter(x=>x!==el.dataset.interest);return;}if(el.dataset.rule){s.draft.rules[el.dataset.rule]=el.checked;return;}switch(el.id){case'experiment-select':if(s.job){el.value=s.id;throw Error('先暂停当前任务');}s.id=el.value;s.sequence=null;s.draft=null;await load();break;case'session':s.sequence=Number(el.value);await render();break;case'preset':s.draft=structuredClone(presets().find(p=>p.id===el.value).config);s.draftName=null;s.actor=0;form();break;case'actor':s.actor=Number(el.value);form();break;case'name':s.draftName=el.value;break;case'focus-minutes':s.minutes=Number(el.value);if($('#time-left'))$('#time-left').textContent=timeText();break;case'rate':s.rate=Number(el.value);break;}}catch(err){notice(err.message,true);}});
try{s.boot=await api('/bootstrap');await list();if(!s.id){$('#experiment-meta').textContent='选择人物背景并创建实验';await go('config');}else await load();}catch(e){notice(e.message,true);}

function comparisonHtml(value){const a=value.a,b=value.b,labels={personal:'个人生活',health:'身体活动与休息',career:'工作与职业实践',social:'社交与共同事务',creative:'创作与修订',exploration:'探索与观察',maintenance:'环境维护',move:'移动',waiting:'等待'},rows=[['最长无新信息窗口',a.maxBlank,b.maxBlank],['语义重复率',(a.semanticRepeatRate*100).toFixed(1)+'%',(b.semanticRepeatRate*100).toFixed(1)+'%'],...Object.keys(labels).map(k=>[labels[k]+'（分钟）',a.domains[k]??0,b.domains[k]??0])];return '<p>共同日历区间 '+date(a.from)+'—'+date(value.until)+'；只变更continuity规则。A为当前实验，B为选择的对照。</p><table><thead><tr><th>指标</th><th>A · 当前</th><th>B · 对照</th></tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table><details><summary>完整共同区间数据与事实引用</summary>'+json(value)+'</details>';}
