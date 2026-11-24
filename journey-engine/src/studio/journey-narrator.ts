import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {hash32,type Evidence32} from '../life32r3/store.ts';
import {opportunity32} from '../life32r3/sources.ts';
import {renderScene,type Scene} from './journey-reader.ts';

export interface ParagraphPlan {lead:string[];end:string[];refs:string[]}

export function paragraphPlan(e:Evidence32,scene:Scene):ParagraphPlan{
  const recap=renderScene(e,scene),cut=recap.text.indexOf('。')+1;
  const plan={lead:[cut?recap.text.slice(0,cut):recap.text],end:[cut?recap.text.slice(cut):''],refs:recap.refs};
  const f=scene.row?.fact;
  if(!f || scene.context)return plan;
  // Preserve names, times, quotations and amounts from the committed sentence.
  const variants:Record<string,[string,string][]> = {
    work:[['实际收到','领到了']],
    journey_message:[['把亲历的','把自己经历的'],['读完','看完'],['消息已经送达，对方有空时可以回复。','消息送到了，接下来要等对方有空回信。'],['花时间写下自己的回应，把回信发了出去。','写了回信，把回应发给了对方。']],
    contact:[['发来邀请，约在','捎来邀请，想约在'],['邀请已经发出，对方尚未答应。','邀请发出去了，还要等对方答复。']],
    social:[['彼此说了最近的生活安排','互相聊了聊最近的安排']],
    collaborate:[['把两份记录合到了一起','一起整理了各自带来的记录']],
    review:[['有了读者的回音','收到了读者的反馈']],
    journey_clear:[['把岸边拦网里的漂枝捞出、分筐运离','捞起岸边拦网里的漂枝，分筐运走']],
  };
  for(const [from,to] of variants[f.kind]??[]){
    for(const choices of [plan.lead,plan.end]){
      if(choices[0]!.includes(from))choices.push(choices[0]!.replace(from,to));
    }
  }
  if(!f.semantic || !f.progress || !f.actors.includes(e.config.hero))return plan;
  const o=opportunity32(e.after,f.opportunity);
  if(!o)return plan;
  const name=e.config.people.find(p=>p.id===e.config.hero)!.name;
  const place=e.config.worlds[0]!.places.find(p=>p.id===f.location)!.name;
  const book=e.after.journey?.world.books.find(b=>b.id===o.objectId);
  if(book && ['journey_collect','journey_mend','journey_deliver'].includes(f.kind)){
    const title='《'+book.title+'》';
    if(f.kind==='journey_collect')plan.lead.push('在'+place+'清点还书箱时，'+name+'把'+title+'收进了行囊。');
    if(f.kind==='journey_mend')plan.lead.push(title+'的书脊松了。'+name+'在'+place+'重新穿好线，把散页装回书里。');
    if(f.kind==='journey_deliver')plan.lead.push(name+'从外地带回的'+title+'，终于交到了'+place+'的收书人手里。');
  }
  if(f.kind==='journey_survey'){
    const levels=f.text.match(/上次记录是(\d+)格，这次是(\d+)格/);
    if(levels)plan.lead.push(name+'在'+place+'把水尺和旧记录对了一遍。旧记录是'+levels[1]+'格，眼下是'+levels[2]+'格。');
  }
  if(f.kind==='journey_fieldnote')plan.lead.push(name+'把半小时留给了'+place+'的河岸。');
  if(f.kind==='observe')plan.lead.push(name+'花半小时在'+place+'观察'+o.subject+'，记下了眼前的样子。');
  if(f.kind==='create')plan.lead.push('在'+place+'，'+name+'把先前的观察整理成了作品，题材是“'+o.subject+'”。');
  if(f.kind==='gather'){
    const other=e.config.people.find(p=>p.id!==e.config.hero && f.actors.includes(p.id));
    if(other)plan.lead.push(name+'和'+other.name+'在'+place+'见了面。');
  }
  // A fact can have only one safe wording, especially an unfinished action.
  // The model may shorten a conclusion only when the omitted sentence is editorial.
  const cuttable=['这次观察有了可供整理的具体材料。','先前写下的观察，现在也能给来这里的人看了。'];
  if(cuttable.includes(plan.end[0]!))plan.end.push('');
  return plan;
}

export function checkedParagraph(plan:ParagraphPlan,output:unknown):string{
  assert.ok(output && typeof output==='object' && !Array.isArray(output));
  assert.deepEqual(Object.keys(output).sort(),['end','lead']);
  const {lead,end}=output as Record<string,unknown>;
  assert.ok(typeof lead==='string' && plan.lead.includes(lead));
  assert.ok(typeof end==='string' && plan.end.includes(end));
  return lead+end;
}

