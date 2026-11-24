import assert from 'node:assert/strict';
import {allTypes} from './beijing-mbti.ts';
import {personalThreads} from './roaming-backgrounds.ts';
import {morningAfter} from './roaming-mornings.ts';
import type {RoadDay} from './roaming-types.ts';

const dayMinutes = 1440;
const awakePerDay = 960;
const perFocus = 25 * 8;
const revealMinutes = [96,288,480,672,864];
// Calendar offsets count minutes from 07:00 in the fictional local calendar.
const firstMorning = Date.UTC(2026,5,1,7);
export function localStamp(offset:number){
  return new Date(firstMorning + offset * 60000).toISOString().slice(0,16).replace('T',' ');
}

export function renderText(text:string, gender:'男'|'女'){
  return text.replaceAll('{称呼}',gender==='男'?'小伙子':'姑娘');
}

export function buildMonth(type:string, days:RoadDay[], choose?:(day:RoadDay, natural:0|1)=>0|1){
  assert.ok(allTypes.includes(type),'unknown personality');
  assert.equal(days.length,30,'expected thirty days');
  const personal = personalThreads[type]!;
  const choices:number[] = [];
  const recollections:Record<number,{day:number;choice:number;next:0|1;opening:string}> = {};
  const events = days.flatMap((day,index)=>{
    assert.equal(day.day,index+1,'days must be in calendar order');
    if(day.day===18 && choices[0]===1){
      recollections[18]={day:1,choice:1,next:1,opening:'阿宁发来一张照片。那张留给明年的明信片还夹在日历里，角上多了个她画的小碗。小禾看了两眼，今天也想留点什么给以后的人。'};
    }
    if(day.day===22 && choices[4]===0){
      recollections[22]={day:5,choice:0,next:1,opening:'在武汉替人守过棋摊以后，小禾路过别人的棋盘，总会停下来看看。这天早上，一枚摆在棋盘上的瓶盖把小禾留在了桌边。'};
    }
    const memory = recollections[day.day];
    const natural = type.includes(day.axis[0]!) ? 0 : 1;
    const choice = memory?.next ?? choose?.(day,natural) ?? natural;
    choices.push(choice);
    const branch = day.branches[choice];
    assert.equal(branch.beats.length,revealMinutes.length);
    const scenes = branch.beats.map((text,i)=>{
      assert.ok(text.trim().length>0,'missing story text');
      const minute = revealMinutes[i]!;
      const city=i>=2 ? day.city.split('→').at(-1)! : day.city;
      return {id:[day.day,choice,i+1].join('.'),day:day.day,city,label:branch.label,
        at:index*dayMinutes+minute,awake:index*awakePerDay+minute,
        text:[i===0 && day.day===1 ? personal[0] : '',i===0 && memory ? memory.opening : '',text].filter(Boolean).join('\n\n')};
    });
    if(index>0){
      const previousChoice=choices[index-1]!;
      const city=days[index-1]!.city.split('→').at(-1)!;
      scenes.unshift({id:['wake',day.day,previousChoice,choice].join('.'),day:day.day,city,label:'次晨',
        at:index*dayMinutes+8,awake:index*awakePerDay+8,text:morningAfter(index,previousChoice,choice)});
    }
    if(day.day===15 || day.day===27){
      const minute = 762; // 19:42, after the evening scene and before bed.
      scenes.push({id:type+'.'+day.day,day:day.day,city:day.city,label:'北京来的消息',
        at:index*dayMinutes+minute,awake:index*awakePerDay+minute,text:personal[day.day===15?1:2]});
      scenes.sort((a,b)=>a.at-b.at);
    }
    return scenes;
  });
  const nights = days.map((_,i)=>({from:i*dayMinutes+awakePerDay,until:(i+1)*dayMinutes}));
  const windows = Array.from({length:days.length*awakePerDay/perFocus},(_,i)=>{
    const start = i*perFocus, end = start+perFocus;
    // An exact day boundary ends at bedtime. The next receipt begins after sleep.
    const from = start + Math.floor(start/awakePerDay)*(dayMinutes-awakePerDay);
    const until = end + Math.floor((end-1)/awakePerDay)*(dayMinutes-awakePerDay);
    return {number:i+1,from,until,sleepMinutes:until-from-perFocus,
      events:events.filter(event=>event.awake>start && event.awake<=end)};
  });
  return {type,choices,recollections,windows,nights,until:days.length*dayMinutes};
}
