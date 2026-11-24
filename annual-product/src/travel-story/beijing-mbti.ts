import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {Personality} from '../domain/types.ts';
import {backgrounds} from './beijing-mbti-backgrounds.ts';
import {scenes} from './beijing-mbti-script.ts';
import type {Option,Scene} from './beijing-mbti-types.ts';

export const allTypes = [...'IE'].flatMap(a => [...'SN'].flatMap(b =>
  [...'TF'].flatMap(c => [...'JP'].map(d => a+b+c+d))));

type EconomicGroup = 'J'|'P';
interface Transaction {
  index: number;
  date: string;
  kind: 'expense'|'travel'|'earned'|'passive';
  amount: number;
  balance: number;
  source: string;
}

const dates = ['2026-05-30','2026-05-31','2026-06-01'];
function localTime(day:string, minutes:number){
  const clock = [Math.floor(minutes/60),minutes%60].map(n=>String(n).padStart(2,'0')).join(':');
  return day+'T'+clock+':00+08:00';
}

function profile(type:string):Personality {
  const axis = (letter:string)=>type.includes(letter)?65:35;
  return {E:axis('E'),N:axis('N'),F:axis('F'),P:axis('P')};
}

function compareText(a:string,b:string){return a<b?-1:a>b?1:0;}

type DecisionEvidence={id:string;score:number;continuityFacts:string[];priorPractice:number;stableKey:string};
export function compareCandidates(a:DecisionEvidence,b:DecisionEvidence){
  return b.score-a.score || b.continuityFacts.length-a.continuityFacts.length ||
    b.priorPractice-a.priorPractice || compareText(a.stableKey,b.stableKey) || compareText(a.id,b.id);
}

export function rankOptions(options:Option[],type:string,flags:Set<string>,skills:Record<string,number>,cash:number,index=0,journey=1){
  return options.map(option=>{
    const blocked:string[]=[];
    for(const flag of option.requires??[])if(!flags.has(flag))blocked.push('缺少 '+flag);
    for(const flag of option.excludes??[])if(flags.has(flag))blocked.push('已发生 '+flag);
    if((option.cost??0)>cash)blocked.push('资金不足');
    const matches=[...option.preferences].filter(letter=>type.includes(letter));
    const misses=option.preferences.length-matches.length;
    const preferenceScore=(matches.length-misses)*3;
    const practiced=option.uses ? (skills[option.uses]??0) : 0;
    const skillScore=Math.min(practiced,3)*2;
    // A sitting limits which event was available. Merely attending it confers no preference.
    const continuityFacts=(option.requires??[]).filter(flag=>flag!=='secondSitting'&&flags.has(flag)).sort();
    const priorPractice=option.practice?Math.min(skills[option.practice]??0,3):0;
    const stableKey=createHash('sha256').update(JSON.stringify([type,journey,index,option.id])).digest('hex');
    return {id:option.id,title:option.title,score:preferenceScore+skillScore,
      preferenceScore,skillScore,matches,blocked,continuityFacts,priorPractice,stableKey};
  }).sort((a,b)=>compareText(a.id,b.id));
}

function validateScene(scene:Scene,index:number){
  const requiredCity=index<=4?'北京':index===5?'在途':'武汉';
  assert.equal(scene.city,requiredCity,'city/time mismatch');
  assert.ok(scene.options.length,'empty scene');
  assert.equal(new Set(scene.options.map(o=>o.id)).size,scene.options.length,'duplicate option');
  for(const option of scene.options){
    assert.ok(option.id&&option.title&&option.text,'missing prose');
    for(const pair of ['EI','SN','TF','JP']){
      assert.ok([...option.preferences].filter(letter=>pair.includes(letter)).length<=1,'ambiguous preference');
    }
    assert.match(option.preferences,/^[EISNTFJP]*$/);
    for(const value of [option.cost??0,option.pay??0]){
      assert.ok(Number.isSafeInteger(value)&&value>=0,'invalid money');
    }
    if(option.pay)assert.ok(option.requires?.length,'payment needs prior project facts');
  }
}