export async function localParagraph(plan:ParagraphPlan,port:number):Promise<unknown>{
  assert.ok(Number.isInteger(port) && port>0 && port<=65535);
  const rewrites=(options:string[])=>[...options.slice(1),options[0]!];
  const leads=rewrites(plan.lead),ends=rewrites(plan.end);
  const numbered=(options:string[])=>options.map((text,index)=>({index,text}));
  const indices=(options:string[])=>({type:'integer',enum:options.map((_,i)=>i)});
  const schema={type:'object',properties:{lead:indices(leads),end:indices(ends)},required:['lead','end'],additionalProperties:false};
  const prompt='你是中文旅途日记的编辑。读者刚刚结束专注。事实底稿：'+plan.lead[0]+plan.end[0]+
    '\n从核准的备选中为 lead 和 end 分别挑一句，使人物、动作和后果读起来连贯。有同义表达时优先选自然口语，只有改写损伤清晰度时才照录底稿。只返回两句各自的整数编号，保留后果。'+
    '\n备选：'+JSON.stringify({lead:numbered(leads),end:numbered(ends)})+'\n日记 JSON：';
  const response=await fetch('http://127.0.0.1:'+port+'/completion',{method:'POST',redirect:'error',signal:AbortSignal.timeout(90000),
    headers:{'content-type':'application/json'},body:JSON.stringify({prompt,json_schema:schema,n_predict:48,temperature:0,seed:19})});
  if(!response.ok)throw Error('local model unavailable');
  const raw=await response.json() as {content?:string;stop_type?:string};
  if(raw.stop_type==='limit' || typeof raw.content!=='string')throw Error('incomplete response');
  const ids=JSON.parse(raw.content);
  assert.ok(ids && typeof ids==='object' && !Array.isArray(ids));
  assert.deepEqual(Object.keys(ids).sort(),['end','lead']);
  assert.ok(Number.isInteger(ids.lead) && ids.lead>=0 && ids.lead<leads.length);
  assert.ok(Number.isInteger(ids.end) && ids.end>=0 && ids.end<ends.length);
  return {lead:leads[ids.lead],end:ends[ids.end]};
}

export class JourneyNarrator {
  readonly db:DatabaseSync;
  readonly pending=new Map<string,Promise<{text:string;source:string}>>();
  readonly generate:(p:ParagraphPlan)=>Promise<unknown>;
  constructor(root:string,generate:(p:ParagraphPlan)=>Promise<unknown>){
    this.generate=generate;this.db=new DatabaseSync(join(root,'narrations.sqlite'),{timeout:5000});
    this.db.exec('CREATE TABLE IF NOT EXISTS paragraphs(key TEXT PRIMARY KEY, payload TEXT NOT NULL)');
  }
  async render(e:Evidence32,scene:Scene,experiment:string){
    const base=renderScene(e,scene),plan=paragraphPlan(e,scene);
    if(plan.lead.length===1 && plan.end.length===1)return {...base,source:'controlled'};
    const key=hash32(['journey-paragraph-2',experiment,e.receipt.sequence,e.digest,plan]);
    const stored=this.db.prepare('SELECT payload FROM paragraphs WHERE key=?').get(key) as {payload:string}|undefined;
    if(stored){
      try{return {...base,text:checkedParagraph(plan,JSON.parse(stored.payload)),source:'local_model'};}
      catch{this.db.prepare('DELETE FROM paragraphs WHERE key=? AND payload=?').run(key,stored.payload);}
    }
    const existing=this.pending.get(key);
    if(existing)return {...base,...await existing};
    const task=(async()=>{
      try{
        const output=await this.generate(plan);
        checkedParagraph(plan,output);
        this.db.prepare('INSERT OR IGNORE INTO paragraphs VALUES(?,?)').run(key,JSON.stringify(output));
        const saved=this.db.prepare('SELECT payload FROM paragraphs WHERE key=?').get(key) as {payload:string};
        return {text:checkedParagraph(plan,JSON.parse(saved.payload)),source:'local_model'};
      }catch{return {text:base.text,source:'controlled_fallback'};}
    })();
    this.pending.set(key,task);
    try{return {...base,...await task};}finally{this.pending.delete(key);}
  }
  async close(){await Promise.allSettled(this.pending.values());this.db.close();}
}
