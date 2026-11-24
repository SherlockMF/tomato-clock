import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomInt} from 'node:crypto';
import {localParagraph,checkedParagraph,type ParagraphPlan} from '../src/studio/journey-narrator.ts';

interface Sample {day:number;window:number;realMinutes:number;text:string;plan:ParagraphPlan}
interface Run {seed:number;rate?:number;samples:Sample[]}
const [six,eight,out,port,edition='M4']=process.argv.slice(2);
assert.ok(six && eight && out && port && /^[\p{L}\d-]+$/u.test(edition));
const read=(file:string)=>JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,'')) as Run;
const runs=[read(six),read(eight)];
assert.ok(runs[0]!.rate===6 && (runs[1]!.rate??8)===8 && runs[0]!.seed===runs[1]!.seed);
const groups=[];
for(const day of [10,30,100]){
  for(const run of runs){
    const selected=run.samples.filter(s=>s.day===day && s.realMinutes===25).slice(0,3);
    assert.equal(selected.length,3);
    const passages=[];
    for(const s of selected){
      const model=s.plan.lead.length+s.plan.end.length>2;
      const text=model?checkedParagraph(s.plan,await localParagraph(s.plan,Number(port))):s.text;
      passages.push({window:s.window,refs:s.plan.refs,text,source:model?'local_model':'controlled'});
    }
    groups.push({day,rate:run.rate??8,passages});
  }
}
for(let i=groups.length-1;i>0;i--){const j=randomInt(i+1);[groups[i],groups[j]]=[groups[j]!,groups[i]!];}
const key=groups.map((g,i)=>({group:String.fromCharCode(65+i),...g}));
const md=['# 知夏的旅途 · 匿名试读','',
  '假设你刚结束一次 25 分钟专注，打开一小段知夏的近况。每组是三次相邻的专注，请按顺序读。两位读者请各自填写一份，读完再交流。','',
  '每组各打五项 1～5 分。因果可信、关心人物、愿意再专注一次看下文、细节与信息量合适，这四项越高越好。重复感单独计分，1 表示很少重复，5 表示重复明显。','',
  ...key.flatMap(g=>['## '+g.group+' 组','',...g.passages.flatMap((p,i)=>[(i+1)+'. '+p.text,'']),
    '因果可信 __　重复感 __　关心人物 __　继续专注意愿 __　细节与信息量 __','',
    '最想知道的后续，或最想略过的一句：________________','']),
  '可以直接按“组别＋五个数字＋一句感受”回传。',''];
writeFileSync(join(out,edition+'匿名试读.md'),md.join('\n'),{flag:'wx'});
writeFileSync(join(out,edition+'试读核对表.json'),JSON.stringify(key,null,2)+'\n',{flag:'wx'});
