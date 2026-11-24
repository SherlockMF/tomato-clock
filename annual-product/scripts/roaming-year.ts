import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {allTypes} from '../src/travel-story/beijing-mbti.ts';
import {localStamp,renderText} from '../src/travel-story/roaming-month.ts';
import {simulateYear,yearDate,yearWindows} from '../src/travel-story/roaming-year.ts';
import type {LedgerRow} from '../src/travel-story/year-types.ts';

const [flag,path,...extra]=process.argv.slice(2);
assert.ok(flag==='--out'&&path&&!extra.length,'usage: node scripts/roaming-year.ts --out <new folder>');
const out=resolve(path);
const runs=allTypes.map(type=>simulateYear(type));
for(const r of runs){
  assert.equal(yearWindows(r.events).length,1752);
  assert.deepEqual(r,simulateYear(r.type));
}
mkdirSync(dirname(out),{recursive:true});mkdirSync(out);mkdirSync(join(out,'记录'));
const write=(f:string,body:string)=>writeFileSync(join(out,f),body,{flag:'wx'});
const template=readFileSync(new URL('./roaming-reader.html',import.meta.url),'utf8');
const stories:Record<string,unknown>={};
const rows:string[]=[];
const sum=(list:LedgerRow[])=>list.reduce((s,r)=>s+r.amount,0);
const windowSignatures:string[][]=[];
for(const r of runs){
  let line=0,cash=r.initial.cash,month='';
  const md=['# '+r.type+' · 离职后的第一年','','北京时间。每节是一次 25 分钟专注结束后的正文。',''];
  const windows=yearWindows(r.events);
  const cards=windows.map(w=>{
    const items:string[]=[];
    while(r.ledger[line] && r.ledger[line]!.at<=w.until){
      const row=r.ledger[line++]!;
      items.push(row.kind+' '+(row.amount>0?'+':'')+row.amount+' 元');cash=row.balance;
    }
    const from=localStamp(w.from),until=localStamp(w.until);
    if(month!==until.slice(0,7)){month=until.slice(0,7);md.push('## '+month,'');}
    md.push('### 第 '+w.number+' 次专注','','北京时区　'+from+' 至 '+until+(w.sleep?'　跨夜睡眠 8 小时':'')+'','');
    for(const e of w.events){
      md.push('**'+localStamp(e.at)+' · '+e.city+(e.id.startsWith('wake.')?' · 次晨':'')+'**','',renderText(e.text,'女'),'');
    }
    return {number:w.number,from,until,sleep:w.sleep,account:{items,cash},
      events:w.events.map(e=>({id:e.id,day:e.day,at:localStamp(e.at),city:e.city,text:e.text}))};
  });
  assert.equal(line,r.ledger.length);
  windowSignatures.push(windows.map(w=>w.events.map(e=>e.text).join('\n')));
  stories[r.type]=cards;
  write(r.type+'.md',md.join('\n'));
  write('记录/'+r.type+'.json',JSON.stringify({origin:'北京',start:yearDate(1)+' 07:00',end:yearDate(366)+' 07:00',timezone:'Asia/Shanghai',
    sleep:'23:00–07:00，专注成本0',...r,events:r.events.map(e=>({...e,time:localStamp(e.at)}))},null,1));
  const earned=sum(r.ledger.filter(x=>x.kind==='交付收入')),royalty=sum(r.ledger.filter(x=>x.kind==='授权入账'));
  rows.push('| ['+r.type+']('+r.type+'.md) | '+r.initial.cash+' | '+royalty+' | '+earned+' | '+(-sum(r.ledger.filter(x=>x.amount<0)))+' | '+cash+' | '+r.days.at(-1)!.city+' |');
}
write('年度旅居试读.html',template.replaceAll('离职后的第一个月','离职后的第一年').replace('30 日旅居试读','365 日旅居试读 · 修订版')
  .replace('MONTH_DATA_HERE',()=>JSON.stringify({stories}).replaceAll('<','\\u003c')));
let different=0,total=0;
for(const [i,a] of windowSignatures.entries())for(const b of windowSignatures.slice(i+1)){
  for(let j=0;j<a.length;j++){if(a[j]!==b[j])different++;total++;}
}
const comparable=runs.flatMap(r=>r.weeks).filter(w=>w.withoutGrowth!==null);
const changed=comparable.filter(w=>w.choice!==w.withoutGrowth).length;
write('README.md',['# 离职后的第一年 · 修订版','','[打开年度试读](年度旅居试读.html) · [直接读 ESFP 的七月返程](年度旅居试读.html?type=ESFP&day=37) · [直接读 ISTJ 的最后一天](年度旅居试读.html?type=ISTJ&day=365)','',
  '16 种人格各走完 2026-06-01 07:00 至 2027-06-01 07:00 的 365 个虚拟日，以北京时间计。每人 1752 次专注（现实 730 小时），合计 28032 个窗口。每天 23:00 至 07:00 睡眠免费。每一个窗口都有带时间的正文。所有路线从北京出发，性别只影响称呼。','',
  '六月沿用月版的出发故事，并写入离职缘由与北京家人的来电。七月续写预付的贵阳单间或已经买票的武汉晚饭。再往后，每人读到 44 个七日生活小章，其中有专为这个人物写的一至两章。小禾会自行取舍，带着错过的约会、接下的工作和留下的牵挂搬去下一站。各线会共用场景。等权两两比较，同一窗的正文有 '+different+' / '+total+' 组不同；这个数字只计算字面差异。','',
  '## 人物与收支（人民币元）','','| 完整故事 | 初始资金 | 授权收入 | 交付收入 | 全年支出 | 年末余额 | 最后所在城市 |','| --- | ---: | ---: | ---: | ---: | ---: | --- |',...rows,'',
  '费用是离线小说的设定。第一次月版没有实际余额，年度版从六月一日开始补建日账，无法从旧版倒推出唯一的六月底余额。日常按餐食、当地交通与杂项合并，住宿按使用的夜晚结算。借住免费。稳定组每月 1 日入账 2000 元，自主组凭交付结算。贵阳预付 14 晚和回武汉的已购车票各自只入一次账。地名、路程和虚构票价用于故事。','',
  '初始人格终身可追溯。四项偏好会随有依据的具体行动缓慢变化，之后参与章次和分支选择。固定当周机会、此前行动等条件，只换回初始偏好，'+comparable.length+' 次可对照的周内取舍中有 '+changed+' 次会选另一条。专写的情节不计入这一反事实比较。不同收入和支出还会改变能否腾出时间接活、选择哪班车。角色设定用于小说，数值仅供独立核对。','',
  '在试读页可展开当前窗收支。每份人物正文同名的 JSON 放在“记录”目录，含逐笔流水、逐月余额、性格变化来源、项目状态、每日所在城市与带时间的正文。真人阅读与实际分享仍待验证。','',
  '复现命令：`node scripts/roaming-year.ts --out reports/roaming-year/new-run`',''].join('\n'));
console.log(JSON.stringify({out,types:runs.length,windows:16*1752,changed,different,total}));
