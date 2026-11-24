import {localMinute} from '../domain/time.ts';
import {offer32} from './sources.ts';
import type {Config32,State32,Emit32,Opportunity32} from './types.ts';

const careerTopics=['旧书分类与库存核对','交接记录与差错复核','独立管理一段值班的检查清单'];
export function developmentGenerate(c:Config32,s:State32,emit:Emit32):void {
 for(const p of c.people){
  const d=s.development![p.id]!,w=s.worlds[p.id]!;
  for(const path of ['career','garden'] as const){
   const interested=path==='career'?(p.interests.includes('工作')||p.direction==='settled'):p.interests.includes('园艺');
   if(!interested)continue;
   const id=`life-${path}-${p.id}`;
   if(!s.goals.some(g=>g.id===id))s.goals.push({id,actor:p.id,text:path==='career'?'从实际值班发展到能独立核对交接':'用实际照料与收成检验节水养护办法',level:'direction',status:'active',source:'initial:'+p.id,progress:0,target:3});
   const level=path==='career'?d.careerLevel:d.gardenLevel;
   const source=path==='career'?d.careerSource:d.gardenSource;
   const ready=path==='career'?level<3&&d.workMinutes>=[60,240,480][level]!:level===0?s.history.some(h=>h.actor===p.id&&h.kind==='water'):level===1;
   if(!ready||s.opportunities.some(o=>o.actor===p.id&&o.objectId===`life:${path}:${level}`&&['pending','active','paused'].includes(o.status)))continue;
   // A personal record can be studied at home; this does not invent a paid course or wages.
   const local=c.worlds.find(v=>v.character.id===p.id)!.places.find(v=>v.id===w.locationId)!;
   const minute=localMinute(s.time,c.worlds[0]!.timezoneOffsetMinutes);
   const studyLocation=minute>=local.openMinute&&minute+90<=local.closeMinute?w.locationId:p.home;
   offer32(s,emit,{actor:p.id,participants:[p.id],kind:path==='garden'&&level===1?'garden_project':'study',subject:path==='career'?careerTopics[level]!:level===0?'根据浇水记录研究覆盖保水办法':'铺设花圃覆盖材料并建立养护对照',location:path==='garden'&&level===1?c.garden.location:studyLocation,available:s.time,deadline:Number.MAX_SAFE_INTEGER,minutes:90,objectId:`life:${path}:${level}`,source:'consequence',rule:'life32r3/development/1',sourceRefs:[source],sourceKey:`life:${p.id}:${path}:${level}`,semantic:`life:${path}:${level}`});
  }
 }
}

export function developmentDescription(c:Config32,s:State32,o:Opportunity32):{text:string;changes:string[]}|null {
 const p=c.people.find(p=>p.id===o.actor)!,d=s.development![o.actor]!;
 if(o.kind==='study')return{text:o.objectId?.includes('career')?`${p.name}带着此前${d.workMinutes}分钟值班留下的问题，整理了“${o.subject}”的实用笔记。下一次值班可以承担这一级别的核对责任；学习本身没有报酬。`:`${p.name}翻看自己实际浇水的记录，花90分钟研究覆盖保水办法，决定把材料费用和后续观察时间一起纳入安排。方案写好了，花圃还没有发生改变。`,changes:[o.objectId?.includes('career')?'岗位知识与可承担责任提升':'形成待实施的节水养护方案']};
 if(o.kind==='garden_project')return{text:`${p.name}按自己整理的方案，花18元购入覆盖材料，并在花圃用90分钟完成铺设和记录。覆盖层开始减缓水分流失；是否能支撑后续收成，还要经过真实生长时间检验。`,changes:['实付18元覆盖材料费用','花圃蒸发速率降低','保留后续收成检验目标']};
 if(o.kind==='harvest'&&d.gardenLevel===2&&s.time-d.gardenSince>=c.rules.growthMinutes/2)return{text:`${p.name}采收了铺设覆盖材料后成熟的香草。从铺设到今天已过去${s.time-d.gardenSince}分钟，期间花圃经历了实际生长与照料。这次收成记入养护对照，节水方案从纸上的安排变成了经过一轮生长检验的办法；不能据此断言以后不再需要浇水。`,changes:['收成记录','花圃进入下一轮生长','完成覆盖养护的首轮生长检验']};
 return null;
}

export function developmentFinish(c:Config32,s:State32,o:Opportunity32,ref:string,duration:number,complete:boolean,emit:Emit32):void {
 const d=s.development![o.actor]!;
 if(o.kind==='work'){d.workMinutes+=duration;d.careerSource=ref;}
 if(!complete)return;
 if(o.kind==='water')d.gardenSource=ref;
 let path:'career'|'garden'|null=null,before=0;
 if(o.kind==='study'&&o.objectId?.startsWith('life:career:')){path='career';before=d.careerLevel;d.careerLevel++;d.careerSource=ref;}
 if(o.kind==='study'&&o.objectId==='life:garden:0'){path='garden';before=d.gardenLevel;d.gardenLevel=1;d.gardenSource=ref;}
 if(o.kind==='garden_project'){path='garden';before=d.gardenLevel;d.gardenLevel=2;d.gardenSince=s.time;d.gardenSource=ref;}
 if(o.kind==='harvest'&&d.gardenLevel===2&&s.time-d.gardenSince>=c.rules.growthMinutes/2){path='garden';before=d.gardenLevel;d.gardenLevel=3;d.gardenSource=ref;}
 if(!path)return;
 const after=path==='career'?d.careerLevel:d.gardenLevel,g=s.goals.find(g=>g.id===`life-${path}-${o.actor}`);
 if(g){g.progress=after;g.status=after===3?'completed':'active';g.source=ref;}
 emit({kind:'life_goal_progress',actor:o.actor,causes:[ref],data:{path,before,after,goal:g?.id??'',effect:path==='career'?'responsibility_unlocked':after===2?'moisture_retention_changed':after===3?'harvest_observed':'implementation_available'}});
}
