import {readFileSync} from 'node:fs';
import {allTypes} from '../travel-story/beijing-mbti.ts';
import {simulateYear,yearWindows} from '../travel-story/roaming-year.ts';
import type {JourneyPreference} from '../travel-story/roaming-year.ts';
import {localStamp} from '../travel-story/roaming-month.ts';
import {StudioError} from './http.ts';

interface Receipt {
  number:number; from:string; until:string; sleep:number;
  account:{items:string[];cash:number};
  events:{id:string;day:number;at:string;city:string;text:string}[];
}

let books:Record<string,Receipt[]>|undefined;

// Use the accepted reader edition, including its exact event grouping and balances.
export function annualBook(type:string):Receipt[] {
  if(!allTypes.includes(type))throw new StudioError(404,'unknown_type','找不到这条旅程');
  if(!books){
    const path=new URL('../../reports/roaming-year/beijing-365d-revised/年度旅居试读.html',import.meta.url);
    const raw=readFileSync(path,'utf8');
    const payload=/<script type="application\/json" id="books">([\s\S]*?)<\/script>/.exec(raw);
    if(!payload)throw new Error('年度出版稿缺少正文');
    const data=JSON.parse(payload[1]!) as {stories:Record<string,Receipt[]>};
    for(const key of allTypes)if(data.stories[key]?.length!==1752)throw new Error('年度出版稿窗数不完整 '+key);
    books=data.stories;
  }
  return books[type]!;
}

export function annualJourney(type:string,input:unknown){
  if(!allTypes.includes(type))throw new StudioError(404,'unknown_type','找不到这条旅程');
  if(!Array.isArray(input)||input.length>1752*4)throw new StudioError(400,'invalid_preferences','偏好记录无效');
  const preferences:JourneyPreference[]=[];
  let previous=0;
  for(const item of input){
    if(!item || typeof item.letter!=='string' || !/^[EISNTFJP]$/.test(item.letter) ||
        !Number.isInteger(item.from) || item.from<1 || item.from<previous || item.from>1752)
      throw new StudioError(400,'invalid_preferences','偏好方向或生效时点无效');
    previous=item.from;
    preferences.push({letter:item.letter,from:item.from});
  }
  const run=simulateYear(type,preferences);
  const windows=yearWindows(run.events);
  const sources=new Map(windows.flatMap(w=>w.events.map(e=>[e.id,{number:w.number,at:e.at}] as const)));
  const changes=run.changes.map(change=>{
    const event=sources.get(change.source);
    if(!event)throw new Error('人格变化缺少故事依据 '+change.source);
    return {...change,number:event.number,at:localStamp(event.at)};
  }).sort((a,b)=>a.at.localeCompare(b.at));
  // Without personal directions the browser reads the accepted, published book.
  if(!preferences.length)return {initial:run.initial.traits,changes};
  let row=0,cash=run.initial.cash;
  const cards:Receipt[]=windows.map(w=>{
    const items:string[]=[];
    while(row<run.ledger.length && run.ledger[row]!.at<=w.until){
      const entry=run.ledger[row++]!;
      items.push(entry.kind+' '+(entry.amount>0?'+':'')+entry.amount+' 元');
      cash=entry.balance;
    }
    return {number:w.number,from:localStamp(w.from),until:localStamp(w.until),sleep:w.sleep,
      account:{items,cash},events:w.events.map(e=>({...e,at:localStamp(e.at)}))};
  });
  return {initial:run.initial.traits,changes,cards};
}