export function simulate(input:string, overrides:{economicGroup?:EconomicGroup;script?:Scene[];journey?:number}={}){
  const type=input.trim().toUpperCase();
  assert.ok(allTypes.includes(type),'invalid MBTI');
  const journey=overrides.journey??1;
  assert.ok(Number.isInteger(journey)&&journey>=1&&journey<=999,'invalid journey');
  const script=overrides.script??scenes;
  const economicGroup=overrides.economicGroup??(type.endsWith('J')?'J':'P');
  assert.ok(economicGroup==='J'||economicGroup==='P','invalid economic group');
  const stable=economicGroup==='J';
  const initial={name:'小禾',gender:'女',city:'北京',background:backgrounds[type]!,
    cash:stable?200000:250000,monthlyIncome:stable?2000:0,personality:profile(type),
    flags:stable?['license']:['portfolio','inquiry']};
  if(journey%2===0)initial.flags.push('secondSitting');
  assert.ok(initial.background,'missing personal history');
  assert.equal(script.length,12,'expected twelve focus windows');
  const ledger:Transaction[]=[];
  const flags=new Set(initial.flags);
  const skills:Record<string,number>={};
  let balance=initial.cash;
  const windows=script.map((scene,i)=>{
    const index=i+1, day=dates[Math.floor(i/4)]!;
    const start=localTime(day,540+(i%4)*200),end=localTime(day,740+(i%4)*200);
    validateScene(scene,index);
    const transactions:Transaction[]=[];
    const post=(kind:Transaction['kind'],amount:number,source:string,date:string)=>{
      assert.ok(amount!==0 && Number.isSafeInteger(amount) && balance+amount>=0,'invalid posting');
      balance+=amount;
      const item={index,date,kind,amount,balance,source};
      ledger.push(item);
      transactions.push(item);
    };
    // The month boundary falls in the skipped overnight interval before this scene.
    if(i>0 && dates[Math.floor((i-1)/4)]!.slice(0,7)!==day.slice(0,7) && initial.monthlyIncome){
      post('passive',initial.monthlyIncome,'既有作品授权协议 '+day.slice(0,7),localTime(day,0));
    }
    if(index===5)post('travel',-450,'北京至武汉实验车票',start);
    const candidates=rankOptions(scene.options,type,flags,skills,balance,index,journey);
    const legal=candidates.filter(c=>!c.blocked.length).sort(compareCandidates);
    const selected=legal[0];
    if(!selected)throw new Error('no legal choice at window '+index+' for '+type);
    const next=legal[1];
    const decisionBasis=!next?'soleEligible':selected.score!==next.score?'score':
      selected.continuityFacts.length!==next.continuityFacts.length?'continuityFacts':
      selected.priorPractice!==next.priorPractice?'priorPractice':'stableKey';
    const option=scene.options.find(o=>o.id===selected.id)!;
    if(option.cost)post('expense',-option.cost,option.id,start);
    if(option.pay)post('earned',option.pay,option.id,end);
    const addedFlags=(option.adds??[]).filter(flag=>!flags.has(flag));
    for(const flag of addedFlags)flags.add(flag);
    if(option.practice)skills[option.practice]=(skills[option.practice]??0)+1;
    return {index,city:scene.city,start,end,focusMinutes:25,awakeMinutes:200,title:option.title,sceneTitle:scene.title,decisionBasis,
      choice:option.id,choiceTitle:option.title,text:option.text,candidates,addedFlags,
      practice:option.practice??null,flags:[...flags],skills:{...skills},balance,transactions};
  });
  return {type,journey,economicGroup,initial,windows,ledger,choices:windows.map(w=>w.choice),
    final:{city:windows.at(-1)!.city,cash:balance,flags:[...flags],skills:{...skills}}};
}

export function replay(run:ReturnType<typeof simulate>){
  assert.deepEqual(run,simulate(run.type,{economicGroup:run.economicGroup,journey:run.journey}),'story replay mismatch');
}
