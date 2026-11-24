import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {allTypes} from '../src/travel-story/beijing-mbti.ts';
import {buildMonth,localStamp,renderText} from '../src/travel-story/roaming-month.ts';
import {firstDays} from '../src/travel-story/roaming-days-01.ts';
import {middleDays} from '../src/travel-story/roaming-days-11.ts';
import {lastDays} from '../src/travel-story/roaming-days-21.ts';

const [flag, target, ...extra] = process.argv.slice(2);
assert.ok(flag==='--out' && target && !extra.length,'usage: node scripts/roaming-month.ts --out <new directory>');
const out = resolve(target);
const days = [...firstDays,...middleDays,...lastDays];
const stories = allTypes.map(type=>buildMonth(type,days));
assert.equal(new Set(stories.map(r=>r.choices.join(''))).size,16);
for(const run of stories){
  assert.deepEqual(buildMonth(run.type,days),run);
  assert.equal(run.windows.length,144);
  assert.ok(run.windows.every(w=>w.events.length && w.until-w.from-w.sleepMinutes===200));
}
mkdirSync(dirname(out),{recursive:true});
mkdirSync(out);
const save = (file:string,data:string)=>writeFileSync(join(out,file),data,{flag:'wx'});
const cards = stories.map(r=>r.windows.map(w=>({
  number:w.number, from:localStamp(w.from),until:localStamp(w.until),sleep:w.sleepMinutes,
  events:w.events.map(e=>({id:e.id,day:e.day,at:localStamp(e.at),city:e.city,text:e.text})),
})));
const books = Object.fromEntries(allTypes.map((type,i)=>[type,cards[i]]));
const template = readFileSync(new URL('./roaming-reader.html',import.meta.url),'utf8');
save('旅居试读.html',template.replace('MONTH_DATA_HERE',()=>JSON.stringify(books).replaceAll('<','\\u003c')));
for(const [i,run] of stories.entries()){
  const paragraphs = ['# '+run.type+' · 离职后的第一个月','',
    '北京时间。每节揭晓一次 25 分钟专注的经历。正文采用女性称呼，试读页可切换。',''];
  for(const card of cards[i]!){
    paragraphs.push('## 第 '+card.number+' 次专注','',card.from+' 至 '+card.until+'（清醒 200 分钟'+
      (card.sleep?'，跨夜免费跳过 8 小时':'')+'）','');
    for(const event of card.events){
      paragraphs.push('**'+event.at+' · '+event.city+(event.id.startsWith('wake.')?' · 次晨':'')+'**','',renderText(event.text,'女'),'');
    }
  }
  save(run.type+'.md',paragraphs.join('\n'));
}
const summary = {
  start:localStamp(0),end:localStamp(stories[0]!.until),timezone:'Asia/Shanghai',
  days:30,awakeMinutes:28800,sleepMinutes:14400,focusMinutes:3600,windowsPerPerson:144,
  nights:stories[0]!.nights.map(n=>({from:localStamp(n.from),until:localStamp(n.until),focusCost:0})),
  routes:stories.map(r=>({type:r.type,initialCash:r.type.endsWith('J')?200000:250000,
    monthlyPassiveIncome:r.type.endsWith('J')?2000:0,choices:days.map((d,i)=>({
      day:d.day,city:d.city,axis:d.axis,path:d.branches[r.choices[i]!]!.label,
      rememberedDay:r.recollections[d.day]?.day ?? null,
    })),windows:r.windows.map(w=>({number:w.number,from:localStamp(w.from),until:localStamp(w.until),
      sleepMinutes:w.sleepMinutes,eventIds:w.events.map(e=>e.id)}))})),
};
save('时间与分支.json',JSON.stringify(summary,null,2)+'\n');
const links = allTypes.map(t=>'['+t+']('+t+'.md)').join(' · ');
save('README.md',['# 离职后的第一个月','','[逐窗试读与分享](旅居试读.html)','',links,'',
  '16 种人格从北京家里出发，先去武汉探望大学同学阿宁，再经长沙、桂林、柳州到贵阳。城市、班次和相遇按小说设定。试读页可改男女称呼，同人格的事件、日期和选择相同。','',
  '虚拟日历为北京时间 2026-06-01 07:00 至 2026-07-01 07:00。每天 07:00 起床，23:00 至次日 07:00 睡眠免费跳过。每次 25 分钟专注推进 200 分钟清醒时间。每人 30 天含清醒 480 小时、睡眠 240 小时，共 144 次专注，折合现实 60 小时。最后一次故事于 6 月 30 日 23:00 结束，最后一夜自动计入日历。','',
  '每条线有 150 个旅途片段、2 次与离职前经历有关的后续，以及 29 个接续昨晚经历的晨间片段。晨间故事按醒来后的实际时间入窗。每窗交付 1 段或多段，同行程允许相遇、共用场景和相同结果。男女不增加剧本数量。','',
  '开局延用稳定收入组 20 万元、月被动收入 2000 元和自主收入组 25 万元、月被动收入 0 元。它们仅作为本次实验的初始设置，本轮没有结算逐笔旅行收支。','',
  '[逐日选择、逐窗时钟、30 次睡眠](时间与分支.json)。运行时离线回放，真人阅读与分享意愿待试读。','',
  '复现命令（指定尚未存在的输出目录）','','`node scripts/roaming-month.ts --out reports/roaming-month/replay`',''].join('\n'));
console.log(JSON.stringify({out,types:stories.length,focusWindows:stories.reduce((n,r)=>n+r.windows.length,0),
  eventsPerPerson:stories[0]!.windows.flatMap(w=>w.events).length,freeNights:summary.nights.length}));
